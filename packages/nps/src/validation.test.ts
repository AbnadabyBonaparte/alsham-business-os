import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeSurveys, validateNewSurvey } from './nps.ts';
import type { Survey, SurveyResponse } from './types.ts';

function rodada(over: Partial<Survey> = {}): Survey {
  return {
    id: 's1',
    title: 'Rodada',
    question: 'Recomendaria?',
    status: 'draft',
    openedAt: null,
    closedAt: null,
    ...over,
  };
}

describe('validateNewSurvey', () => {
  test('o mínimo honesto: título e a pergunta do tenant', () => {
    const r = validateNewSurvey({
      title: 'A voz da praça — julho',
      question: 'De 0 a 10, o quanto você nos recomendaria?',
    });
    assert.equal(r.ok, true);
  });

  test('⛔ sem pergunta não há pesquisa — a régua é do método; as palavras, do tenant', () => {
    const r = validateNewSurvey({ title: 'X' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems[0]!.message, /pergunta/);
  });

  test('⛔ sem título não há rodada', () => {
    const r = validateNewSurvey({ question: 'Recomendaria?' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});

describe('summarizeSurveys', () => {
  test('conta o quadro sem inventar número', () => {
    const vozes: SurveyResponse[] = [
      { id: 'r1', seq: 1, surveyId: 's2', score: 9, comment: '', respondent: '', respondedAt: 't' },
    ];
    const r = summarizeSurveys(
      [
        rodada(),
        rodada({ id: 's2', status: 'open', openedAt: 'x' }),
        rodada({ id: 's3', status: 'closed', openedAt: 'x', closedAt: 'x' }),
      ],
      vozes,
    );
    assert.deepEqual(r, { total: 3, open: 1, drafts: 1, closed: 1, responses: 1 });
  });
});
