'use server';

import { revalidatePath } from 'next/cache';

import {
  contentHash,
  parseStatement,
  StatementParseError,
} from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';

/**
 * As Server Actions do painel.
 *
 * ⭐ **Leia o que estas funções fazem — e principalmente o que não fazem.**
 *
 * Elas coletam o clique, chamam o pacote e a porta de dados, e devolvem o
 * resultado. Não calculam score, não decidem se o casamento é bom, não aplicam
 * alçada, **não leem arquivo de extrato**. É aqui que a Regra de Ouro mais
 * escorrega — basta escrever "se valor > X exige dois aprovadores" ou um
 * `split(';')` neste arquivo *porque era mais rápido*.
 *
 * Quem autoriza é o **banco**: as policies exigem a permissão. Se faltar, o
 * UPDATE afeta zero linhas e o adapter lança. A tela esconder o botão é
 * cortesia; a policy é a segurança.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError || err instanceof StatementParseError) {
    return { ok: false, message: err.message };
  }
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

/** Confirma ou rejeita um casamento sugerido — o "visto" digital. */
export async function decideMatchAction(
  matchId: string,
  decision: 'confirmed' | 'rejected',
): Promise<ActionResult> {
  try {
    const port = await getDataPort();
    await port.decideMatch({ matchId, decision });
    revalidatePath('/conciliacao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Aprova ou rejeita um item da fila. Exige `recon.approval.decide` no banco. */
export async function decideApprovalAction(
  approvalId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<ActionResult> {
  try {
    const port = await getDataPort();
    await port.decideApproval({ approvalId, decision, note });
    revalidatePath('/aprovacoes');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// IMPORTAÇÃO DE EXTRATO
// ---------------------------------------------------------------------------

export interface PreviewResult {
  readonly accountRef: string | null;
  readonly currency: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly contentHash: string;
  readonly lines: readonly {
    readonly lineNo: number;
    readonly postedAt: string;
    readonly amountCents: number;
    readonly description: string;
    readonly counterpartyName: string | null;
    readonly externalId: string | null;
  }[];
}

/**
 * Lê o arquivo e devolve o **preview** — sem gravar nada.
 *
 * ⭐ Note o que esta função NÃO faz: ela não sabe o que é OFX, não conhece
 * separador decimal, não decide sinal de débito. Chama `parseStatement()`, do
 * pacote, e passa adiante o `csvMapping` que veio do banco.
 *
 * Duas linhas fazem o trabalho, e as duas são do pacote:
 * `parseStatement(...)` e `contentHash(...)`.
 */
export async function previewStatementAction(
  formData: FormData,
): Promise<ActionResult<PreviewResult>> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Escolha um arquivo de extrato.' };
    }

    const format = String(formData.get('format') ?? '') as 'ofx' | 'csv';
    if (format !== 'ofx' && format !== 'csv') {
      return { ok: false, message: 'Escolha o formato do arquivo.' };
    }

    const port = await getDataPort();
    const mapping = format === 'csv' ? await port.loadCsvMapping() : undefined;

    const content = await file.text();
    const parsed = parseStatement(format, content, mapping ?? undefined);
    const hash = await contentHash(content);

    if (parsed.lines.length === 0) {
      return { ok: false, message: 'O arquivo foi lido, mas não tem nenhum lançamento.' };
    }

    return {
      ok: true,
      data: {
        accountRef: parsed.accountRef,
        currency: parsed.currency,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        contentHash: hash,
        lines: parsed.lines.map((l) => ({
          lineNo: l.lineNo,
          postedAt: l.postedAt,
          amountCents: l.amountCents,
          description: l.description,
          counterpartyName: l.counterpartyName ?? null,
          externalId: l.externalId ?? null,
        })),
      },
    };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Confirma a importação: relê o arquivo e grava.
 *
 * O arquivo é lido de novo em vez de o preview ser enviado de volta pelo
 * cliente — o que o navegador manda não é fonte de verdade para o que entra no
 * banco. Reler custa milissegundos e fecha a porta para um preview adulterado.
 */
export async function importStatementAction(
  formData: FormData,
): Promise<ActionResult<{ statementId: string; lineCount: number }>> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Escolha um arquivo de extrato.' };
    }

    const format = String(formData.get('format') ?? '') as 'ofx' | 'csv';
    const accountRef = String(formData.get('accountRef') ?? '').trim();
    const currency = String(formData.get('currency') ?? '').trim().toUpperCase();

    if (format !== 'ofx' && format !== 'csv') {
      return { ok: false, message: 'Escolha o formato do arquivo.' };
    }
    if (!accountRef) {
      return { ok: false, message: 'Informe a conta a que este extrato pertence.' };
    }
    // Moeda não tem padrão: presumir a do país seria viés (Lei anti-viés).
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, message: 'Informe a moeda em três letras (ISO 4217), como BRL ou USD.' };
    }

    const port = await getDataPort();
    const mapping = format === 'csv' ? await port.loadCsvMapping() : undefined;

    const content = await file.text();
    const parsed = parseStatement(format, content, mapping ?? undefined);
    const hash = await contentHash(content);

    const result = await port.importStatement({
      accountRef,
      currency,
      format,
      originalFilename: file.name || null,
      contentHash: hash,
      parsed,
    });

    revalidatePath('/conciliacao');
    revalidatePath('/fechamento');
    return { ok: true, data: result };
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// FECHAMENTO DE PERÍODO
// ---------------------------------------------------------------------------

/**
 * Fecha o extrato.
 *
 * É isto que dispara `bank_statements_emit_completed` e põe
 * `recon.reconciliation.completed` na caixa de saída do Core — na mesma
 * transação do `UPDATE`. A action não emite evento nenhum: quem emite é o
 * banco, e é por isso que o evento não pode se perder.
 */
export async function closeStatementAction(statementId: string): Promise<ActionResult> {
  try {
    const port = await getDataPort();
    await port.closeStatement(statementId);
    revalidatePath('/fechamento');
    revalidatePath('/conciliacao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Descarta o extrato — ação destrutiva, com confirmação explícita na tela. */
export async function discardStatementAction(statementId: string): Promise<ActionResult> {
  try {
    const port = await getDataPort();
    await port.discardStatement(statementId);
    revalidatePath('/fechamento');
    revalidatePath('/conciliacao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
