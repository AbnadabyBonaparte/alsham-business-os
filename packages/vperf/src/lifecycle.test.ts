import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0061_vperf.sql');
const MIGRATION_PERF = resolve(HERE, '../../../supabase/migrations/0051_perf.sql');
const MIGRATION_SEC = resolve(HERE, '../../../supabase/migrations/0057_sec.sql');

const vperf = readFileSync(MIGRATION, 'utf8');
const vperfCode = vperf.replace(/--[^\n]*/g, '');
const perf = readFileSync(MIGRATION_PERF, 'utf8');
const perfCode = perf.replace(/--[^\n]*/g, '');
const sec = readFileSync(MIGRATION_SEC, 'utf8');
const secCode = sec.replace(/--[^\n]*/g, '');

describe('⭐ vperf é ATO PONTUAL — sem ciclo, sem transições, imutável', () => {
  test('NÃO existe allowed_transition nem coluna de status — a avaliação não tem ciclo de vida', () => {
    assert.doesNotMatch(
      vperfCode,
      /function vperf\.allowed_transition/,
      'vperf ganhou uma tabela de transições — a avaliação de fornecedor é pontual, não tem ciclo',
    );
    assert.doesNotMatch(
      vperfCode,
      /status\s+text/,
      'vperf ganhou coluna de status — a avaliação não tem estados a percorrer',
    );
    // E, por consequência, nenhuma tabela de ciclo/época.
    assert.doesNotMatch(vperfCode, /create table vperf\.cycles/, 'vperf não tem ciclo — é o DIVERGE do perf');
  });

  test('a avaliação é IMUTÁVEL (fato consumado) — gatilho before update or delete', () => {
    assert.match(
      vperfCode,
      /before update or delete on vperf\.appraisals/,
      'a avaliação deixou de ser imutável — corrigir é registrar outra',
    );
    // Sem policy nem grant de UPDATE/DELETE: só select e insert.
    assert.doesNotMatch(vperfCode, /for update to authenticated/, 'vperf.appraisals não pode ter policy de UPDATE');
    assert.match(vperfCode, /grant select, insert on vperf\.appraisals/, 'a avaliação só ganha select e insert');
  });

  test('⭐ a régua 0–100 é CHECK argumentado — a nota é OBRIGATÓRIA (not null)', () => {
    assert.match(
      vperfCode,
      /rating\s+int\s+not null\s+check \(rating >= 0 and rating <= 100\)/,
      'a régua 0–100 obrigatória saiu do schema — é a física do método',
    );
  });

  test('⭐ o avaliador e a hora são carimbados pelo SERVIDOR no insert', () => {
    assert.match(vperfCode, /new\.appraiser_id\s*:=\s*\(select auth\.uid\(\)\)/, 'o avaliador precisa ser carimbado pelo servidor');
    assert.match(vperfCode, /new\.appraised_at\s*:=\s*now\(\)/, 'a hora precisa ser carimbada pelo servidor');
  });

  test('⭐ o fornecedor é ID SOLTO — sem FK cruzada para o schema vendor', () => {
    assert.match(vperfCode, /supplier_id\s+uuid\s+not null/, 'o fornecedor avaliado é obrigatório e id solto');
    assert.doesNotMatch(vperfCode, /references vendor\./, 'não pode haver FK cruzada para o vendor — é id solto');
  });
});

describe('⭐ o DIVERGE assinado vperf×perf: a avaliação de fornecedor é PONTUAL, sem época', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const partes = sql.split(`create or replace function ${fn}`);
    if (partes.length < 2) return new Set();
    const corpo = partes[1]!;
    const bloco = corpo.split('$$;')[0] ?? '';
    const semComentario = bloco
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const pares = new Set<string>();
    for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
      pares.add(`${m[1]}→${m[2]}`);
    }
    return pares;
  }

  test('o perf TEM ciclo (open → closed); o vperf NÃO tem transição nenhuma', () => {
    const perfPares = paresDoSql(MIGRATION_PERF, 'perf.allowed_transition');
    const vperfPares = paresDoSql(MIGRATION, 'vperf.allowed_transition');
    // O perf mede gente numa época — o ciclo abre e fecha.
    assert.ok(perfPares.has('open→closed'), 'o contraste depende de o perf ter o ciclo open → closed');
    // O vperf avalia fornecedor pontualmente — não há época, não há transição.
    assert.equal(vperfPares.size, 0, 'a avaliação de fornecedor é pontual: nenhuma transição, nenhum ciclo');
  });

  test('o perf TEM a tabela de ciclo (perf.cycles); o vperf NÃO', () => {
    assert.match(perfCode, /create table perf\.cycles/, 'o perf perdeu o ciclo — re-pergunte o contraste');
    assert.doesNotMatch(vperfCode, /create table vperf\.cycles/, 'o vperf não pertence a uma época — sem tabela de ciclo');
  });

  test('a IDENTIDADE se mantém: os dois são atos imutáveis com o avaliador carimbado pelo servidor', () => {
    // O que se MANTÉM do perf (não é tudo que diverge): avaliação imutável +
    // avaliador do servidor. O que DIVERGE é só a moldura temporal (o ciclo).
    assert.match(perfCode, /before update or delete on perf\.reviews/);
    assert.match(vperfCode, /before update or delete on vperf\.appraisals/);
    assert.match(perfCode, /new\.reviewer_id\s*:=\s*\(select auth\.uid\(\)\)/);
    assert.match(vperfCode, /new\.appraiser_id\s*:=\s*\(select auth\.uid\(\)\)/);
  });
});

describe('⭐ o contraste vperf×sec: os dois são atos PONTUAIS sem ciclo de vida', () => {
  test('a ronda (sec.patrols) e a avaliação (vperf.appraisals) nascem prontas e imutáveis, sem status', () => {
    // A ronda do sec é o precedente do ato pontual: registro sem ciclo.
    assert.match(secCode, /before update or delete on sec\.patrols/, 'a ronda do sec deixou de ser ato imutável');
    assert.match(vperfCode, /before update or delete on vperf\.appraisals/);
    // Nenhum dos dois carrega coluna de status na tabela do ato.
    const secPatrolBloco = secCode.split('create table sec.patrols')[1]?.split('create table')[0] ?? '';
    assert.doesNotMatch(secPatrolBloco, /status\s+text/, 'a ronda ganhou status — deixou de ser ato pontual');
    const vperfBloco = vperfCode.split('create table vperf.appraisals')[1]?.split('create index')[0] ?? '';
    assert.doesNotMatch(vperfBloco, /status\s+text/, 'a avaliação ganhou status — deixou de ser ato pontual');
  });
});
