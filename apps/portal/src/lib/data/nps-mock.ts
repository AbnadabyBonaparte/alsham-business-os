import type { SurveyResponse } from '@alsham/nps';

import type { NpsPort, SurveyRow } from './nps-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

let seq = 2;
let respSeq = 3;

const surveys: SurveyRow[] = [
  {
    id: 'mock-ns-1',
    title: 'A voz da praça — julho',
    question: 'De 0 a 10, o quanto você recomendaria a nossa praça a um amigo?',
    status: 'open',
    openedAt: diasAtras(10),
    closedAt: null,
    createdAt: diasAtras(12),
  },
  {
    id: 'mock-ns-2',
    title: 'Pós-evento de inauguração',
    question: 'De 0 a 10, como foi a sua experiência no evento?',
    status: 'draft',
    openedAt: null,
    closedAt: null,
    createdAt: diasAtras(1),
  },
];

const responses: SurveyResponse[] = [
  {
    id: 'mock-nr-1',
    seq: 1,
    surveyId: 'mock-ns-1',
    score: 9,
    comment: 'praça limpa, atendimento ótimo',
    respondent: 'mesa 12',
    respondedAt: diasAtras(8),
  },
  {
    id: 'mock-nr-2',
    seq: 2,
    surveyId: 'mock-ns-1',
    score: 6,
    comment: 'faltou vaga no sábado',
    respondent: '',
    respondedAt: diasAtras(5),
  },
  {
    id: 'mock-nr-3',
    seq: 3,
    surveyId: 'mock-ns-1',
    score: 10,
    comment: '',
    respondent: 'cliente da tarde',
    respondedAt: diasAtras(2),
  },
];

export function createNpsMockPort(): NpsPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['nps.survey.manage', 'nps.response.record']);
    },

    async loadSurveys() {
      return [...surveys];
    },

    async loadResponses() {
      return [...responses];
    },

    async createSurvey(input) {
      const id = `mock-ns-${(seq += 1)}`;
      surveys.push({
        id,
        title: input.title,
        question: input.question,
        status: 'draft',
        openedAt: null,
        closedAt: null,
        createdAt: agora(),
      });
      return { surveyId: id };
    },

    async updateDraft(input) {
      const i = surveys.findIndex((s) => s.id === input.surveyId);
      if (i < 0) throw new Error('rodada não encontrada');
      if (surveys[i]!.status !== 'draft') throw new Error('a coleta congelou a pergunta');
      surveys[i] = { ...surveys[i]!, title: input.title, question: input.question };
    },

    async setStatus(input) {
      const i = surveys.findIndex((s) => s.id === input.surveyId);
      if (i < 0) throw new Error('rodada não encontrada');
      surveys[i] = {
        ...surveys[i]!,
        status: input.status,
        openedAt: input.status === 'open' ? agora() : surveys[i]!.openedAt,
        closedAt: input.status === 'closed' ? agora() : null,
      };
    },

    async recordResponse(input) {
      const s = surveys.find((x) => x.id === input.surveyId);
      if (!s) throw new Error('rodada não encontrada');
      // O mock imita o gatilho: só a aberta colhe.
      if (s.status === 'draft') throw new Error('o rascunho ainda não abriu a coleta');
      if (s.status === 'closed') throw new Error('a medição encerrou');
      responses.push({
        id: `mock-nr-${(respSeq += 1)}`,
        seq: respSeq,
        surveyId: input.surveyId,
        score: input.score,
        comment: input.comment,
        respondent: input.respondent,
        respondedAt: agora(),
      });
    },
  };
}
