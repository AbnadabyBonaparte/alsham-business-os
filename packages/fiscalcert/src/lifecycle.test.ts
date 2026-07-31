import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  canArchive,
  canRestore,
  isExpiredAsOf,
  orderByExpiry,
  summarizeCertificates,
} from './fiscalcert.ts';
import type { Certificate } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0085_fiscalcert.sql');
const MIGRATION_VENDOR = resolve(HERE, '../../../supabase/migrations/0058_vendor.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

function cert(over: Partial<Certificate> = {}): Certificate {
  return {
    id: 'c1',
    certType: 'e-CNPJ',
    holder: 'ALSHAM',
    validFrom: null,
    validUntil: '2027-01-01',
    status: 'active',
    note: '',
    ...over,
  };
}

function paresDoSql(caminho: string, fn: string): Set<string> {
  const texto = readFileSync(caminho, 'utf8');
  const corpo = texto.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
  const bloco = corpo.split('$$;')[0] ?? '';
  const semComentario = bloco.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const pares = new Set<string>();
  for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    pares.add(`${m[1]}→${m[2]}`);
  }
  return pares;
}

describe('o ciclo de vida do registro de certificado', () => {
  test('⭐ active ↔ archived é REVERSÍVEL (o certificado trocado é arquivado, não apagado)', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
  });

  test('a matriz N×N: canTransition concorda com a tabela', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('canArchive/canRestore concordam com a tabela', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), false);
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), false);
  });

  test('⭐ a tabela de transições é a MESMA nos dois lados (SQL × TS)', () => {
    const doSql = paresDoSql(MIGRATION, 'fiscalcert.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ o reaproveitamento assinado: fiscalcert × vendor — a mesma física active ↔ archived', () => {
    const doFiscal = paresDoSql(MIGRATION, 'fiscalcert.allowed_transition');
    const doVendor = paresDoSql(MIGRATION_VENDOR, 'vendor.allowed_transition');
    assert.deepEqual([...doFiscal].sort(), [...doVendor].sort());
  });
});

describe('⛔⛔ o módulo é um lembrete de validade, NÃO um cofre criptográfico', () => {
  test('a migration não tem coluna de arquivo/chave/segredo, nem função de assinatura', () => {
    for (const proibida of ['pfx', 'p12', 'private_key', 'privatekey', 'private', 'password', 'passphrase', 'secret', 'signature']) {
      assert.doesNotMatch(code, new RegExp(`^\\s*${proibida}\\s+`, 'im'), `coluna proibida: ${proibida}`);
    }
    assert.doesNotMatch(code, /function\s+fiscalcert\.[a-z_]*sign/i);
  });

  test('⭐ o que ENTRA é só metadado: o vencimento obrigatório é o coração do módulo', () => {
    assert.match(code, /valid_until\s+date\s+not null/i);
  });

  test('isExpiredAsOf compara contra uma data PASSADA POR PARÂMETRO (nunca o relógio)', () => {
    const c = cert({ validUntil: '2027-01-01' });
    assert.equal(isExpiredAsOf(c, '2027-06-01'), true); // depois do vencimento
    assert.equal(isExpiredAsOf(c, '2026-06-01'), false); // antes do vencimento
    assert.equal(isExpiredAsOf(c, '2027-01-01'), false); // no dia, ainda vale
  });
});

describe('a leitura do acervo', () => {
  test('orderByExpiry: do vencimento mais próximo ao mais distante', () => {
    const lista = [
      cert({ id: 'a', validUntil: '2027-03-01' }),
      cert({ id: 'b', validUntil: '2026-12-01' }),
      cert({ id: 'c', validUntil: '2027-01-15' }),
    ];
    assert.deepEqual(orderByExpiry(lista).map((c) => c.id), ['b', 'c', 'a']);
  });

  test('summarizeCertificates conta por estado — todo número é length', () => {
    const lista = [
      cert({ status: 'active' }),
      cert({ status: 'active' }),
      cert({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeCertificates(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeCertificates([]), { total: 0, active: 0, archived: 0 });
  });
});
