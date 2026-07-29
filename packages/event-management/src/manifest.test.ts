import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0026_evt.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-EVT-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'evt',"));
  assert.ok(meu, 'o seed não registra o módulo evt');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo evt contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ **A DECISÃO DE CANON: Domain `marketing`, capacidade *Eventos* — e
   * NÃO o vertical `events`.** Este é o evento UNIVERSAL; o vertical é o
   * ofício de quem vive de evento. A Taxonomia lista os dois, e o teste
   * confere que a capacidade está na linha do Domain.
   */
  test('⭐ o Domain é `marketing`, e Eventos está na linha dele', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'marketing');
    const linha = taxonomia.split('\n').find((l) => l.includes('Campanhas · Eventos'));
    assert.ok(linha, 'a linha de capacidades do Domain Marketing sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(listadas.includes(cap.canonicalName));
    }
    // E o vertical existe SEPARADO — com o ofício que este módulo recusa.
    assert.match(taxonomia, /🎪 Eventos \(8\)/, 'o vertical Eventos sumiu da Taxonomia');
  });

  /**
   * ⭐ **O id é `evt`, e o motivo se VERIFICA:** "evento" já é o vocabulário
   * do coração da plataforma — contado no core, não estimado.
   */
  test('⭐ o id é `evt` porque `event` já tem dono no Core', () => {
    assert.equal(MANIFEST.id, 'evt');
    const core = readFileSync(
      resolve(HERE, '../../../packages/core/src/events.ts'),
      'utf8',
    );
    assert.match(core, /EventEnvelope/, 'o envelope do Core usa a palavra');
    const schema = readFileSync(
      resolve(HERE, '../../../supabase/migrations/0001_core.sql'),
      'utf8',
    );
    assert.match(schema, /core\.event_outbox/, 'e a caixa de saída também');
  });

  test('⚠️ NÃO é o Módulo 2 — marketing é o Domain, não o id', () => {
    assert.notEqual(MANIFEST.id, 'marketing');
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
      // `held` é passado irregular (hold → held); os demais terminam em `ed`.
      assert.match(e.type.split('.')[2] as string, /(ed|held)$/);
    }
  });

  test('os nove fatos encomendados existem todos', () => {
    const encomendados = [
      'event.registered',
      'event.updated',
      'event.published',
      'event.held',
      'event.cancelled',
      'registration.registered',
      'registration.confirmed',
      'registration.cancelled',
      'registration.attended',
    ];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`evt.${f}`), `o fato evt.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 9);
  });

  test('não declara consumo sem consumidor construído (Lei 7)', () => {
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
    assert.ok(existsSync(MIGRATION), '0026_evt.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-EVT-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('evt.event.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('evt.event.registered') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(evt\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
