import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ApprovalItem,
  BankStatement,
  CsvMapping,
  MatchingSettings,
  Payable,
  Receivable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import { DataPortError, type DataPort } from './port';

/**
 * Adapter REAL — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 * Ela ignora toda a RLS: quem a usa vê todos os tenants. O painel usa a chave
 * publicável e a sessão do usuário, e é isso que faz o isolamento provado no
 * CI valer também na tela.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio. Ele traduz linha de banco
 * em tipo do domínio e volta. Zero cálculo, zero decisão, zero parsing.
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const RECON = 'recon';
const CORE = 'core';

/** Traduz o erro do banco em mensagem apresentável. Nunca vaza stack na tela. */
function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createSupabasePort(db: SupabaseClient, tenantId: string): DataPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'recon.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadMatchingSettings(): Promise<MatchingSettings> {
      const raw = await loadSettings(db, tenantId);
      const matching = (raw.matching ?? {}) as Record<string, unknown>;

      // ⚠️ Sem valores padrão inventados. Configuração ausente é um fato a
      // reportar, não um número a chutar — chutar um limiar seria decidir a
      // política do tenant dentro do app.
      const { amountToleranceCents, dateToleranceDays, minScore } = matching;
      if (
        typeof amountToleranceCents !== 'number' ||
        typeof dateToleranceDays !== 'number' ||
        typeof minScore !== 'number'
      ) {
        throw new DataPortError(
          'A política de conciliação deste tenant não está configurada (settings.matching). Configure antes de conciliar.',
        );
      }
      return { amountToleranceCents, dateToleranceDays, minScore };
    },

    async loadCsvMapping(): Promise<CsvMapping | null> {
      const raw = await loadSettings(db, tenantId);
      const imp = (raw.import ?? {}) as Record<string, unknown>;
      const mapping = imp.csvMapping;
      // O formato é validado pelo parser, que devolve erro legível. Aqui só
      // se distingue "não configurado" de "configurado".
      return mapping && typeof mapping === 'object' ? (mapping as CsvMapping) : null;
    },

    async loadStatementLines(): Promise<StatementLine[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('statement_lines')
        .select(LINE_COLS)
        .in('status', ['unmatched', 'suggested'])
        .order('posted_at', { ascending: true });
      if (error) fail('carregar as linhas do extrato', error);
      return (data ?? []).map(toLine);
    },

    async loadLinesOfStatement(statementId): Promise<StatementLine[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('statement_lines')
        .select(LINE_COLS)
        .eq('statement_id', statementId)
        .order('line_no', { ascending: true });
      if (error) fail('carregar as linhas deste extrato', error);
      return (data ?? []).map(toLine);
    },

    async loadOpenStatements(): Promise<BankStatement[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('bank_statements')
        .select(
          'id, tenant_id, account_ref, source_format, original_filename, content_hash, period_start, period_end, opening_balance_cents, closing_balance_cents, currency, status, imported_at',
        )
        .in('status', ['imported', 'reconciling'])
        .order('period_end', { ascending: false });
      if (error) fail('carregar os extratos abertos', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        accountRef: r.account_ref as string,
        sourceFormat: r.source_format as BankStatement['sourceFormat'],
        originalFilename: r.original_filename as string | null,
        contentHash: r.content_hash as string,
        periodStart: r.period_start as string,
        periodEnd: r.period_end as string,
        openingBalanceCents:
          r.opening_balance_cents === null ? null : Number(r.opening_balance_cents),
        closingBalanceCents:
          r.closing_balance_cents === null ? null : Number(r.closing_balance_cents),
        currency: r.currency as string,
        status: r.status as BankStatement['status'],
        importedAt: r.imported_at as string,
      }));
    },

    async loadPayables(): Promise<Payable[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('payables')
        .select(
          'id, tenant_id, source, source_module_id, external_ref, due_date, amount_cents, settled_amount_cents, currency, supplier_name, supplier_tax_id, description, status',
        )
        .in('status', ['open', 'partially_settled'])
        .order('due_date', { ascending: true });
      if (error) fail('carregar os títulos a pagar', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        source: r.source as Payable['source'],
        sourceModuleId: r.source_module_id as string | null,
        externalRef: r.external_ref as string,
        dueDate: r.due_date as string,
        amountCents: Number(r.amount_cents),
        settledAmountCents: Number(r.settled_amount_cents),
        currency: r.currency as string,
        supplierName: r.supplier_name as string | null,
        supplierTaxId: r.supplier_tax_id as string | null,
        description: (r.description ?? '') as string,
        status: r.status as Payable['status'],
      }));
    },

    async loadReceivables(): Promise<Receivable[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('receivables')
        .select(
          'id, tenant_id, source, source_module_id, external_ref, due_date, amount_cents, received_amount_cents, currency, counterparty_name, counterparty_tax_id, description, status',
        )
        .in('status', ['open', 'partially_received'])
        .order('due_date', { ascending: true });
      if (error) fail('carregar os títulos a receber', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        source: r.source as Receivable['source'],
        sourceModuleId: r.source_module_id as string | null,
        externalRef: r.external_ref as string,
        dueDate: r.due_date as string,
        amountCents: Number(r.amount_cents),
        receivedAmountCents: Number(r.received_amount_cents),
        currency: r.currency as string,
        counterpartyName: r.counterparty_name as string | null,
        counterpartyTaxId: r.counterparty_tax_id as string | null,
        description: (r.description ?? '') as string,
        status: r.status as Receivable['status'],
      }));
    },

    async loadApprovalQueue(): Promise<ApprovalItem[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('approval_queue')
        .select(
          'id, tenant_id, subject_type, subject_id, title, amount_cents, currency, status, requested_at, requested_by, decided_at, decided_by, decision_note',
        )
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (error) fail('carregar a fila de aprovação', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        subjectType: r.subject_type as ApprovalItem['subjectType'],
        subjectId: r.subject_id as string,
        title: r.title as string,
        amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
        currency: r.currency as string | null,
        status: r.status as ApprovalItem['status'],
        requestedAt: r.requested_at as string,
        requestedBy: r.requested_by as string | null,
        decidedAt: r.decided_at as string | null,
        decidedBy: r.decided_by as string | null,
        decisionNote: r.decision_note as string | null,
      }));
    },

    async importStatement({ accountRef, currency, format, originalFilename, contentHash, parsed }) {
      const { data: stmt, error: stmtErr } = await db
        .schema(RECON)
        .from('bank_statements')
        .insert({
          tenant_id: tenantId,
          account_ref: accountRef,
          source_format: format,
          original_filename: originalFilename,
          content_hash: contentHash,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          opening_balance_cents: parsed.openingBalanceCents ?? null,
          closing_balance_cents: parsed.closingBalanceCents ?? null,
          currency,
        })
        .select('id')
        .single();

      if (stmtErr) {
        // 23505 = unique_violation. É o `bank_statements_no_reimport`
        // fazendo o trabalho dele: o mesmo arquivo, na mesma conta, duas vezes.
        if ((stmtErr as { code?: string }).code === '23505') {
          throw new DataPortError(
            'Este extrato já foi importado antes (mesmo arquivo, mesma conta). Nada foi duplicado.',
            { cause: stmtErr },
          );
        }
        fail('gravar o extrato', stmtErr);
      }

      const statementId = stmt?.id as string;

      const { error: linesErr } = await db
        .schema(RECON)
        .from('statement_lines')
        .insert(
          parsed.lines.map((l) => ({
            tenant_id: tenantId,
            statement_id: statementId,
            line_no: l.lineNo,
            posted_at: l.postedAt,
            value_date: l.valueDate ?? null,
            amount_cents: l.amountCents,
            currency,
            description: l.description,
            counterparty_name: l.counterpartyName ?? null,
            counterparty_tax_id: l.counterpartyTaxId ?? null,
            external_id: l.externalId ?? null,
            balance_after_cents: l.balanceAfterCents ?? null,
          })),
        );

      if (linesErr) {
        // O extrato ficou sem linhas. Dizer isso é melhor do que deixar o
        // operador achar que importou um extrato vazio.
        throw new DataPortError(
          'O extrato foi criado mas as linhas não entraram. Descarte-o e importe de novo.',
          { cause: linesErr },
        );
      }

      return { statementId, lineCount: parsed.lines.length };
    },

    async closeStatement(statementId) {
      await mudarStatus(db, statementId, 'closed', 'fechar o extrato');
    },

    async discardStatement(statementId) {
      await mudarStatus(db, statementId, 'discarded', 'descartar o extrato');
    },

    async decideMatch({ decision, suggestion }) {
      const now = new Date().toISOString();
      const row = {
        statement_line_id: suggestion.statementLineId,
        payable_id: suggestion.kind === 'payable' ? suggestion.payableId : null,
        receivable_id: suggestion.kind === 'receivable' ? suggestion.receivableId : null,
        matched_amount_cents: suggestion.matchedAmountCents,
        score: suggestion.score,
        origin: 'auto',
        strategy: suggestion.strategy,
        status: decision,
        decided_at: now,
      };

      // Tenta achar um casamento suggested já persistido para o mesmo par.
      let query = db.schema(RECON).from('reconciliation_matches').select('id');
      query = query.eq('statement_line_id', suggestion.statementLineId);
      if (suggestion.kind === 'payable') {
        query = query.eq('payable_id', suggestion.payableId!);
      } else {
        query = query.eq('receivable_id', suggestion.receivableId!);
      }
      const { data: existing, error: findErr } = await query.maybeSingle();
      if (findErr) fail('localizar o casamento sugerido', findErr);

      if (existing?.id) {
        const { data, error } = await db
          .schema(RECON)
          .from('reconciliation_matches')
          .update({ status: decision, decided_at: now })
          .eq('id', existing.id)
          .select('id');
        if (error) fail('registrar sua decisão sobre o casamento', error);
        if (!data || data.length === 0) {
          throw new DataPortError(
            'A decisão não foi gravada: você não tem permissão para gerir casamentos neste tenant.',
          );
        }
        return;
      }

      // Sugestão só em memória: grava já decidida — o trigger emite no INSERT.
      const { data: line, error: lineErr } = await db
        .schema(RECON)
        .from('statement_lines')
        .select('tenant_id')
        .eq('id', suggestion.statementLineId)
        .maybeSingle();
      if (lineErr) fail('ler a linha do extrato', lineErr);
      if (!line?.tenant_id) {
        throw new DataPortError('Linha do extrato não encontrada neste tenant.');
      }

      const { data, error } = await db
        .schema(RECON)
        .from('reconciliation_matches')
        .insert({ ...row, tenant_id: line.tenant_id })
        .select('id');
      if (error) fail('registrar sua decisão sobre o casamento', error);
      if (!data || data.length === 0) {
        throw new DataPortError(
          'A decisão não foi gravada: você não tem permissão para gerir casamentos neste tenant.',
        );
      }
    },

    async decideApproval({ approvalId, decision, note }) {
      const { data, error } = await db
        .schema(RECON)
        .from('approval_queue')
        .update({
          status: decision,
          decided_at: new Date().toISOString(),
          decision_note: note ?? null,
        })
        .eq('id', approvalId)
        .select('id');
      if (error) fail('registrar sua decisão', error);
      if (!data || data.length === 0) {
        throw new DataPortError(
          'A decisão não foi gravada: você não tem a permissão recon.approval.decide neste tenant.',
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// auxiliares — tradução de linha, nada mais
// ---------------------------------------------------------------------------

const LINE_COLS =
  'id, tenant_id, statement_id, line_no, posted_at, value_date, amount_cents, currency, description, counterparty_name, counterparty_tax_id, external_id, balance_after_cents, status';

function toLine(r: Record<string, unknown>): StatementLine {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    statementId: r.statement_id as string,
    lineNo: r.line_no as number,
    postedAt: r.posted_at as string,
    valueDate: r.value_date as string | null,
    amountCents: Number(r.amount_cents),
    currency: r.currency as string,
    description: (r.description ?? '') as string,
    counterpartyName: r.counterparty_name as string | null,
    counterpartyTaxId: r.counterparty_tax_id as string | null,
    externalId: r.external_id as string | null,
    balanceAfterCents:
      r.balance_after_cents === null ? null : Number(r.balance_after_cents),
    status: r.status as StatementLine['status'],
  };
}

async function loadSettings(
  db: SupabaseClient,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .schema(CORE)
    .from('tenant_modules')
    .select('settings')
    .eq('tenant_id', tenantId)
    .eq('module_id', 'recon')
    .maybeSingle();
  if (error) fail('carregar a configuração do módulo', error);
  return (data?.settings ?? {}) as Record<string, unknown>;
}

async function mudarStatus(
  db: SupabaseClient,
  statementId: string,
  status: 'closed' | 'discarded',
  oQue: string,
): Promise<void> {
  const { data, error } = await db
    .schema(RECON)
    .from('bank_statements')
    .update({ status })
    .eq('id', statementId)
    .select('id');
  if (error) fail(oQue, error);
  // Zero linhas = a policy barrou. Não é sucesso silencioso.
  if (!data || data.length === 0) {
    throw new DataPortError(
      `Nada foi alterado: você não tem a permissão recon.statement.import neste tenant.`,
    );
  }
}
