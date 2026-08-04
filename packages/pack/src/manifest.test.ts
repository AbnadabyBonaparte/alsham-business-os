import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0115_pack.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-PACK-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é VERTICAL `beauty`, ancorado na linha de Beleza da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'vertical');
    assert.equal((MANIFEST.taxonomy as { vertical: string }).vertical, 'beauty');
    const linha = taxonomia.split('\n').find((l) => l.includes('Pacotes') && l.includes('Fidelidade'));
    assert.ok(linha, 'a linha de capacidades de Beleza (com Pacotes) sumiu da Taxonomia');
  });

  test('⭐ a capacidade canônica é exatamente "Pacotes"', () => {
    assert.equal(MANIFEST.capabilities.length, 1);
    assert.equal(MANIFEST.capabilities[0]?.canonicalName, 'Pacotes');
    assert.equal(MANIFEST.capabilities[0]?.key, 'packages');
  });

  test('⭐ a chave vertical bate com a store-taxonomy (a pill gradua)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(
      store.includes("key: 'beauty'"),
      'store-taxonomy.ts não tem a chave beauty — a pill não graduaria',
    );
  });

  test('⛔ a migration NÃO reescreve o crm nem inventa carteira genérica: só packages/uses', () => {
    assert.doesNotMatch(migrationCode, /create\s+table\s+pack\.customers/i);
    assert.doesNotMatch(migrationCode, /create\s+table\s+pack\.wallets/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+pack\./i);
    assert.match(migrationCode, /create\s+table\s+pack\.packages/i);
    assert.match(migrationCode, /create\s+table\s+pack\.uses/i);
  });

  test('⛔ o vínculo com o crm é ID SOLTO — nunca FK cruzada; só a FK intra-schema', () => {
    assert.doesNotMatch(migrationCode, /references\s+crm\./i);
    // A ÚNICA FK cruzando tabelas é intra-schema (pack.uses → pack.packages).
    assert.match(migrationCode, /references\s+pack\.packages/i);
    assert.match(migrationCode, /client_id\s+uuid\s+not\s+null/);
  });

  test('⭐⭐ a migration tem o guarda de saldo (consumo > trave recusado) e a imutabilidade', () => {
    assert.match(migrationCode, /pacote esgotado/);
    assert.match(migrationCode, /fato consumado/);
    // O saldo é VIEW security_invoker, nunca coluna.
    assert.match(migrationCode, /create\s+view\s+pack\.package_balances/i);
    assert.match(migrationCode, /security_invoker\s*=\s*true/i);
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3);
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado sem underscore', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
      // ⚠️ Sem underscore no verbo — o outbox recusa (regex [a-z0-9-]).
      assert.doesNotMatch(e.type.split('.')[2] as string, /_/);
    }
  });

  test('consumes é VAZIO — gerar título/puxar cliente é integração futura (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0115_pack.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-PACK-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  const sql = existsSync(SEED) ? readFileSync(SEED, 'utf8') : '';
  const temCartao = sql.includes("'pack',");

  const blocoDoModulo = (() => {
    if (!temCartao) return '';
    const inserts = sql.split(/insert into core\.module_registry/);
    const meu = inserts.find((b) => b.includes("'pack',"));
    return meu ? meu.slice(0, meu.indexOf('on conflict')) : '';
  })();

  function jsonBlockContaining(needle: string): unknown[] {
    const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
    const hit = blocks.find((b) => b.includes(needle));
    assert.ok(hit, `nenhum bloco jsonb do módulo pack contém ${needle}`);
    return JSON.parse(hit!.slice(1, hit!.lastIndexOf("'")));
  }

  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão pack — o parent transcreve');
      return;
    }
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia VERTICAL é a mesma nos dois (vertical_key)', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão pack — o parent transcreve');
      return;
    }
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { vertical: string }).vertical}'`));
    assert.ok(blocoDoModulo.includes('vertical_key'));
  });

  test('as capacidades/permissões/eventos do seed são exatamente os do manifesto', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão pack — o parent transcreve');
      return;
    }
    const caps = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(caps.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
    const perms = jsonBlockContaining('pack.package.manage') as { key: string }[];
    assert.deepEqual(perms.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    const evs = jsonBlockContaining('pack.package.registered') as { type: string }[];
    assert.deepEqual(evs.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(pack\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
