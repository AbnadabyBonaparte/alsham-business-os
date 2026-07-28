'use client';

import { useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';

import { registerPayable } from '@/app/ap-actions';
import { ErrorState, Panel } from '@/components/states';

/**
 * Registrar um título a pagar.
 *
 * ⭐ **Este componente não valida regra de negócio.** Ele coleta o formulário e
 * chama a Server Action, que chama `validateNewPayable()`. O único tratamento
 * aqui é converter o que o `<input>` devolve (string) no que o domínio usa
 * (centavos inteiros) — que é tradução de formato, não decisão. Os erros que
 * aparecem são os que o pacote devolveu, campo a campo.
 *
 * ⚠️ Repare no que **não** existe neste formulário: nenhum campo de boleto,
 * PIX, código de barras ou linha digitável; nenhuma lista de bancos; nenhum
 * seletor de plano de contas ou centro de custo. Instrumento de pagamento é de
 * um país e de uma década — a forma de pagar é um campo de texto livre, e a
 * integração de pagamento é Lei 3 (INTEGRAR, não construir).
 *
 * ⚠️ E o identificador fiscal se chama assim mesmo, não "CNPJ": cada país põe o
 * seu.
 */
export function PayableForm({ canManage }: { canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <ErrorState
        title="Você não pode registrar títulos neste tenant"
        detail="Esta ação exige a permissão ap.payable.manage. Peça a quem administra a empresa."
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
        Novo título
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    setCampos({});
    const valor = String(formData.get('amount') ?? '').trim();

    startTransition(async () => {
      const r = await registerPayable({
        externalRef: String(formData.get('externalRef') ?? ''),
        dueDate: String(formData.get('dueDate') ?? ''),
        // Centavos, inteiros. Sem ponto flutuante em dinheiro, nunca.
        amountCents: valor ? Math.round(Number(valor) * 100) : undefined,
        currency: String(formData.get('currency') ?? '').trim().toUpperCase(),
        supplierName: String(formData.get('supplierName') ?? ''),
        counterpartyTaxId: String(formData.get('counterpartyTaxId') ?? ''),
        description: String(formData.get('description') ?? ''),
        paymentMethod: String(formData.get('paymentMethod') ?? ''),
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

          <Campo label="Vencimento" hint="Data no passado é aceita — quem migra tem gaveta cheia." erro={campos.dueDate}>
            <input name="dueDate" type="date" required className={INPUT} />
          </Campo>

          <Campo label="Valor" hint="O valor devido, sempre positivo." erro={campos.amountCents}>
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

          <Campo label="Fornecedor" hint="Opcional — há despesa sem contraparte nomeada." erro={campos.supplierName}>
            <input name="supplierName" maxLength={200} className={INPUT} />
          </Campo>

          <Campo
            label="Identificador fiscal da contraparte"
            hint="Opcional. Neutro de país: cada um põe o seu."
          >
            <input name="counterpartyTaxId" maxLength={64} className={INPUT} />
          </Campo>

          <Campo
            label="Forma de pagamento"
            hint="Texto livre, e de propósito: instrumento de pagamento é de um país e de uma década."
          >
            <input name="paymentMethod" maxLength={120} className={INPUT} />
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

const INPUT =
  'w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text';

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
