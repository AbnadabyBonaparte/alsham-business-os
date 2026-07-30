import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0050_train.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-TRAIN-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  // ⚠️ `'train'` é único no seed (o domain_key dele é 'hr', mas o module_id
  // não colide com hr/shift/perf/pol — só o `hr` precisou desambiguar por nome).
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'train',"));
  assert.ok(meu, 'o seed não registra o módulo train');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo train contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ o Domain é `hr`, ancorado na linha de RH que lista Treinamentos', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'hr');
    const linha = taxonomia.split('\n').find((l) => l.includes('👥 RH'));
    const linhaCapacidades = taxonomia.split('\n').find((l) => l.includes('Admissão') && l.includes('Treinamentos'));
    assert.ok(linha, 'a linha do Domain RH sumiu da Taxonomia');
    assert.ok(linhaCapacidades, 'a linha de capacidades de RH não lista Treinamentos');
  });

  test('⛔ o schema não tem dado sensível (CPF/saúde/banco) nem certificado/storage', () => {
    // Também tira as strings (comentários citam "certificado" de propósito ao
    // declará-lo FORA): o que se proíbe é COLUNA, não a palavra.
    const semStrings = migrationCode.replace(/'[^']*'/g, "''");
    assert.doesNotMatch(semStrings, /cpf|ssn|\brg\b|salary|salario|payroll|bank_|iban|health|certificate|storage_/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+train\./i);
  });

  test('⭐ concluded e cancelled são terminais na turma — nenhum par sai deles', () => {
    const corpo = migrationCode.split('train.allowed_session_transition')[1]?.split('$$;')[0] ?? '';
    assert.doesNotMatch(corpo, /\(\s*'concluded'\s*,/);
    assert.doesNotMatch(corpo, /\(\s*'cancelled'\s*,/);
  });

  test('⭐ completed e cancelled são terminais na inscrição — nenhum par sai deles', () => {
    const corpo = migrationCode.split('train.allowed_enrollment_transition')[1]?.split('$$;')[0] ?? '';
    assert.doesNotMatch(corpo, /\(\s*'completed'\s*,/);
    assert.doesNotMatch(corpo, /\(\s*'cancelled'\s*,/);
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

  test('exatamente os sete fatos do manifesto — nem programa nem edição de turma emitem evento', () => {
    assert.equal(MANIFEST.events.emits.length, 7);
  });

  test('consumes é VAZIO — nenhum handler de Treinamentos nesta onda (Lei 7)', () => {
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
    assert.equal(MANIFEST.id, 'train');
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
    assert.ok(existsSync(MIGRATION), '0050_train.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-TRAIN-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('train.setup.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('train.session.published') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(train\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
