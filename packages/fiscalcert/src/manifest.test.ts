import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0085_fiscalcert.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-FISCALCERT-SPEC.md');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'fiscalcert',"));
  if (!meu) return '';
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo fiscalcert contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é DOMAIN `accounting`, ancorado na linha de Contábil & Fiscal da Taxonomia', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal((MANIFEST.taxonomy as { domain: string }).domain, 'accounting');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('Certificado digital') && l.includes('eSocial'));
    assert.ok(linha, 'a linha de capacidades de Contábil & Fiscal sumiu da Taxonomia');
    const listadas = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades de Contábil & Fiscal na Taxonomia`,
      );
    }
  });

  test('⭐ a chave de domínio bate com a store-taxonomy (a seção accounting existe)', () => {
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(store.includes("key: 'accounting'"), 'store-taxonomy.ts não tem a chave accounting');
  });

  test('⛔ o schema não cria enum de tipo — o tipo é texto livre (a legislação muda)', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+fiscalcert\./i);
    assert.match(migrationCode, /cert_type\s+text\s+not null\s+check/i);
  });

  test('⛔⛔ o schema NÃO guarda o certificado em si — sem .pfx, sem chave privada, sem assinatura', () => {
    // Nenhuma COLUNA que armazene o arquivo ou a chave. (A prosa do comentário
    // de schema menciona `.pfx`/`chave privada` para DECLARÁ-los fora — o que
    // importa é que não exista a COLUNA; por isso a âncora de início de linha.)
    for (const proibida of ['pfx', 'p12', 'private_key', 'privatekey', 'private', 'password', 'passphrase', 'secret', 'signature']) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`^\\s*${proibida}\\s+`, 'im'),
        `apareceu uma coluna proibida: ${proibida}`,
      );
    }
    // ...e nenhuma FUNÇÃO de assinatura (sign) definida pelo módulo.
    assert.doesNotMatch(migrationCode, /function\s+fiscalcert\.[a-z_]*sign/i);
    // O que ENTRA é só metadado: o vencimento obrigatório.
    assert.match(migrationCode, /valid_until\s+date\s+not null/i);
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

  test('as constantes tipadas batem com o manifesto', () => {
    assert.deepEqual(Object.values(PERMISSIONS).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    assert.deepEqual(Object.values(EVENTS).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('a migration e a spec do módulo existem', () => {
    assert.ok(existsSync(MIGRATION), '0085_fiscalcert.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-FISCALCERT-SPEC.md não existe');
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('⭐ a taxonomia DOMAIN é a mesma nos dois (domain_key)', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${(MANIFEST.taxonomy as { domain: string }).domain}'`));
    assert.ok(blocoDoModulo.includes('domain_key'));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('fiscalcert.certificate.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('fiscalcert.certificate.registered') as { type: string }[];
    assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const codigo = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...codigo.matchAll(/\('(fiscalcert\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, []);
  });
});
