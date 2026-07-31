import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0080_capa.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-CAPA-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

// ⚠️ O cartão do capa no seed é a ÚNICA peça que este módulo NÃO cria (o seed é
// arquivo compartilhado, editado pelo dono). Enquanto o cartão não entra, o
// describe "o seed transcreve" é PULADO — os testes de contrato do manifesto
// passam sozinhos; a transcrição passa a ser conferida quando o dono seedar.
const temCartao = sql
  .split(/insert into core\.module_registry/)
  .some((b) => b.includes("'capa',"));

function blocoDoModulo(): string {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'capa',"));
  assert.ok(meu, 'o seed não registra o módulo capa (cartão adicionado pelo dono)');
  return meu.slice(0, meu.indexOf('on conflict'));
}

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo().replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo capa contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é DOMAIN `quality`, ancorado na linha de Qualidade da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal((MANIFEST.taxonomy as { domain: string }).domain, 'quality');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('CAPA') && l.includes('Auditorias'));
    assert.ok(linha, 'a linha de capacidades de Qualidade sumiu da Taxonomia');
    const listadas = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades de Qualidade na Taxonomia`,
      );
    }
  });

  test('⭐ a chave de domínio bate com a store-taxonomy (a seção Qualidade existe)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(store.includes("key: 'quality'"), 'store-taxonomy.ts não tem a chave quality');
  });

  test('⛔ o TIPO é CHECK, não enum — action_type é text com CHECK dos dois valores', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+capa\./i);
    assert.match(migrationCode, /action_type\s+text/);
    assert.match(migrationCode, /action_type in \('corrective', 'preventive'\)/);
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
    assert.ok(existsSync(MIGRATION), '0080_capa.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-CAPA-SPEC.md não existe');
  });
});

describe(
  'o seed transcreve o manifesto fielmente',
  { skip: temCartao ? false : 'o cartão do capa ainda não está no seed (adicionado pelo dono)' },
  () => {
    test('o seed registra este módulo, com esta versão, nome e resumo', () => {
      const bloco = blocoDoModulo();
      assert.ok(bloco.includes(`'${MANIFEST.version}'`));
      assert.ok(bloco.includes(MANIFEST.name));
      assert.ok(bloco.includes(MANIFEST.summary));
    });

    test('⭐ a taxonomia DOMAIN é a mesma nos dois (domain_key)', () => {
      const bloco = blocoDoModulo();
      assert.ok(bloco.includes(`'${MANIFEST.taxonomy.layer}'`));
      assert.ok(bloco.includes(`'${(MANIFEST.taxonomy as { domain: string }).domain}'`));
      assert.ok(bloco.includes('domain_key'));
    });

    test('as capacidades do seed são exatamente as do manifesto', () => {
      const seeded = jsonBlockContaining('canonicalName') as { key: string }[];
      assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
    });

    test('as permissões do seed são exatamente as do manifesto', () => {
      const seeded = jsonBlockContaining('capa.action.manage') as { key: string }[];
      assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    });

    test('os eventos emitidos do seed são exatamente os do manifesto', () => {
      const seeded = jsonBlockContaining('capa.action.opened') as { type: string }[];
      assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
    });

    test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
      const code = sql.replace(/--[^\n]*/g, '');
      const concedidas = [...code.matchAll(/\('(capa\.[a-z.]+)'\)/g)].map((m) => m[1]);
      assert.deepEqual(concedidas, []);
    });
  },
);
