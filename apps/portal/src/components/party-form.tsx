'use client';

import { useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';

import type { PartyRow } from '@/lib/data';
import { registerParty, updatePartyDetails } from '@/app/crm-actions';
import { ErrorState, Panel } from '@/components/states';

/**
 * Cadastrar ou editar uma contraparte.
 *
 * ⭐ **Este componente não valida regra de negócio.** Ele coleta o formulário e
 * chama a Server Action, que chama `validateNewParty()`. Os erros que aparecem
 * são os que o pacote devolveu, campo a campo.
 *
 * ⚠️ Repare no que **não** existe neste formulário: nenhuma máscara de CPF ou
 * CNPJ, nenhum seletor de DDD, nenhum campo de WhatsApp, nenhum estágio de
 * funil, nenhum "tipo de cliente". Máscara de identificador fiscal amarraria o
 * produto a um país; funil seria o processo de UMA empresa virando obrigação de
 * todas. O que separa cliente de fornecedor são as **etiquetas**, e quem as
 * escolhe é o tenant.
 */
export function PartyForm({
  canManage,
  party,
  onDone,
}: {
  canManage: boolean;
  /** Quando presente, o formulário edita em vez de cadastrar. */
  party?: PartyRow;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(party !== undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const editando = party !== undefined;

  if (!canManage) {
    return (
      <ErrorState
        title="Você não pode cadastrar contrapartes neste tenant"
        detail="Esta ação exige a permissão crm.party.manage. Peça a quem administra a empresa."
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
        Nova contraparte
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    setCampos({});

    const comum = {
      kind: String(formData.get('kind') ?? ''),
      displayName: String(formData.get('displayName') ?? ''),
      taxId: String(formData.get('taxId') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      // Vírgula separa. Aparar e desduplicar é do pacote (`normalizeTags`) —
      // aqui só se quebra a string, que é tradução de formato.
      tags: String(formData.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      note: String(formData.get('note') ?? ''),
    };

    startTransition(async () => {
      const r = editando
        ? await updatePartyDetails({ ...comum, partyId: party.id })
        : await registerParty(comum);

      if (!r.ok) {
        setErro(r.message);
        if ('problems' in r && r.problems) {
          setCampos(Object.fromEntries(r.problems.map((p) => [p.field, p.message])));
        }
        return;
      }
      formRef.current?.reset();
      setCampos({});
      if (editando) onDone?.();
      else setAberto(false);
    });
  }

  return (
    <Panel className="px-6 py-6">
      <form ref={formRef} action={salvar} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Pessoa ou organização" erro={campos.kind}>
            <select name="kind" defaultValue={party?.kind ?? 'org'} className={INPUT}>
              <option value="org">Organização</option>
              <option value="person">Pessoa</option>
            </select>
          </Campo>

          <Campo label="Nome" hint="Como esta contraparte é encontrada depois." erro={campos.displayName}>
            <input
              name="displayName"
              required
              maxLength={200}
              defaultValue={party?.displayName ?? ''}
              className={INPUT}
            />
          </Campo>

          <Campo
            label="Identificador fiscal"
            hint="Opcional, e sem formato: cada país põe o seu. Quando informado, não se repete no tenant."
            erro={campos.taxId}
          >
            <input name="taxId" maxLength={64} defaultValue={party?.taxId ?? ''} className={INPUT} />
          </Campo>

          <Campo label="E-mail" hint="Opcional." erro={campos.email}>
            <input name="email" maxLength={160} defaultValue={party?.email ?? ''} className={INPUT} />
          </Campo>

          <Campo label="Telefone" hint="Opcional, e sem formato imposto." erro={campos.phone}>
            <input name="phone" maxLength={160} defaultValue={party?.phone ?? ''} className={INPUT} />
          </Campo>

          <Campo
            label="Etiquetas"
            hint="Separadas por vírgula. É aqui que 'cliente', 'fornecedor' ou o que você usar moram — sem lista fixa."
            erro={campos.tags}
          >
            <input name="tags" defaultValue={(party?.tags ?? []).join(', ')} className={INPUT} />
          </Campo>
        </div>

        <Campo label="Observação" hint="Opcional. Anotação interna — não vira evento." erro={campos.note}>
          <textarea name="note" rows={2} maxLength={2000} defaultValue={party?.note ?? ''} className={INPUT} />
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
            {pending ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar contraparte'}
          </button>
          <button
            type="button"
            onClick={() => (editando ? onDone?.() : setAberto(false))}
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
