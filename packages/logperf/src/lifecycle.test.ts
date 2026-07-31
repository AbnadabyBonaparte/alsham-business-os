import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0067_logperf.sql');
const MIGRATION_VPERF = resolve(HERE, '../../../supabase/migrations/0061_vperf.sql');

const logperf = readFileSync(MIGRATION, 'utf8');
const logperfCode = logperf.replace(/--[^\n]*/g, '');
const vperf = readFileSync(MIGRATION_VPERF, 'utf8');
const vperfCode = vperf.replace(/--[^\n]*/g, '');

describe('⭐ logperf é ATO PONTUAL — sem ciclo, sem transições, imutável (o REUSO do vperf)', () => {
  test('NÃO existe allowed_transition nem coluna de status — a avaliação não tem ciclo de vida', () => {
    assert.doesNotMatch(
      logperfCode,
      /function logperf\.allowed_transition/,
      'logperf ganhou uma tabela de transições — a avaliação logística é pontual, não tem ciclo',
    );
    assert.doesNotMatch(
      logperfCode,
      /status\s+text/,
      'logperf ganhou coluna de status — a avaliação não tem estados a percorrer',
    );
    assert.doesNotMatch(logperfCode, /create table logperf\.cycles/, 'logperf não tem ciclo — é o REUSO do vperf');
  });

  test('a avaliação é IMUTÁVEL (fato consumado) — gatilho before update or delete', () => {
    assert.match(
      logperfCode,
      /before update or delete on logperf\.appraisals/,
      'a avaliação deixou de ser imutável — corrigir é registrar outra',
    );
    // Sem policy nem grant de UPDATE/DELETE: só select e insert.
    assert.doesNotMatch(logperfCode, /for update to authenticated/, 'logperf.appraisals não pode ter policy de UPDATE');
    assert.match(logperfCode, /grant select, insert on logperf\.appraisals/, 'a avaliação só ganha select e insert');
  });

  test('⭐ a régua 0–100 é CHECK argumentado — a nota é OBRIGATÓRIA (not null)', () => {
    assert.match(
      logperfCode,
      /rating\s+int\s+not null\s+check \(rating >= 0 and rating <= 100\)/,
      'a régua 0–100 obrigatória saiu do schema — é a física do método',
    );
  });

  test('⭐ o avaliador e a hora são carimbados pelo SERVIDOR no insert', () => {
    assert.match(logperfCode, /new\.appraiser_id\s*:=\s*\(select auth\.uid\(\)\)/, 'o avaliador precisa ser carimbado pelo servidor');
    assert.match(logperfCode, /new\.appraised_at\s*:=\s*now\(\)/, 'a hora precisa ser carimbada pelo servidor');
  });

  test('🔴 a migration NÃO referencia o schema dc — o vínculo ao centro é id solto', () => {
    // Guarda estrutural: nem em comentário. O dc_center_id é id solto, sem FK.
    assert.doesNotMatch(logperf, /\bdc\./, 'a migration não pode conter "dc." — o vínculo com o centro é id solto');
  });
});

describe('⭐ o REUSO + DIVERGE assinado logperf×vperf: a MESMA física, o AVALIADO diverge', () => {
  test('a IDENTIDADE se mantém: os dois são atos imutáveis com o avaliador carimbado pelo servidor', () => {
    // O que se MANTÉM do vperf: ato pontual imutável + avaliador do servidor +
    // nota 0–100 obrigatória. É o REUSO consciente, não cópia cega.
    assert.match(vperfCode, /before update or delete on vperf\.appraisals/);
    assert.match(logperfCode, /before update or delete on logperf\.appraisals/);
    assert.match(vperfCode, /new\.appraiser_id\s*:=\s*\(select auth\.uid\(\)\)/);
    assert.match(logperfCode, /new\.appraiser_id\s*:=\s*\(select auth\.uid\(\)\)/);
    assert.match(vperfCode, /rating\s+int\s+not null\s+check \(rating >= 0 and rating <= 100\)/);
    assert.match(logperfCode, /rating\s+int\s+not null\s+check \(rating >= 0 and rating <= 100\)/);
    // Nenhum dos dois tem ciclo (a física do sec.patrols, não a do perf.cycles).
    assert.doesNotMatch(vperfCode, /create table vperf\.cycles/);
    assert.doesNotMatch(logperfCode, /create table logperf\.cycles/);
  });

  test('⭐ o DIVERGE: o avaliado do vperf é um FORNECEDOR obrigatório; o do logperf é TEXTO LIVRE', () => {
    // vperf: o avaliado é supplier_id (id solto obrigatório ao vendor) + nome.
    assert.match(vperfCode, /supplier_id\s+uuid\s+not null/, 'o vperf avalia um fornecedor obrigatório');
    // logperf: o avaliado é subject (texto livre obrigatório) — NÃO um supplier_id.
    assert.match(logperfCode, /subject\s+text\s+not null\s+check \(length\(btrim\(subject\)\) > 0\)/, 'o avaliado do logperf é texto livre obrigatório');
    assert.doesNotMatch(logperfCode, /supplier_id/, 'o logperf NÃO tem supplier_id — o avaliado é texto livre, não um fornecedor');
  });

  test('⭐ o DIVERGE: o vínculo com o centro (dc) é ID SOLTO OPCIONAL (nullable, sem FK)', () => {
    // dc_center_id existe, é uuid, e é NULLABLE (sem "not null") — uma perna de
    // transporte nem sempre tem um CD cadastrado.
    assert.match(logperfCode, /dc_center_id\s+uuid/, 'o vínculo opcional ao centro precisa existir como uuid solto');
    assert.doesNotMatch(logperfCode, /dc_center_id\s+uuid\s+not null/, 'o dc_center_id é OPCIONAL — não pode ser not null');
    // E sem FK cruzada de espécie alguma (nem para vendor, nem para o centro).
    assert.doesNotMatch(logperfCode, /references vendor\./, 'não pode haver FK cruzada para o vendor');
    assert.doesNotMatch(logperfCode, /references\s+dc\b/, 'não pode haver FK cruzada para o centro (dc)');
  });

  test('⭐ o payload NÃO leva o parecer (summary) ao correio — só o vperf e o logperf concordam nisso', () => {
    const logperfPayload =
      logperfCode.split('appraisal_payload(p logperf.appraisals)')[1]?.split('$$;')[0] ?? '';
    assert.doesNotMatch(logperfPayload, /'summary'/, 'o parecer não passeia no correio');
    assert.match(logperfPayload, /'subject'/, 'o payload leva o avaliado');
    assert.match(logperfPayload, /'rating'/, 'o payload leva a nota');
    assert.match(logperfPayload, /'dcCenterId'/, 'o payload leva o id solto do centro');
  });
});
