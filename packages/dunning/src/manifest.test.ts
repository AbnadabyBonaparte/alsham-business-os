import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
import { CONSUMED_EVENT_TYPES } from './dun-title.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0027_dun.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-DUN-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'dun',"));
  assert.ok(meu, 'o seed não registra o módulo dun');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo dun contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ o Domain é `finance`, e Cobrança está na linha dele', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
    const linha = taxonomia.split('\n').find((l) => l.includes('Contas a pagar · Contas a receber'));
    assert.ok(linha, 'a linha de capacidades do Domain Financeiro sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(listadas.includes(cap.canonicalName));
    }
    // "Régua" e "dunning" NÃO são vocábulos do mapa — contado, não estimado.
    assert.equal((taxonomia.match(/\br[ée]gua\b/gi) ?? []).length, 0);
    assert.equal((taxonomia.match(/\bdunning\b/gi) ?? []).length, 0);
  });

  /**
   * ⭐⭐ **CONSUMES NÃO É VAZIO — E É O PONTO DO MÓDULO.** A Lei 7 nos dois
   * sentidos: os três consumos declarados têm handler construído
   * (`dun-title.ts`), e o teste confere a lista contra o próprio consumidor.
   */
  test('⭐⭐ os consumos declarados são EXATAMENTE os que o handler cobre', () => {
    const declarados = MANIFEST.events.consumes.map((c) => c.type).sort();
    assert.deepEqual(declarados, [...CONSUMED_EVENT_TYPES].sort());
    assert.equal(declarados.length, 3);
  });

  test('⭐ e o módulo NÃO envia nada — nenhuma coluna/função de envio no schema', () => {
    assert.doesNotMatch(migrationCode, /\bsend\b|\bsmtp\b|whatsapp|\bsms\b/i);
  });

  test('⭐ a régua não virou enum, e o canal é texto livre', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+dun\./i);
    assert.match(migrationCode, /channel\s+text/);
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
      // `left` é passado irregular (leave → left); os demais terminam em `ed`.
      assert.match(e.type.split('.')[2] as string, /(ed|left)$/);
    }
  });

  test('os três fatos encomendados existem todos', () => {
    const encomendados = ['step.executed', 'title.entered', 'title.left'];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`dun.${f}`), `o fato dun.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 3);
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
    assert.ok(existsSync(MIGRATION), '0027_dun.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-DUN-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('dun.ruler.design') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('dun.step.executed') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⭐ o seed espelha os TRÊS consumos — o cartão anuncia o que o handler cobre', () => {
    const seeded = jsonBlockContaining('ar.receivable.registered') as { type: string }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.consumes.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(dun\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
