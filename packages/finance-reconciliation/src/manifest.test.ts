import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST } from './manifest.ts';

/**
 * O manifesto e o seed têm de contar a mesma história.
 *
 * `supabase/seed/0001_platform.sql` transcreve o `ModuleManifest` para o
 * catálogo da Store. Se os dois divergirem, a vitrine anuncia uma coisa e o
 * código faz outra — e o manifesto, que é o contrato do Lego, vira mentira.
 *
 * Divergência de transcrição é o tipo de erro que ninguém encontra lendo:
 * some no meio de um JSON dentro de um SQL. Por isso este teste compara os
 * dois de verdade, e roda no CI.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const sql = readFileSync(SEED, 'utf8');

/**
 * O seed sem os comentários.
 *
 * Necessário porque o cabeçalho do arquivo *explica* a regra da idempotência
 * usando as próprias palavras `on conflict do nothing` — e uma contagem
 * ingênua acusaria uma guarda a mais do que existe de verdade. Teste que mede
 * comportamento tem de ler código, não prosa.
 */
const code = sql.replace(/--[^\n]*/g, '');

/** Extrai um bloco `'[...]'::jsonb` do seed pelo conteúdo que ele contém. */
function jsonBlockContaining(needle: string): unknown[] {
  const blocks = sql.match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do seed contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com este id e esta versão', () => {
    assert.match(sql, new RegExp(`'${MANIFEST.id}',`), 'module_id do manifesto não está no seed');
    assert.ok(sql.includes(`'${MANIFEST.version}'`), 'a versão do manifesto não está no seed');
    assert.ok(sql.includes(MANIFEST.name), 'o nome do manifesto não está no seed');
    assert.ok(sql.includes(MANIFEST.summary), 'o resumo do manifesto não está no seed');
  });

  test('a taxonomia é a mesma nos dois', () => {
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.match(sql, /'domain',\s*'finance'/, 'seed não declara layer/domain do manifesto');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
    for (const cap of MANIFEST.capabilities) {
      const match = seeded.find((c) => c.key === cap.key);
      assert.equal(
        match?.canonicalName,
        cap.canonicalName,
        `o nome canônico de ${cap.key} diverge — a Store exibiria outro nome`,
      );
    }
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('recon.statement.import') as { key: string }[];
    assert.deepEqual(
      seeded.map((p) => p.key).sort(),
      MANIFEST.permissions.map((p) => p.key).sort(),
    );
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('recon.approval.decided') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
    for (const ev of MANIFEST.events.emits) {
      assert.equal(seeded.find((e) => e.type === ev.type)?.version, ev.version);
    }
  });

  test('⛔ o seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    // ⚠️ ESTE TESTE MUDOU DE VEREDITO NA ETAPA 9, e a mudança é o ponto.
    //
    // Antes ele exigia que o seed concedesse as permissões do módulo ao papel
    // de sistema `admin` — a ponte provisória, que o próprio seed marcava com
    // "quando o instalador nascer, este bloco sai".
    //
    // O instalador nasceu (`0006_install.sql`), e a ponte tinha um vazamento:
    // papel de sistema vale em TODO tenant, então qualquer tenant novo com um
    // `admin` já nascia com as permissões dos módulos sem instalar nada.
    //
    // Agora quem concede é `core.install_module()`, num papel DO TENANT.
    const concedidas = [...code.matchAll(/\('(recon\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(
      concedidas,
      [],
      'o seed voltou a conceder permissão de módulo — isso vaza para todos os tenants',
    );
  });

  test('o seed não semeia tenant, usuário nem nome de cliente', () => {
    assert.doesNotMatch(code, /insert\s+into\s+core\.tenants/i, 'seed de catálogo não cria tenant');
    assert.doesNotMatch(code, /insert\s+into\s+core\.memberships/i, 'seed de catálogo não cria vínculo');
    assert.doesNotMatch(code, /insert\s+into\s+auth\.users/i, 'seed de catálogo não cria usuário');
  });

  test('todo INSERT do seed é idempotente', () => {
    const inserts = (code.match(/insert\s+into/gi) ?? []).length;
    const guards = (code.match(/on\s+conflict[\s\S]{0,60}?do\s+nothing/gi) ?? []).length;
    assert.ok(inserts > 0, 'o seed não tem INSERT nenhum');
    assert.equal(
      guards,
      inserts,
      `${inserts} INSERT mas ${guards} guarda de conflito — reaplicar o seed quebraria`,
    );
  });
});
