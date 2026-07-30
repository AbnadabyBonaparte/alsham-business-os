import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canClose,
  canTransition,
  canTreat,
  orderOccurrences,
  whyCannotClose,
} from './occurrence.ts';
import type { Occurrence, Severity } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0031_occ.sql');
const MIGRATION_CARE = resolve(HERE, '../../../supabase/migrations/0030_care.sql');

function ocorrencia(over: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'o1',
    title: 'Vazamento na doca 3',
    description: 'Água acumulada perto da entrada de carga.',
    location: 'doca 3',
    involved: null,
    severityId: null,
    occurredAt: '2026-07-29T08:00:00Z',
    status: 'open',
    closedAt: null,
    outcome: '',
    ...over,
  };
}

describe('⭐ o fato aconteceu uma vez: um par só, e encerrada é terminal', () => {
  test('open → closed é a única transição', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    assert.equal(canTransition('open', 'closed'), true);
    assert.equal(canTransition('closed', 'open'), false);
  });

  test('encerrada não trata nem encerra de novo', () => {
    assert.equal(canTreat('open'), true);
    assert.equal(canTreat('closed'), false);
    assert.equal(canClose('closed'), false);
  });

  test('⭐ encerrar exige o desfecho escrito — a recusa tem nome', () => {
    assert.equal(
      whyCannotClose(ocorrencia(), ''),
      'Encerrar exige o desfecho escrito: arquivar sem apurar é apagar com outro nome.',
    );
    assert.equal(whyCannotClose(ocorrencia(), 'reparo feito; laudo arquivado'), null);
    assert.notEqual(whyCannotClose(ocorrencia({ status: 'closed' }), 'x'), null);
  });
});

describe('⭐ a ordem do livro é da gravidade DO TENANT', () => {
  test('posição 0 primeiro; sem gravidade ao fim; empate pelo mais recente', () => {
    const reguas: Severity[] = [
      { id: 's-grave', name: 'grave', position: 0, status: 'active' },
      { id: 's-leve', name: 'leve', position: 1, status: 'active' },
    ];
    const livro = orderOccurrences(
      [
        ocorrencia({ id: 'a', severityId: 's-leve' }),
        ocorrencia({ id: 'b', severityId: 's-grave', occurredAt: '2026-07-28T00:00:00Z' }),
        ocorrencia({ id: 'c', severityId: 's-grave', occurredAt: '2026-07-29T00:00:00Z' }),
        ocorrencia({ id: 'd', severityId: null }),
      ],
      reguas,
    );
    assert.deepEqual(
      livro.map((o) => o.id),
      ['c', 'b', 'a', 'd'],
    );
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
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

  test('occ.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'occ.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 1, 'o SQL declara UM par');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O contraste com o `care` é EXIGIDO — duas físicas, de propósito:
   *
   *   · o ticket é PEDIDO: editável enquanto vivo (o porteiro do care
   *     devolve `new` quando `old.status` é open/in_progress) e reabre;
   *   · a ocorrência é FATO CONSUMADO: o gatilho recusa QUALQUER edição de
   *     conteúdo, desde o nascimento — corrigir é TRATATIVA.
   *
   * Quem "uniformizar" qualquer lado reprova aqui e escreve a decisão de
   * novo, por escrito.
   */
  test('⭐⭐ o care edita o pedido vivo e o occ NÃO edita o fato — os dois de propósito', () => {
    const sqlCare = readFileSync(MIGRATION_CARE, 'utf8').replace(/--[^\n]*/g, '');
    const sqlOcc = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    // O care deixa o caso VIVO editável: o porteiro libera em open/in_progress.
    assert.match(
      sqlCare,
      /if old\.status in \('open', 'in_progress'\) then\s*\n\s*return new;/,
      'o care deixou de liberar a edição do caso vivo — lá o pedido é conversa',
    );
    // O occ recusa a reescrita do relato SEMPRE — e manda para a tratativa.
    assert.match(
      sqlOcc,
      /não se reescreve\. Corrigir o relato é registrar uma TRATATIVA/,
      'o occ deixou de recusar a reescrita do relato',
    );
    // E o occ NÃO tem reabertura em lugar nenhum.
    const doOcc = paresDoSql(MIGRATION, 'occ.allowed_transition');
    assert.equal(doOcc.has('closed→open'), false, 'o occ ganhou reabertura — fato não se reabre');
  });

  test('⭐ o futuro é recusado no SQL — fato consumado', () => {
    const sqlOcc = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sqlOcc, /occurred_at\s*<=\s*now\(\)/);
  });
});
