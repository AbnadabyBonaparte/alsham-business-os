import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0036_vis.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-VIS-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

// A lição das guardas: confere-se o CÓDIGO, não a prosa.
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'vis',"));
  assert.ok(meu, 'o seed não registra o módulo vis');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo vis contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ O HOMÔNIMO declarado: "Visitas" existe na Taxonomia em DOIS Domains —
   * no CRM é a visita comercial do vendedor (PRIMA 360); aqui é a PORTARIA,
   * Domain operations (vizinha de *Segurança*). O teste prova que os dois
   * lugares existem e que este módulo ancora no lado certo.
   */
  test('⭐ o Domain é `operations` — e o homônimo do CRM continua onde está', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'operations');
    const linhaOps = taxonomia.split('\n').find((l) => l.includes('Ordens de serviço · Checklist'));
    assert.ok(linhaOps, 'a linha de capacidades do Domain Operações sumiu da Taxonomia');
    assert.ok(linhaOps.includes('Segurança'), 'a vizinhança (Segurança) sumiu da linha de Operações');
    const linhaCrm = taxonomia.split('\n').find((l) => l.includes('CRM · Pipeline'));
    assert.ok(linhaCrm?.includes('Visitas'), 'a Visitas do CRM (a do vendedor) sumiu — re-ancore o homônimo');
  });

  /**
   * ⭐ ANTI-VIÉS com recusa nomeada: nada de crachá/QR/catraca/foto
   * (integração), lista negra (LGPD — fora POR LEI), recorrência — nem enum.
   */
  test('⛔ o schema não tem crachá, lista negra, recorrência nem enum', () => {
    assert.doesNotMatch(migrationCode, /badge|qr_|catraca|turnstile|photo/i);
    assert.doesNotMatch(migrationCode, /blacklist|blocklist|lista_negra|banned/i);
    assert.doesNotMatch(migrationCode, /recurrence|rrule/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+vis\./i);
  });

  test('⭐ os carimbos são do servidor — no CÓDIGO', () => {
    assert.match(migrationCode, /new\.checked_in_at := now\(\)/);
    assert.match(migrationCode, /new\.checked_out_at := now\(\)/);
  });

  test('⭐ o envelope não carrega documento nem contato', () => {
    const payload = migrationCode.split('create or replace function vis.visit_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(!payload.includes('visitor_document'));
    assert.ok(!payload.includes('visitor_contact'));
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3);
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
      assert.match(e.type.split('.')[2] as string, /ed$/);
    }
  });

  test('consumes é VAZIO — ninguém aqui escuta ninguém (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0036_vis.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-VIS-SPEC.md não existe');
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
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.domain}'`));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('vis.visit.register') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('vis.visit.arrived') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(vis\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
