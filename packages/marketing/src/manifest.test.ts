import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST } from './manifest.ts';
import { CONSUMED_EVENT_TYPE } from './spend-approval.ts';

/**
 * O manifesto e o seed têm de contar a mesma história — igual ao Módulo 1.
 *
 * E, aqui, uma história a mais: este é o primeiro módulo cujo `consumes` não
 * é vazio, e é justamente o campo que a Store usaria para dizer ao cliente
 * *"este módulo reage ao seu financeiro"*. Se ele divergir do código, a
 * vitrine promete uma integração que não acontece.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0004_marketing.sql');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa que o explica. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/**
 * O trecho do seed que registra ESTE módulo — e só ele.
 *
 * ⚠️ Escopo obrigatório, não zelo. A primeira versão deste teste procurava o
 * bloco JSON no seed inteiro e encontrou `recon.approval.decided` dentro dos
 * eventos EMITIDOS pelo `recon` — o mesmo tipo que o marketing CONSOME.
 * O teste passou a comparar o consumo de um módulo com a emissão do outro.
 *
 * É o próprio acoplamento por contrato que cria a armadilha: a partir de dois
 * módulos, a mesma string aparece nas duas pontas, e quem lê o seed inteiro
 * não sabe de qual lado está.
 */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'marketing',"));
  assert.ok(meu, 'o seed não registra o módulo marketing');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo marketing contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o seed transcreve o manifesto do marketing fielmente', () => {
  test('o seed registra este módulo, com este id, versão, nome e resumo', () => {
    assert.match(sql, new RegExp(`'${MANIFEST.id}',`));
    assert.ok(sql.includes(MANIFEST.name));
    assert.ok(sql.includes(MANIFEST.summary));
  });

  test('a taxonomia é a mesma nos dois', () => {
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'marketing');
    assert.match(sql, /'domain',\s*'marketing'/);
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('"campaigns"') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
    assert.equal(seeded[0]?.canonicalName, 'Campanhas');
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('marketing.campaign.manage') as { key: string }[];
    assert.deepEqual(
      seeded.map((p) => p.key).sort(),
      MANIFEST.permissions.map((p) => p.key).sort(),
    );
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('marketing.campaign.published') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });

  test('⭐ o consumo declarado no seed é o mesmo do manifesto e do código', () => {
    const seeded = jsonBlockContaining(CONSUMED_EVENT_TYPE) as { type: string }[];
    assert.deepEqual(
      seeded.map((e) => e.type),
      MANIFEST.events.consumes.map((e) => e.type),
    );
    assert.equal(
      MANIFEST.events.consumes[0]?.type,
      CONSUMED_EVENT_TYPE,
      'o manifesto anuncia um tipo e o handler escuta outro — a Store mentiria',
    );
  });

  test('toda permissão que o seed concede está declarada no manifesto', () => {
    const declaradas = new Set<string>(MANIFEST.permissions.map((p) => p.key));
    const concedidas = [...sql.matchAll(/\('(marketing\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.ok(concedidas.length > 0, 'o seed não concede nenhuma permissão marketing');
    for (const key of concedidas) {
      assert.ok(declaradas.has(key as string), `${key} é permissão fantasma`);
    }
  });
});

describe('a Lei do Lego, conferida no arquivo', () => {
  test('não há um único acesso a schema de outro módulo na migration', () => {
    assert.doesNotMatch(
      migrationCode,
      /\brecon\./,
      'a migration do marketing tocou o schema do recon — o Lego caiu',
    );
  });

  test('a migration não cria objeto no schema core', () => {
    assert.doesNotMatch(migrationCode, /create\s+(table|index)\s+core\./i);
    assert.doesNotMatch(migrationCode, /alter\s+table\s+core\./i);
  });

  test('a porta de saída só deixa passar evento deste módulo', () => {
    assert.match(migrationCode, /not\s+like\s+'marketing\.%'/);
  });

  test('todo tipo emitido pela migration está declarado no manifesto', () => {
    const emitidos = [...migration.matchAll(/'(marketing\.[a-z]+\.[a-z]+)'/g)]
      .map((m) => m[1])
      .filter((t) => t !== 'marketing.campaign.manage');
    const declarados = new Set<string>(MANIFEST.events.emits.map((e) => e.type));
    for (const tipo of new Set(emitidos)) {
      if (!tipo || !tipo.startsWith('marketing.campaign.')) continue;
      if (tipo.endsWith('.publish') || tipo.endsWith('.manage')) continue;
      assert.ok(declarados.has(tipo), `a migration emite ${tipo}, que não está no manifesto`);
    }
  });

  test('a projeção não tem policy de escrita para authenticated', () => {
    const policies = [...migrationCode.matchAll(/create\s+policy\s+(\w+)\s+on\s+marketing\.spend_approvals\s+for\s+(\w+)/gi)];
    assert.equal(policies.length, 1, 'spend_approvals deveria ter exatamente uma policy');
    assert.equal(
      policies[0]?.[2]?.toLowerCase(),
      'select',
      'a única policy da projeção tem de ser de leitura — escrever é do correio',
    );
  });

  test('o grant da projeção é só de leitura', () => {
    assert.match(migrationCode, /grant\s+select\s+on\s+marketing\.spend_approvals\s+to\s+authenticated/i);
    assert.doesNotMatch(
      migrationCode,
      /grant[^;]*insert[^;]*on\s+marketing\.spend_approvals/i,
      'dar INSERT ao cliente é deixá-lo aprovar a própria verba',
    );
  });
});
