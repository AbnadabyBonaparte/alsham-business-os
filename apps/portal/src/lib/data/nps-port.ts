import type { Survey, SurveyResponse } from '@alsham/nps';

export interface SurveyRow extends Survey {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 27 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: link público (anon = NADA — o coletor externo
 * é integração futura via API com chave), editar resposta (a opinião dada
 * é a opinião dada), reabrir rodada, apagar. O placar não se grava: quem
 * o calcula é o pacote/a view.
 */
export interface NpsPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadSurveys(): Promise<SurveyRow[]>;
  loadResponses(): Promise<SurveyResponse[]>;
  createSurvey(input: { title: string; question: string }): Promise<{ surveyId: string }>;
  updateDraft(input: { surveyId: string; title: string; question: string }): Promise<void>;
  setStatus(input: { surveyId: string; status: 'open' | 'closed' }): Promise<void>;
  recordResponse(input: {
    surveyId: string;
    score: number;
    comment: string;
    respondent: string;
  }): Promise<void>;
}
