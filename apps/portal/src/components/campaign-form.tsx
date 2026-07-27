'use client';

import { useRef, useState, useTransition } from 'react';

import { createCampaignDraft } from '@/app/marketing-actions';
import { ErrorState, Panel } from '@/components/states';

/**
 * Criar rascunho de campanha.
 *
 * ⭐ **Este componente não valida regra de negócio.** Ele coleta o formulário
 * e chama a Server Action, que chama o motor. O único tratamento aqui é
 * converter o que o `<input>` devolve (string) no que o domínio usa (centavos,
 * ISO) — que é tradução de formato, não decisão.
 *
 * ⚠️ Repare no que **não** existe neste formulário: nenhum seletor de "tipo de
 * campanha", nenhuma lista de canais, nenhum segmento de público. Toda lista
 * dessas seria o marketing de UMA empresa — ou de uma década — congelado na
 * tela (Lei anti-viés).
 */
export function CampaignForm({ canManage }: { canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <ErrorState
        title="Você não pode criar campanhas neste tenant"
        detail="Esta ação exige a permissão marketing.campaign.manage. Peça a quem administra a empresa."
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
        Nova campanha
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    const centavos = String(formData.get('budget') ?? '').trim();
    const moeda = String(formData.get('currency') ?? '').trim().toUpperCase();
    const quando = String(formData.get('scheduledFor') ?? '').trim();

    startTransition(async () => {
      const r = await createCampaignDraft({
        name: String(formData.get('name') ?? ''),
        description: String(formData.get('description') ?? ''),
        audienceNote: String(formData.get('audienceNote') ?? ''),
        // `datetime-local` devolve hora local sem fuso; o servidor normaliza.
        scheduledFor: quando ? new Date(quando).toISOString() : null,
        // Centavos, inteiros. Sem ponto flutuante em dinheiro, nunca.
        budgetPlannedCents: centavos ? Math.round(Number(centavos) * 100) : null,
        currency: centavos ? moeda || null : null,
        budgetRef: String(formData.get('budgetRef') ?? '').trim() || null,
      });
      if (!r.ok) {
        setErro(r.message);
        return;
      }
      formRef.current?.reset();
      setAberto(false);
    });
  }

  return (
    <Panel className="px-6 py-6">
      <form ref={formRef} action={salvar} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nome" hint="Como a campanha será encontrada depois.">
            <input
              name="name"
              required
              maxLength={160}
              className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
            />
          </Campo>

          <Campo label="Quando vai ao ar" hint="Opcional. Necessário para agendar.">
            <input
              name="scheduledFor"
              type="datetime-local"
              className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
            />
          </Campo>
        </div>

        <Campo label="Descrição" hint="O que esta campanha se propõe a fazer.">
          <textarea
            name="description"
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </Campo>

        <Campo
          label="Público"
          hint="Texto livre, de propósito: segmentação estruturada é capacidade própria e difere por canal."
        >
          <input
            name="audienceNote"
            maxLength={500}
            className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Verba prevista" hint="Opcional.">
            <input
              name="budget"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
            />
          </Campo>

          <Campo label="Moeda" hint="ISO 4217 — sem moeda presumida.">
            <input
              name="currency"
              maxLength={3}
              placeholder="BRL"
              className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm uppercase text-bos-text"
            />
          </Campo>

          <Campo
            label="Referência da verba"
            hint="A referência do item financeiro que banca esta campanha, no sistema que a sua empresa usa."
          >
            <input
              name="budgetRef"
              maxLength={120}
              className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 font-mono text-sm text-bos-text"
            />
          </Campo>
        </div>

        <p className="text-xs text-bos-muted">
          Quando o financeiro decidir sobre essa referência, a campanha fica sabendo sozinha — o
          Core entrega o fato e o módulo carimba. Ninguém precisa vir aqui digitar.
        </p>

        {erro ? <p className="text-xs text-bos-danger">{erro}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-bos-accent bg-bos-accent/20 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
          >
            {pending ? 'salvando…' : 'Salvar rascunho'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            disabled={pending}
            className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-muted transition-colors hover:text-bos-text"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-bos-text">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-bos-muted">{hint}</span> : null}
    </label>
  );
}
