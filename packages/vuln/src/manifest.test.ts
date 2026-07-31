import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0093_vuln.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-VULN-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

// ⚠️ O cartão do seed é tarefa do orquestrador (a Onda fecha num PR só). Até o
// seed ganhar a linha do `vuln`, os subtestes de TRANSCRIÇÃO abaixo falham DE
// PROPÓSITO — e só eles. Por isso este lookup NÃO estoura no carregamento do
// arquivo (o que derrubaria também os testes de CONTRATO, que não dependem do
// seed): quando não encontra, devolve null e cada subteste de seed acusa.
const blocoDoModulo: string | null = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'vuln',"));
  if (!meu) return null;
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  assert.ok(blocoDoModulo, 'o seed não registra o módulo vuln (cartão do orquestrador)');
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo vuln contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é DOMAIN `infosec`, ancorado na linha de Segurança da Informação da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal((MANIFEST.taxonomy as { domain: string }).domain, 'infosec');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('Gestão de vulnerabilidades') && l.includes('Resposta a incidentes'));
    assert.ok(linha, 'a linha de capacidades de Segurança da Informação sumiu da Taxonomia');
    const listadas = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades de Segurança da Informação na Taxonomia`,
      );
    }
  });

  test('⭐ a chave de domínio bate com a store-taxonomy (a seção Segurança da Informação existe)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(store.includes("key: 'infosec'"), 'store-taxonomy.ts não tem a chave infosec');
  });

  test('⛔ o schema não cria enum de tipo — título/descrição são texto livre', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+vuln\./i);
    assert.match(migrationCode, /title\s+text/);
    assert.match(migrationCode, /description\s+text/);
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

  test('consumes é VAZIO — sem redeploy do apps/api nesta onda (Lei 7)', () => {
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

  test('a permissão é EXATAMENTE vuln.finding.manage', () => {
    assert.deepEqual(MANIFEST.permissions.map((p) => p.key), ['vuln.finding.manage']);
  });

  test('os eventos emitidos são EXATAMENTE os cinco da v1', () => {
    assert.deepEqual(MANIFEST.events.emits.map((e) => e.type), [
      'vuln.finding.registered',
      'vuln.finding.progressed',
      'vuln.finding.remediated',
      'vuln.finding.accepted',
      'vuln.finding.reopened',
    ]);
  });

  test('as constantes tipadas batem com o manifesto', () => {
    assert.deepEqual(Object.values(PERMISSIONS).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    assert.deepEqual(Object.values(EVENTS).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('a migration e a spec do módulo existem', () => {
    assert.ok(existsSync(MIGRATION), '0093_vuln.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-VULN-SPEC.md não existe');
  });
});

describe('⭐ o schema espelha a física do módulo', () => {
  test('⭐ a severidade 1–5 é CHECK argumentado no banco', () => {
    assert.match(migrationCode, /severity\s+int\s+not null\s+check \(severity between 1 and 5\)/i);
  });

  test('⛔ severidade não é enum de casa — é a régua do método numa coluna int', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+vuln\.severity/i);
  });

  test('⭐⭐ o status CHECK tem as DUAS respostas terminais: remediated E accepted_risk', () => {
    const statusCheck = migrationCode.match(/status\s+text[\s\S]*?check \(status in \(([^)]*)\)\)/i);
    assert.ok(statusCheck, 'a migration não tem o CHECK de status');
    assert.match(statusCheck![1] as string, /'open'/);
    assert.match(statusCheck![1] as string, /'in_progress'/);
    assert.match(statusCheck![1] as string, /'remediated'/);
    assert.match(statusCheck![1] as string, /'accepted_risk'/);
  });

  test('⭐⭐ o encerramento é coerente: terminal exige a resposta escrita (a nota/justificativa)', () => {
    // A constraint é o ÚLTIMO item da tabela (fecha em `)\n);`), e o corpo tem
    // `length(btrim(resolution))` — um `))` que faria um `\)\s*\)` casar cedo
    // demais. Ancoramos o fim no `;` de fechamento da tabela.
    const constraint = migrationCode.match(
      /constraint\s+vuln_findings_closure_coherent\s+check \(([\s\S]*?)\)\s*\)\s*;/i,
    );
    assert.ok(constraint, 'a migration não tem a constraint de coerência do encerramento');
    const corpo = constraint![1] as string;
    assert.match(corpo, /'remediated'/);
    assert.match(corpo, /'accepted_risk'/);
    assert.match(corpo, /length\(btrim\(resolution\)\)\s*>\s*0/);
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo, 'o seed não registra o módulo vuln (cartão do orquestrador)');
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia DOMAIN é a mesma nos dois (domain_key)', () => {
    assert.ok(blocoDoModulo, 'o seed não registra o módulo vuln (cartão do orquestrador)');
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { domain: string }).domain}'`));
    assert.ok(blocoDoModulo.includes('domain_key'));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('vuln.finding.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('vuln.finding.registered') as { type: string }[];
    assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(vuln\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
