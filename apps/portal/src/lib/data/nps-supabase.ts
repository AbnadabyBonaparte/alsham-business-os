import type { SupabaseClient } from '@supabase/supabase-js';

import type { SurveyResponse, SurveyStatus } from '@alsham/nps';

import { DataPortError } from './port';
import type { NpsPort, SurveyRow } from './nps-port';

const NPS = 'nps';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface SurveyDb {
  id: string;
  title: string;
  question: string;
  status: SurveyStatus;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
}

interface ResponseDb {
  id: string;
  seq: number;
  survey_id: string;
  score: number;
  comment: string;
  respondent: string;
  responded_at: string;
}

export function createNpsSupabasePort(db: SupabaseClient, tenantId: string): NpsPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'nps.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadSurveys() {
      const { data, error } = await db
        .schema(NPS)
        .from('surveys')
        .select('id, title, question, status, opened_at, closed_at, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar as rodadas', error);
      return ((data ?? []) as SurveyDb[]).map(
        (s): SurveyRow => ({
          id: s.id,
          title: s.title,
          question: s.question,
          status: s.status,
          openedAt: s.opened_at,
          closedAt: s.closed_at,
          createdAt: s.created_at,
        }),
      );
    },

    async loadResponses() {
      const { data, error } = await db
        .schema(NPS)
        .from('responses')
        .select('id, seq, survey_id, score, comment, respondent, responded_at')
        .eq('tenant_id', tenantId)
        .order('seq', { ascending: false });
      if (error) fail('carregar o livro de respostas', error);
      return ((data ?? []) as ResponseDb[]).map(
        (r): SurveyResponse => ({
          id: r.id,
          seq: r.seq,
          surveyId: r.survey_id,
          score: r.score,
          comment: r.comment ?? '',
          respondent: r.respondent ?? '',
          respondedAt: r.responded_at,
        }),
      );
    },

    async createSurvey(input) {
      const { data, error } = await db
        .schema(NPS)
        .from('surveys')
        .insert({ tenant_id: tenantId, title: input.title, question: input.question })
        .select('id')
        .single();
      if (error) fail('redigir a rodada', error);
      return { surveyId: (data as { id: string }).id };
    },

    async updateDraft(input) {
      const { error } = await db
        .schema(NPS)
        .from('surveys')
        .update({ title: input.title, question: input.question })
        .eq('id', input.surveyId)
        .eq('tenant_id', tenantId);
      if (error) fail('editar o rascunho', error);
    },

    async setStatus(input) {
      const { error } = await db
        .schema(NPS)
        .from('surveys')
        .update({ status: input.status })
        .eq('id', input.surveyId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover a rodada', error);
    },

    async recordResponse(input) {
      const { error } = await db.schema(NPS).from('responses').insert({
        tenant_id: tenantId,
        survey_id: input.surveyId,
        score: input.score,
        comment: input.comment,
        respondent: input.respondent,
      });
      if (error) fail('registrar a resposta', error);
    },
  };
}
