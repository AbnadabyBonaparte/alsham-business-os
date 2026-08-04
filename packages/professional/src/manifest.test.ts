import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0113_professional.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-PROFESSIONAL-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é VERTICAL `beauty`, ancorado na linha de Beleza da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'vertical');
    assert.equal((MANIFEST.taxonomy as { vertical: string }).vertical, 'beauty');
    const linha = taxonomia.split('\n').find((l) => l.includes('Profissionais') && l.includes('Comissões'));
    assert.ok(linha, 'a linha de capacidades de Beleza (com Profissionais) sumiu da Taxonomia');
  });

  test('⭐ a capacidade canônica é exatamente "Profissionais"', () => {
    assert.equal(MANIFEST.capabilities.length, 1);
    assert.equal(MANIFEST.capabilities[0]?.canonicalName, 'Profissionais');
    assert.equal(MANIFEST.capabilities[0]?.key, 'professionals');
  });

  test('⭐ a chave vertical bate com a store-taxonomy (a pill gradua)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(
      store.includes("key: 'beauty'"),
      'store-taxonomy.ts não tem a chave beauty — a pill não graduaria',
    );
  });

  test('⛔ a migration NÃO reescreve o hr: nenhuma tabela de colaborador', () => {
    assert.doesNotMatch(migrationCode, /create\s+table\s+professional\.employees/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+professional\./i);
    assert.match(migrationCode, /hr_employee_id/);
  });

  test('⛔ o vínculo com o hr é ID SOLTO — nunca FK cruzada', () => {
    assert.doesNotMatch(migrationCode, /references\s+hr\./i);
    assert.match(migrationCode, /hr_employee_id\s+uuid/);
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3);
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado (letra final, sem underscore)', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
      const verbo = e.type.split('.')[2] as string;
      assert.match(verbo, /[a-z]$/);
      // ⚠️ Sem underscore no verbo — o outbox recusa.
      assert.doesNotMatch(verbo, /_/);
    }
  });

  test('consumes é VAZIO — cruzar com hr é integração futura (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0113_professional.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-PROFESSIONAL-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente (verde após o wiring do parent)', () => {
  const sql = existsSync(SEED) ? readFileSync(SEED, 'utf8') : '';
  const temCartao = sql.includes("'professional',");

  const blocoDoModulo = (() => {
    if (!temCartao) return '';
    const inserts = sql.split(/insert into core\.module_registry/);
    const meu = inserts.find((b) => b.includes("'professional',"));
    return meu ? meu.slice(0, meu.indexOf('on conflict')) : '';
  })();

  function jsonBlockContaining(needle: string): unknown[] {
    const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
    const hit = blocks.find((b) => b.includes(needle));
    assert.ok(hit, `nenhum bloco jsonb do módulo professional contém ${needle}`);
    return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
  }

  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão professional — o parent transcreve');
      return;
    }
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia VERTICAL é a mesma nos dois (vertical_key)', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão professional — o parent transcreve');
      return;
    }
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { vertical: string }).vertical}'`));
    assert.ok(blocoDoModulo.includes('vertical_key'));
  });

  test('as capacidades/permissões/eventos do seed são exatamente os do manifesto', () => {
    if (!temCartao) {
      assert.ok(true, '⏭ seed ainda sem cartão professional — o parent transcreve');
      return;
    }
    const caps = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(caps.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
    const perms = jsonBlockContaining('professional.professional.manage') as { key: string }[];
    assert.deepEqual(perms.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    const evs = jsonBlockContaining('professional.professional.registered') as { type: string }[];
    assert.deepEqual(evs.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(professional\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
