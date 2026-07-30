import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0035_spc.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-SPC-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

// A lição das guardas: confere-se o CÓDIGO, não a prosa.
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'spc',"));
  assert.ok(meu, 'o seed não registra o módulo spc');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo spc contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ A ÂNCORA taxonômica: *Facilities* está na linha de 🏭 Operações; o
   * nome universal da capacidade é "Reserva de espaços" (Condomínios diz
   * "Reserva de áreas comuns"; Hotelaria diz "Reservas" — spec §0). O que o
   * teste PROVA é que a âncora existe e que os verticais citados existem.
   */
  test('⭐ o Domain é `operations`, ancorado em Facilities — com os verticais citados', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'operations');
    const linha = taxonomia.split('\n').find((l) => l.includes('Ordens de serviço · Checklist'));
    assert.ok(linha, 'a linha de capacidades do Domain Operações sumiu da Taxonomia');
    assert.ok(linha.includes('Facilities'), 'a âncora Facilities sumiu da linha de Operações');
    assert.ok(taxonomia.includes('Reserva de áreas comuns'), 'o vertical Condomínios perdeu a capacidade-espelho');
  });

  /**
   * ⭐ ANTI-VIÉS com recusa nomeada: nada de preço/cobrança (integração
   * declarada com o ar), recorrência (cron futuro), aprovação em duas mãos —
   * nem enum. E a física NÃO virou `if`: a exclusion está no schema.
   */
  test('⛔ o schema não tem preço, recorrência, aprovação nem enum — e a física é constraint', () => {
    assert.doesNotMatch(migrationCode, /price|amount_cents|billing_/i);
    assert.doesNotMatch(migrationCode, /recurrence|rrule/i);
    assert.doesNotMatch(migrationCode, /approval|approver/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+spc\./i);
    assert.match(migrationCode, /exclude using gist/);
    assert.match(migrationCode, /where \(status = 'booked'\)/);
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

  test('consumes é VAZIO — a cobrança da reserva é integração declarada (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0035_spc.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-SPC-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('spc.reservation.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('spc.reservation.booked') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(spc\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
