import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0025_deal.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-DEAL-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'deal',"));
  assert.ok(meu, 'o seed não registra o módulo deal');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo deal contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ A capacidade canônica é *Pipeline* — "funil" e "oportunidade" NÃO
   * existem na Taxonomia (contado, não estimado). O módulo fala "funil" na
   * TELA, porque é como o mercado brasileiro fala; o manifesto fala
   * *Pipeline*, porque `canonicalName` é rastreabilidade mapa→código.
   */
  test('⭐ o Domain é `crm` e a capacidade é Pipeline — como escrito no mapa', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'crm');
    const linha = taxonomia.split('\n').find((l) => l.includes('CRM · Pipeline · Propostas'));
    assert.ok(linha, 'a linha de capacidades do Domain sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(listadas.includes(cap.canonicalName));
    }
    assert.equal((taxonomia.match(/\bfunil\b/gi) ?? []).length, 0, '"funil" não é vocábulo do mapa');
  });

  test('⭐⭐ a Lei das Etapas, segunda aplicação: nenhum estágio no produto', () => {
    // Nem enum no schema, nem nome de estágio no pacote. O funil de uma
    // licitação pública e o de uma loja moram na mesma tabela.
    assert.doesNotMatch(migrationCode, /create\s+type\s+deal\./i);
    const pacote = readFileSync(resolve(HERE, 'deal.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(pacote, /'prospec[çc][ãa]o'|'qualifica[çc][ãa]o'|'fechamento'/i);
  });

  test('⭐ a fronteira com o crm é SOLTA — e o schema prova', () => {
    assert.doesNotMatch(migrationCode, /references\s+crm\./i);
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
      // `won` e `lost` são passados irregulares (win → won, lose → lost).
      assert.match(e.type.split('.')[2] as string, /(ed|won|lost)$/);
    }
  });

  test('os cinco fatos encomendados existem todos', () => {
    const encomendados = [
      'opportunity.opened',
      'opportunity.moved',
      'opportunity.updated',
      'opportunity.won',
      'opportunity.lost',
    ];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`deal.${f}`), `o fato deal.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 5);
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
    assert.ok(existsSync(MIGRATION), '0025_deal.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-DEAL-SPEC.md não existe');
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
    const seeded = jsonBlockContaining('deal.funnel.design') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('deal.opportunity.opened') as {
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
    const concedidas = [...code.matchAll(/\('(deal\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
