import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0052_pol.sql');
const MIGRATION_COMM = resolve(HERE, '../../../supabase/migrations/0039_comm.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-POL-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  // ⚠️ `'hr'` aparece também como domain_key de comm/hr/shift/train/perf; o
  // `module_id` `'pol',` é único no seed (a lição do finder do hr).
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'pol',"));
  assert.ok(meu, 'o seed não registra o módulo pol');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo pol contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ o Domain é `hr`, ancorado na linha de RH da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'hr');
    const linha = taxonomia.split('\n').find((l) => l.includes('Admissão') && l.includes('Demissão'));
    assert.ok(linha, 'a linha de capacidades do Domain RH sumiu da Taxonomia');
  });

  test('⛔ o schema não tem dado sensível nem enum de fato de tenant', () => {
    const semStrings = migrationCode.replace(/'[^']*'/g, "''");
    assert.doesNotMatch(semStrings, /cpf|ssn|\brg\b|salary|salario|payroll|bank_|iban|health/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+pol\./i);
  });

  test('⛔ sem distribuição, sem assinatura eletrônica, sem anexo', () => {
    assert.doesNotMatch(migrationCode, /email|whatsapp|push_|sms/i);
    assert.doesNotMatch(migrationCode, /signature|assinatura_eletronica|docusign/i);
    assert.doesNotMatch(migrationCode, /attachment|file_/i);
  });

  test('⭐ archived é terminal — não há par que saia de archived', () => {
    const corpo = migrationCode.split('pol.allowed_transition')[1]?.split('$$;')[0] ?? '';
    assert.doesNotMatch(corpo, /\(\s*'archived'\s*,/);
  });

  test('⭐⭐ a ciência é única POR VERSÃO — presente no schema', () => {
    assert.match(migrationCode, /pol_acks_once_per_version unique \(version_id, user_id\)/);
  });

  test('⭐ as ciências são imutáveis — trigger presente', () => {
    assert.match(migrationCode, /pol_acks_immutable/);
    assert.match(migrationCode, /before update or delete on pol\.acknowledgements/);
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

  test('consumes é VAZIO — nenhum handler de Políticas nesta onda (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0052_pol.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-POL-SPEC.md não existe');
  });

  /**
   * ⭐⭐ O DIVERGE, assinado nos dois arquivos: o comm dá ciência por
   * DOCUMENTO (unique notice_id,user_id); o pol dá ciência por VERSÃO
   * (unique version_id,user_id). Se um dos lados mudar, este teste
   * obriga a re-perguntar o contraste.
   */
  test('⭐⭐ o contraste comm×pol: ciência por documento × ciência por versão', () => {
    const comm = readFileSync(MIGRATION_COMM, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(comm, /comm_acks_once unique \(notice_id, user_id\)/, 'o comm deixou de dar ciência por documento — re-pergunte');
    assert.match(migrationCode, /pol_acks_once_per_version unique \(version_id, user_id\)/);
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
    const seeded = jsonBlockContaining('pol.policy.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('pol.version.published') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(pol\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
