import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0045_bank.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-BANK-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'bank',"));
  assert.ok(meu, 'o seed não registra o módulo bank');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo bank contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ o Domain é `finance`, e Bancos está na linha dele', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
    const linha = taxonomia.split('\n').find((l) => l.includes('Contas a pagar · Contas a receber'));
    assert.ok(linha, 'a linha de capacidades do Domain Financeiro sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(listadas.includes(cap.canonicalName), `${cap.canonicalName} não está na Taxonomia`);
    }
  });

  test('⭐ consumes é VAZIO — SOL ÚNICO: a conciliação é do recon (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('⭐ o módulo NÃO refaz a conciliação — sem parser/mesa no schema', () => {
    assert.doesNotMatch(migrationCode, /\bofx\b|\bcsv\b|reconcil|\bmatch\b/i);
  });

  test('⭐ o saldo é view, nunca coluna; e nada de constraint contra negativo', () => {
    assert.doesNotMatch(migrationCode, /create table[\s\S]*?balance_cents\s+bigint/i);
    assert.match(migrationCode, /create view bank\.balances/);
    assert.match(migrationCode, /security_invoker\s*=\s*true/);
    // ⭐ Nenhuma constraint proíbe saldo/valor negativo do sinal — cheque especial.
    assert.doesNotMatch(migrationCode, /balance_cents\s*>=\s*0/);
  });

  test('⭐ a transferência é atômica: uma função que grava as duas pernas', () => {
    assert.match(migrationCode, /function bank\.transfer\(/);
    // duas inserções de movements dentro da função
    const corpo = migrationCode.slice(migrationCode.indexOf('function bank.transfer('));
    const insercoes = (corpo.slice(0, corpo.indexOf('$$;')).match(/insert into bank\.movements/g) ?? []).length;
    assert.equal(insercoes, 2, 'a transferência deveria gravar exatamente duas pernas');
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

  test('os quatro fatos encomendados existem todos', () => {
    const encomendados = ['account.registered', 'account.archived', 'movement.registered', 'transfer.executed'];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`bank.${f}`), `o fato bank.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 4);
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
    assert.ok(existsSync(MIGRATION), '0045_bank.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-BANK-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('bank.account.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('bank.transfer.executed') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⭐ o seed espelha o consumes VAZIO', () => {
    assert.match(blocoDoModulo, /'\[\]'::jsonb,\s*\n\s*'\[\]'::jsonb,\s*\n\s*'0\.0\.x'/);
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(bank\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
