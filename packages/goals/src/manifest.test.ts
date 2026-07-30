import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0038_goal.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-GOAL-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

// A lição das guardas: confere-se o CÓDIGO, não a prosa.
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'goal',"));
  assert.ok(meu, 'o seed não registra o módulo goal');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo goal contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ O Domain é `bi` — o bloco da LEITURA do negócio, onde *Metas* é
   * capacidade literal. Os HOMÔNIMOS ficam declarados e conferidos: a
   * *Metas* do CRM (o recorte comercial) e os *OKRs* do RH (a cascata,
   * futuro declarado) continuam onde estão.
   */
  test('⭐ o Domain é `bi`, e Metas está na linha dele — com os homônimos no lugar', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'bi');
    const linhaBi = taxonomia.split('\n').find((l) => l.includes('Dashboards · KPIs'));
    assert.ok(linhaBi, 'a linha de capacidades do Domain BI sumiu da Taxonomia');
    const listadas = linhaBi.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(listadas.includes(cap.canonicalName));
    }
    const linhaCrm = taxonomia.split('\n').find((l) => l.includes('CRM · Pipeline'));
    assert.ok(linhaCrm?.includes('Metas'), 'a Metas do CRM (o recorte comercial) sumiu — re-ancore o homônimo');
    const linhaRh = taxonomia.split('\n').find((l) => l.includes('Recrutamento'));
    assert.ok(linhaRh?.includes('OKRs'), 'os OKRs do RH sumiram — re-ancore o homônimo');
  });

  /**
   * ⭐ ANTI-VIÉS com recusa nomeada: nada de cascata OKR, percentual
   * mágico, medição automática — nem enum. A métrica é texto livre.
   */
  test('⛔ o schema não tem cascata, %, medição automática nem enum', () => {
    assert.doesNotMatch(migrationCode, /parent_goal|okr|cascade_/i);
    assert.doesNotMatch(migrationCode, /percent|pct/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+goal\./i);
    assert.match(migrationCode, /metric\s+text\s+not null/, 'a métrica é texto livre');
    assert.match(migrationCode, /create view goal\.goal_progress/, 'o progresso é view');
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
    assert.ok(existsSync(MIGRATION), '0038_goal.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-GOAL-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('goal.goal.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('goal.goal.opened') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(goal\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
