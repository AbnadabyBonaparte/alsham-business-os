import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0099_creditbalance.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-CREDITBALANCE-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'creditbalance',"));
  assert.ok(meu, 'o seed não registra o módulo creditbalance');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo creditbalance contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é VERTICAL `energy`, ancorado na linha de Energia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'vertical');
    assert.equal((MANIFEST.taxonomy as { vertical: string }).vertical, 'energy');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('Créditos de compensação') && l.includes('Comercialização e leads'));
    assert.ok(linha, 'a linha de capacidades de Energia sumiu da Taxonomia');
    // A capacidade canônica do módulo está nessa linha (capacidades separadas por '·').
    const capacidades = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        capacidades.includes(cap.canonicalName),
        `a capacidade ${cap.canonicalName} não está na linha de Energia`,
      );
    }
  });

  test('⭐ a chave vertical bate com a store-taxonomy (a pill gradua)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(
      store.includes("key: 'energy'"),
      'store-taxonomy.ts não tem a chave energy — a pill não graduaria',
    );
  });

  test('⛔ o schema é livro imutável — sem status, sem allowed_transition', () => {
    // A direção mora no credit_type; nenhum ciclo de vida nasce aqui.
    assert.doesNotMatch(migrationCode, /create\s+or\s+replace\s+function\s+creditbalance\.allowed_transition/i);
    assert.doesNotMatch(migrationCode, /status\s+text/i);
    assert.match(migrationCode, /check\s*\(\s*credit_type\s+in\s*\(\s*'generated',\s*'consumed'\s*\)\s*\)/i);
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

  test('consumes é VAZIO — nenhum handler de créditos (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0099_creditbalance.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-CREDITBALANCE-SPEC.md não existe');
  });
});

describe('o schema do banco sustenta o módulo', () => {
  test('⭐ tem creditbalance.entries e o CHECK do credit_type (generated/consumed)', () => {
    assert.match(migrationCode, /create\s+table\s+creditbalance\.entries/i);
    assert.match(migrationCode, /check\s*\(\s*credit_type\s+in\s*\(\s*'generated',\s*'consumed'\s*\)\s*\)/i);
  });

  test('⭐ quantity_kwh tem CHECK > 0 — o sinal é o TIPO, nunca o número', () => {
    assert.match(migrationCode, /quantity_kwh[\s\S]*?check\s*\(\s*quantity_kwh\s*>\s*0\s*\)/i);
  });

  test('⭐ o saldo é a VIEW subscription_balances com security_invoker (nunca coluna)', () => {
    assert.match(migrationCode, /create\s+view\s+creditbalance\.subscription_balances/i);
    assert.match(migrationCode, /security_invoker\s*=\s*true/i);
  });

  test('⭐⭐ o gatilho de imutabilidade recusa update e delete (fato consumado)', () => {
    assert.match(migrationCode, /create\s+trigger\s+creditbalance_entries_immutable/i);
    assert.match(migrationCode, /before\s+update\s+or\s+delete\s+on\s+creditbalance\.entries/i);
    assert.match(migration, /fato consumado/);
  });

  test('⭐ livro imutável: NÃO tem allowed_transition e NÃO tem coluna status', () => {
    assert.doesNotMatch(migrationCode, /allowed_transition/i);
    assert.doesNotMatch(migrationCode, /status\s+text/i);
    assert.doesNotMatch(migrationCode, /updated_at/i);
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia VERTICAL é a mesma nos dois (vertical_key)', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { vertical: string }).vertical}'`));
    assert.ok(blocoDoModulo.includes('vertical_key'));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('creditbalance.entry.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('creditbalance.credit.generated') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(creditbalance\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
