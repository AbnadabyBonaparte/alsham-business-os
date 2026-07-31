import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0082_esg.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-ESG-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'esg',"));
  if (!meu) return '';
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo esg contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é DOMAIN `esg`, ancorado na linha de ESG & Sustentabilidade da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal((MANIFEST.taxonomy as { domain: string }).domain, 'esg');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('Inventário de carbono') && l.includes('Relatórios ESG'));
    assert.ok(linha, 'a linha de capacidades de ESG & Sustentabilidade sumiu da Taxonomia');
    const listadas = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades de ESG na Taxonomia`,
      );
    }
  });

  test('⭐ a chave de domínio bate com a store-taxonomy (a seção ESG existe)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(store.includes("key: 'esg'"), 'store-taxonomy.ts não tem a chave esg');
  });

  test('⛔ o schema não cria enum de tipo — a métrica é CHECK, não enum do produto', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+esg\./i);
    assert.match(
      migrationCode,
      /metric_type\s+text\s+not null\s+check\s*\(\s*metric_type in \(\s*'carbon',\s*'water',\s*'energy',\s*'waste'\s*\)\s*\)/i,
    );
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

  test('consumes é VAZIO — sem redeploy do apps/api nesta onda (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(!Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'));
  });

  test('o id do módulo é o prefixo que o cinto de emit_event confere', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(cinto![1], MANIFEST.id);
  });

  test('as constantes tipadas batem com o manifesto', () => {
    assert.deepEqual(Object.values(PERMISSIONS).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    assert.deepEqual(Object.values(EVENTS).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('a migration e a spec do módulo existem', () => {
    assert.ok(existsSync(MIGRATION), '0082_esg.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-ESG-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia DOMAIN é a mesma nos dois (domain_key)', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { domain: string }).domain}'`));
    assert.ok(blocoDoModulo.includes('domain_key'));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('esg.reading.record') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('esg.reading.recorded') as { type: string }[];
    assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const codigo = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...codigo.matchAll(/\('(esg\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
