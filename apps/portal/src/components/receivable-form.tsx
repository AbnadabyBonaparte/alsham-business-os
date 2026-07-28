'use client';

import { useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';

import { registerReceivable } from '@/app/ar-actions';
import { ErrorState, Panel } from '@/components/states';

/**
 * Registrar um título a receber.
 *
 * ⭐ **Este componente não valida regra de negócio.** Ele coleta o formulário e
 * chama a Server Action, que chama `validateNewReceivable()`. Os erros que
 * aparecem são os que o pacote devolveu, campo a campo.
 *
 * ⚠️ Repare no que **não** existe: nenhum campo de boleto, PIX, carnê ou código
 * de barras; nenhuma lista de bancos ou adquirentes; nenhum juros, multa ou
 * régua de cobrança. Instrumento de cobrança é de um país e de uma década, e
 * política de cobrança é o processo de UMA empresa — a capacidade *Cobrança* é
 * outra peça do Domain, e está NÃO CONSTRUÍDA.
 */
export function ReceivableForm({ canManage }: { canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <ErrorState
        title="Você não pode registrar títulos a receber neste tenant"
        detail="Esta ação exige a permissão ar.receivable.manage. Peça a quem administra a empresa."
      />
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25"
      >
        Novo título a receber
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    setCampos({});
    const valor = String(formData.get('amount') ?? '').trim();

    startTransition(async () => {
      const r = await registerReceivable({
        externalRef: String(formData.get('externalRef') ?? ''),
        dueDate: String(formData.get('dueDate') ?? ''),
        // Centavos, inteiros. Sem ponto flutuante em dinheiro, nunca.
        amountCents: valor ? Math.round(Number(valor) * 100) : undefined,
        currency: String(formData.get('currency') ?? '').trim().toUpperCase(),
        payerName: String(formData.get('payerName') ?? ''),
        counterpartyTaxId: String(formData.get('counterpartyTaxId') ?? ''),
        description: String(formData.get('description') ?? ''),
        settlementMethod: String(formData.get('settlementMethod') ?? ''),
      });

      if (!r.ok) {
        setErro(r.message);
        if ('problems' in r && r.problems) {
          setCampos(Object.fromEntries(r.problems.map((p) => [p.field, p.message])));
        }
        return;
      }
      formRef.current?.reset();
      setCampos({});
      setAberto(false);
    });
  }

  return (
    <Panel className="px-6 py-6">
      <form ref={formRef} action={salvar} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Referência do documento"
            hint="Como este título é identificado na origem. É também a chave que impede o mesmo documento de entrar duas vezes."
            erro={campos.externalRef}
          >
            <input name="externalRef" required maxLength={120} className={INPUT} />
          </Campo>

          <Campo
            label="Vencimento"
            hint="Data no passado é aceita — é justamente o que se quer cobrar."
            erro={campos.dueDate}
          >
            <input name="dueDate" type="date" required className={INPUT} />
          </Campo>

          <Campo label="Valor" hint="O valor a receber, sempre positivo." erro={campos.amountCents}>
            <input name="amount" type="number" step="0.01" min="0.01" required className={INPUT} />
          </Campo>

          <Campo
            label="Moeda"
            hint="Código ISO de três letras. Sem padrão: presumir a moeda seria presumir o país."
            erro={campos.currency}
          >
            <input
              name="currency"
              required
              maxLength={3}
              placeholder="BRL"
              className={`${INPUT} uppercase`}
            />
          </Campo>

          <Campo
            label="Pagador"
            hint="Opcional — há crédito a receber sem contraparte nomeada."
            erro={campos.payerName}
          >
            <input name="payerName" maxLength={200} className={INPUT} />
          </Campo>

          <Campo
            label="Identificador fiscal da contraparte"
            hint="Opcional. Neutro de país: cada um põe o seu."
          >
            <input name="counterpartyTaxId" maxLength={64} className={INPUT} />
          </Campo>

          <Campo
            label="Forma de recebimento"
            hint="Texto livre, e de propósito: instrumento de cobrança é de um país e de uma década."
          >
            <input name="settlementMethod" maxLength={120} className={INPUT} />
          </Campo>
        </div>

        <Campo label="Descrição" hint="Opcional. O que é este título." erro={campos.description}>
          <textarea name="description" rows={2} maxLength={500} className={INPUT} />
        </Campo>

        {erro ? (
          <p role="alert" className="text-sm text-bos-danger">
            {erro}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-bos-accent bg-bos-accent/20 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
          >
            {pending ? 'Registrando…' : 'Registrar título'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="text-sm text-bos-muted transition-colors hover:text-bos-text"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

const INPUT = 'w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text';

function Campo({
  label,
  hint,
  erro,
  children,
}: {
  label: string;
  hint?: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-bos-text">{label}</span>
      {children}
      {erro ? (
        <span className="text-xs text-bos-danger">{erro}</span>
      ) : hint ? (
        <span className="text-xs text-bos-muted">{hint}</span>
      ) : null}
    </label>
  );
}
