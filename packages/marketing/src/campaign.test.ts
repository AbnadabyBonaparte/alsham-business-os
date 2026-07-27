import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  budgetStatusFor,
  canTransition,
  isTerminal,
  planTransition,
  summarizeCampaigns,
} from './campaign.ts';
import type { Campaign, MarketingSettings, SpendApproval } from './types.ts';

const AGORA = new Date('2026-07-27T12:00:00.000Z');

const base = {
  name: 'Campanha de teste',
  status: 'draft' as const,
  scheduledFor: null,
  budgetStatus: 'none' as const,
};

// --- o mapa de transições ------------------------------------------------

test('rascunho pode agendar, publicar e cancelar', () => {
  assert.equal(canTransition('draft', 'scheduled'), true);
  assert.equal(canTransition('draft', 'published'), true);
  assert.equal(canTransition('draft', 'cancelled'), true);
});

test('agendada pode voltar para rascunho — desmarcar não é cancelar', () => {
  assert.equal(canTransition('scheduled', 'draft'), true);
});

test('publicada não volta para rascunho', () => {
  assert.equal(canTransition('published', 'draft'), false);
  assert.equal(canTransition('published', 'scheduled'), false);
});

test('encerrada e cancelada são terminais', () => {
  assert.equal(isTerminal('completed'), true);
  assert.equal(isTerminal('cancelled'), true);
  assert.equal(isTerminal('published'), false);
});

test('reabrir campanha encerrada é recusado', () => {
  const v = planTransition({
    campaign: { ...base, status: 'completed' },
    to: 'published',
    now: AGORA,
  });
  assert.equal(v.allowed, false);
  assert.equal(v.allowed === false && v.refusal.code, 'illegal-transition');
});

// --- os carimbos ---------------------------------------------------------

test('publicar carimba published_at — quem grava não precisa saber disso', () => {
  const v = planTransition({ campaign: base, to: 'published', now: AGORA });
  assert.equal(v.allowed, true);
  assert.equal(v.allowed === true && v.stamps.publishedAt, AGORA.toISOString());
});

test('encerrar carimba completed_at', () => {
  const v = planTransition({
    campaign: { ...base, status: 'published' },
    to: 'completed',
    now: AGORA,
  });
  assert.equal(v.allowed === true && v.stamps.completedAt, AGORA.toISOString());
});

test('cancelar não carimba data de publicação', () => {
  const v = planTransition({ campaign: base, to: 'cancelled', now: AGORA });
  assert.equal(v.allowed, true);
  assert.equal(v.allowed === true && v.stamps.publishedAt, undefined);
});

// --- agendamento ---------------------------------------------------------

test('agendar sem data é recusado', () => {
  const v = planTransition({ campaign: base, to: 'scheduled', now: AGORA });
  assert.equal(v.allowed === false && v.refusal.code, 'schedule-missing');
});

test('agendar para o passado é recusado por padrão', () => {
  const v = planTransition({
    campaign: { ...base, scheduledFor: '2026-01-01T00:00:00.000Z' },
    to: 'scheduled',
    now: AGORA,
  });
  assert.equal(v.allowed === false && v.refusal.code, 'schedule-in-past');
});

test('mas o tenant que importa histórico pode desligar essa exigência', () => {
  const settings: MarketingSettings = {
    requireBudgetClearance: false,
    requireFutureSchedule: false,
  };
  const v = planTransition({
    campaign: { ...base, scheduledFor: '2026-01-01T00:00:00.000Z' },
    to: 'scheduled',
    now: AGORA,
    settings,
  });
  assert.equal(v.allowed, true);
});

// --- ⭐ a lei anti-viés, provada ------------------------------------------

test('SEM configuração, publicar NÃO exige verba aprovada — o produto não presume burocracia', () => {
  const v = planTransition({ campaign: base, to: 'published', now: AGORA });
  assert.equal(v.allowed, true, 'o default não pode ser o processo de uma empresa');
});

test('COM a exigência ligada pelo tenant, publicar sem aprovação é recusado', () => {
  const settings: MarketingSettings = {
    requireBudgetClearance: true,
    requireFutureSchedule: true,
  };
  const v = planTransition({ campaign: base, to: 'published', now: AGORA, settings });
  assert.equal(v.allowed === false && v.refusal.code, 'budget-not-cleared');
});

test('COM a exigência ligada e verba aprovada, publica', () => {
  const settings: MarketingSettings = {
    requireBudgetClearance: true,
    requireFutureSchedule: true,
  };
  const v = planTransition({
    campaign: { ...base, budgetStatus: 'approved' },
    to: 'published',
    now: AGORA,
    settings,
  });
  assert.equal(v.allowed, true);
});

test('verba reprovada dá uma mensagem diferente de verba ausente', () => {
  const settings: MarketingSettings = {
    requireBudgetClearance: true,
    requireFutureSchedule: true,
  };
  const reprovada = planTransition({
    campaign: { ...base, budgetStatus: 'rejected' },
    to: 'published',
    now: AGORA,
    settings,
  });
  const ausente = planTransition({ campaign: base, to: 'published', now: AGORA, settings });
  assert.notEqual(
    reprovada.allowed === false && reprovada.refusal.message,
    ausente.allowed === false && ausente.refusal.message,
  );
});

test('cancelar nunca é bloqueado por verba — parar de gastar não precisa de autorização de gasto', () => {
  const settings: MarketingSettings = {
    requireBudgetClearance: true,
    requireFutureSchedule: true,
  };
  const v = planTransition({ campaign: base, to: 'cancelled', now: AGORA, settings });
  assert.equal(v.allowed, true);
});

// --- higiene -------------------------------------------------------------

test('campanha sem nome não sai do rascunho', () => {
  const v = planTransition({ campaign: { ...base, name: '   ' }, to: 'published', now: AGORA });
  assert.equal(v.allowed === false && v.refusal.code, 'name-empty');
});

test('mas campanha sem nome PODE ser cancelada — senão o rascunho ruim fica preso', () => {
  const v = planTransition({ campaign: { ...base, name: '' }, to: 'cancelled', now: AGORA });
  assert.equal(v.allowed, true);
});

test('passar para o mesmo estado é recusado com código próprio', () => {
  const v = planTransition({ campaign: base, to: 'draft', now: AGORA });
  assert.equal(v.allowed === false && v.refusal.code, 'same-status');
});

// --- a projeção consultada ao contrário ----------------------------------

const aprovacao = (ref: string, decision: 'approved' | 'rejected'): SpendApproval => ({
  id: `id-${ref}`,
  tenantId: 't1',
  sourceModuleId: 'recon',
  externalRef: ref,
  decision,
  amountCents: 500_00,
  currency: 'BRL',
  decidedAt: '2026-07-20T00:00:00.000Z',
  receivedAt: '2026-07-20T00:00:01.000Z',
});

test('a decisão que chegou ANTES da campanha existir é encontrada depois', () => {
  const projecao = [aprovacao('AP-1', 'approved')];
  assert.equal(budgetStatusFor('AP-1', projecao), 'approved');
});

test('campanha sem referência financeira nunca tem verba aprovada', () => {
  assert.equal(budgetStatusFor(null, [aprovacao('AP-1', 'approved')]), 'none');
});

test('referência sem decisão conhecida é "none", não "rejected"', () => {
  assert.equal(budgetStatusFor('AP-9', [aprovacao('AP-1', 'approved')]), 'none');
});

// --- o resumo da carteira ------------------------------------------------

const campanha = (over: Partial<Campaign>): Campaign => ({
  id: 'c',
  tenantId: 't1',
  name: 'x',
  description: '',
  status: 'draft',
  scheduledFor: null,
  publishedAt: null,
  completedAt: null,
  budgetPlannedCents: null,
  currency: null,
  budgetRef: null,
  budgetStatus: 'none',
  audienceNote: '',
  ...over,
});

test('o resumo conta quem está esperando verba, e ignora as terminais', () => {
  const r = summarizeCampaigns([
    campanha({ budgetRef: 'AP-1' }),
    campanha({ budgetRef: 'AP-2', status: 'published' }),
    // Cancelada com verba pendente não é cobrança a fazer — é assunto morto.
    campanha({ budgetRef: 'AP-3', status: 'cancelled' }),
    campanha({ budgetRef: 'AP-4', budgetStatus: 'approved' }),
    campanha({}),
  ]);
  assert.equal(r.total, 5);
  assert.equal(r.live, 1);
  assert.equal(r.awaitingBudget, 2);
});
