import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0023_inv.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-INV-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/** O trecho do seed que registra ESTE módulo — e só ele. Escopo obrigatório. */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'inv',"));
  assert.ok(meu, 'o seed não registra o módulo inv');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo inv contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ O Domain é `operations`, e *Estoque* está listado por extenso na linha
   * de capacidades dele. Se alguém mover a capacidade na Taxonomia, o
   * manifesto para de bater aqui em vez de divergir em silêncio.
   */
  test('⭐ o Domain declarado é `operations`, e Estoque está na linha dele', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'operations');
    const linha = taxonomia.split('\n').find((l) => l.includes('Ordens de serviço · Checklist'));
    assert.ok(linha, 'a linha de capacidades do Domain sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades do Domain na Taxonomia`,
      );
    }
  });

  /**
   * ⚠️ *Almoxarifado* e *Inventário* são capacidades da Taxonomia e NÃO são
   * declaradas — Lei 7. Almoxarifado é multi-depósito ESTRUTURADO (aqui o
   * local é texto livre); inventário é contagem periódica com fechamento
   * (aqui existe só o ajuste avulso).
   */
  test('⚠️ Almoxarifado e Inventário NÃO são declarados — Lei 7', () => {
    const declaradas: readonly string[] = MANIFEST.capabilities.map((c) => c.canonicalName);
    assert.equal(declaradas.includes('Almoxarifado'), false);
    assert.equal(declaradas.includes('Inventário'), false);
    assert.equal(declaradas.length, 1);
  });

  /**
   * ⭐⭐ **O ANTI-VIÉS DO MÓDULO, conferido no schema:** nada de catálogo rico
   * nem de enum de unidade. NCM/EAN/categoria congelariam o fisco e o
   * comércio de um país no schema de todos; um `create type` de unidade
   * congelaria o ofício de um cliente.
   */
  test('⭐ o schema não tem catálogo rico nem enum de unidade', () => {
    // ⚠️ `\b` obrigatório: sem a fronteira, `ean` casa dentro de `boolean` —
    // a mesma lição que as guardas de CI pagaram quatro vezes.
    assert.doesNotMatch(migrationCode, /\b(ncm|ean|gtin|cest)\b/i);
    assert.doesNotMatch(migrationCode, /create\s+type\s+inv\./i);
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3, 'permissão é <módulo>.<recurso>.<ação>');
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3, 'evento é <módulo>.<agregado>.<fato>');
      assert.equal(e.version, 1);
      assert.match(e.type.split('.')[2] as string, /ed$/, 'evento é fato consumado, não pedido');
    }
  });

  test('os quatro fatos encomendados existem todos', () => {
    const encomendados = [
      'item.registered',
      'item.updated',
      'item.archived',
      'movement.registered',
    ];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`inv.${f}`), `o fato inv.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 4);
  });

  test('não declara consumo sem consumidor construído (Lei 7)', () => {
    // O caminho po → inv está DECLARADO na spec (§6), não prometido aqui.
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
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${cinto[1]}.`));
    }
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
    assert.ok(existsSync(MIGRATION), '0023_inv.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-INV-SPEC.md não existe');
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
    for (const cap of MANIFEST.capabilities) {
      assert.equal(seeded.find((c) => c.key === cap.key)?.canonicalName, cap.canonicalName);
    }
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('inv.item.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('inv.item.registered') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
    for (const ev of MANIFEST.events.emits) {
      assert.equal(seeded.find((e) => e.type === ev.type)?.version, ev.version);
    }
  });

  test('o consumo do seed é vazio, como o do manifesto', () => {
    assert.equal(MANIFEST.events.consumes.length, 0);
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(inv\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(
      concedidas,
      [],
      'o seed concede permissão deste módulo — isso vaza para todos os tenants',
    );
  });
});
