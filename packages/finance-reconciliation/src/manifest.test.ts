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

/**
 * O trecho do seed que registra ESTE módulo — e só ele.
 *
 * ⚠️ **Escopo obrigatório, e virou obrigatório na Etapa 10.** Enquanto o
 * catálogo tinha um módulo só, ler o seed inteiro dava certo por sorte de
 * ordenação. Com três módulos, a mesma string aparece nas duas pontas de cada
 * contrato — `recon.approval.decided` está nos EMITE do `recon` e nos CONSOME
 * do `marketing`; `ap.payable.registered` está nos EMITE do `ap` e nos CONSOME
 * deste módulo. Quem lê o arquivo inteiro não sabe de que lado está, e
 * compararia o consumo de um com a emissão do outro sem acusar nada.
 *
 * É o próprio acoplamento por contrato que cria a armadilha, e ela já mordeu
 * uma vez, no teste equivalente do Módulo 2.
 */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'recon',"));
  assert.ok(meu, 'o seed não registra o módulo recon');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

/**
 * Extrai um bloco `'[...]'::jsonb` do bloco DESTE módulo pelo conteúdo.
 *
 * ⚠️ Lê o CÓDIGO, com os comentários removidos — e a distinção não é
 * cosmética. O comentário que explica a mudança da Etapa 10 cita `'[]'` como
 * exemplo do que a linha *era*, e a busca não-gulosa engatava naquele `'[`
 * para fechar no `]'::jsonb` do array de verdade, capturando prosa no meio.
 * O sintoma foi um erro de JSON, que é a sorte: se a prosa fosse sintaticamente
 * válida, o teste compararia com o texto errado e passaria.
 */
function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo recon contém ${needle}`);
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

  /**
   * ⭐ **A COMPARAÇÃO QUE FALTAVA — e que só passou a importar na Etapa 10.**
   *
   * Enquanto `consumes` era `[]` dos dois lados, não havia o que divergir e o
   * teste não existia. Agora este campo é o que a Store usa para dizer ao
   * cliente *"este módulo reage ao seu contas a pagar"*: se ele divergir do
   * código, a vitrine promete uma integração que não acontece.
   */
  test('os eventos consumidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('ap.payable.registered') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.consumes.map((e) => e.type).sort(),
    );
    for (const ev of MANIFEST.events.consumes) {
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

  /**
   * ⚠️ **ESTE TESTE MUDOU NA ETAPA 10, e a mudança é uma correção do teste,
   * não um afrouxamento da regra.**
   *
   * Ele exigia `do nothing` em todo INSERT. A regra de verdade nunca foi
   * "`do nothing`" — é **"reaplicar o seed não quebra e não deixa nada
   * defasado"**, e `do nothing` era só a forma que bastava enquanto o catálogo
   * apenas CRESCIA.
   *
   * Na Etapa 10 uma linha existente precisou mudar (o `recon` passou a declarar
   * que escuta `ap.*`), e o módulo já está registrado em produção. Com
   * `do nothing`, reaplicar o seed não faria nada e a Store exibiria o catálogo
   * antigo para sempre — sem erro nenhum, que é o pior jeito de errar.
   *
   * O veredito novo cobre as duas formas de ser idempotente. O que continua
   * proibido é o que sempre foi: **INSERT sem cláusula de conflito.**
   */
  test('todo INSERT do seed é idempotente', () => {
    const inserts = (code.match(/insert\s+into/gi) ?? []).length;
    const guards = (code.match(/on\s+conflict[\s\S]{0,60}?do\s+(nothing|update)/gi) ?? []).length;
    assert.ok(inserts > 0, 'o seed não tem INSERT nenhum');
    assert.equal(
      guards,
      inserts,
      `${inserts} INSERT mas ${guards} guarda de conflito — reaplicar o seed quebraria`,
    );
  });
});
