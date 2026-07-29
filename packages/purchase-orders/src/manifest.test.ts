import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, EVENTS, PERMISSIONS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0017_po.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-PO-SPEC.md');
const sql = readFileSync(SEED, 'utf8');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => /\n\s*'po',/.test(b) || b.includes("'po',\n"));
  assert.ok(meu, 'o seed não registra o módulo po');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo po contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('manifesto po', () => {
  test('id é po (cinto)', () => {
    assert.equal(MANIFEST.id, 'po');
  });

  test('domain procurement', () => {
    assert.equal(MANIFEST.taxonomy.domain, 'procurement');
  });

  test('consumes vazio (Lei 7 + protocolo paralelo)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('três permissões', () => {
    assert.deepEqual(
      MANIFEST.permissions.map((p) => p.key).sort(),
      [PERMISSIONS.orderCancel, PERMISSIONS.orderManage, PERMISSIONS.orderReceive].sort(),
    );
  });

  test('emits alinhados', () => {
    assert.deepEqual(
      MANIFEST.events.emits.map((e) => e.type).sort(),
      Object.values(EVENTS).sort(),
    );
  });

  test('seed espelha emits', () => {
    const seeded = jsonBlockContaining('po.order.registered') as { type: string }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('migration e spec existem', () => {
    assert.match(readFileSync(MIGRATION, 'utf8'), /create schema if not exists po/);
    assert.match(readFileSync(SPEC, 'utf8'), /module_id.*=.*`po`/);
    assert.match(readFileSync(SPEC, 'utf8'), /NÃO CONSTRUÍDO/);
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(po\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(
      concedidas,
      [],
      'o seed concede permissão deste módulo — isso vaza para todos os tenants',
    );
  });
});
