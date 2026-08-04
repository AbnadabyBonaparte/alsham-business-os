import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0109_accred.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-ACCRED-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'accred',"));
  assert.ok(meu, 'o seed não registra o módulo accred');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo accred contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ o vertical é `events`, ancorado na linha do Eventos que lista as duas capacidades', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'vertical');
    assert.equal(MANIFEST.taxonomy.vertical, 'events');
    const linha = taxonomia.split('\n').find((l) => l.includes('🎪 Eventos'));
    const linhaCapacidades = taxonomia
      .split('\n')
      .find((l) => l.includes('Credenciamento') && l.includes('Check-in'));
    assert.ok(linha, 'a linha do Vertical Eventos sumiu da Taxonomia');
    assert.ok(linhaCapacidades, 'a linha de capacidades do Eventos não lista Credenciamento e Check-in');
  });

  test('⭐⭐ DUAS capacidades — Credenciamento E Check-in, os nomes canônicos da Taxonomia', () => {
    assert.equal(MANIFEST.capabilities.length, 2);
    const nomes = MANIFEST.capabilities.map((c) => c.canonicalName).sort();
    assert.deepEqual(nomes, ['Check-in', 'Credenciamento']);
  });

  test('⛔ o schema não cria enum nem tabela de ingresso/pagamento/documento fiscal', () => {
    // Ingresso/pagamento é Lei 3 + canta-siriema (FORA); o vocabulário fica em
    // texto livre. Tira as strings: o que se proíbe é COLUNA/tipo, não a palavra.
    const semStrings = migrationCode.replace(/'[^']*'/g, "''");
    assert.doesNotMatch(semStrings, /create\s+type\s+accred\./i);
    assert.doesNotMatch(semStrings, /ticket|ingresso|payment|pagamento|price|amount_cents|nfce|nfe/i);
  });

  test('⭐ a credencial é active ↔ revoked; o check-in NÃO tem função de transição', () => {
    const corpo = migrationCode.split('accred.allowed_transition')[1]?.split('$$;')[0] ?? '';
    assert.match(corpo, /\(\s*'active'\s*,\s*'revoked'\s*\)/);
    assert.match(corpo, /\(\s*'revoked'\s*,\s*'active'\s*\)/);
    // não há transição de check-in — o ato é imutável, sem ciclo
    assert.doesNotMatch(migrationCode, /allowed_checkin_transition/);
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3);
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado terminando em `ed`', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
      assert.match(e.type.split('.')[2] as string, /ed$/);
    }
  });

  test('exatamente os dois fatos do manifesto — a credencial emitida e o check-in registrado', () => {
    assert.equal(MANIFEST.events.emits.length, 2);
  });

  test('consumes é VAZIO — nenhum handler nesta onda (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(!Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'));
  });

  test('o id do módulo é o prefixo que o cinto de emit_event confere', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(cinto[1], MANIFEST.id);
    assert.equal(MANIFEST.id, 'accred');
  });

  test('⭐ o evento é ID SOLTO — a migration não lê o schema evt (a Lei do Lego)', () => {
    assert.doesNotMatch(migrationCode, /\bevt\./);
    assert.match(migrationCode, /event_id/);
  });

  test('as constantes tipadas batem com o manifesto', () => {
    assert.deepEqual(
      Object.values(PERMISSIONS).sort(),
      MANIFEST.permissions.map((p) => p.key).sort(),
    );
    assert.deepEqual(
      Object.values(EVENTS).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('a migration e a spec do módulo existem', () => {
    assert.ok(existsSync(MIGRATION), '0109_accred.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-ACCRED-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('a taxonomia é a mesma nos dois', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.vertical}'`));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('accred.credential.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('accred.credential.registered') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(accred\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
