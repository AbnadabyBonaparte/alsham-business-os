'use client';

import { useMemo, useState, useTransition } from 'react';

import { canArchive, canRestore, matchesQuery } from '@alsham/crm';
import type { PartyStatus } from '@alsham/crm';

import type { InteractionRow, PartyRow } from '@/lib/data';
import { changePartyStatus } from '@/app/crm-actions';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { PartyForm } from '@/components/party-form';
import { InteractionTimeline } from '@/components/interaction-timeline';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A carteira de contrapartes — agora TABELA DE VERDADE (Mandato de Beleza,
 * Bloco Comercial & CRM). Cada contraparte é uma linha: nome, identificador,
 * contato e a contagem de contatos à direita com tabular figures. O histórico
 * de contato, a edição do cadastro e a ação de arquivar/trazer de volta —
 * **com a confirmação explícita em dois passos** (padrão CRIVO) — vivem numa
 * LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** Se bate com a busca, se pode ser
 * arquivada e se pode voltar são perguntas feitas a `@alsham/crm`. Se alguém
 * escrever `p.displayName.includes(busca)` aqui, há guarda no CI para o dia em
 * que tentarem.
 */

const FILTROS: readonly { key: 'all' | PartyStatus; label: string }[] = [
  { key: 'all', label: 'todas' },
  { key: 'active', label: 'ativas' },
  { key: 'archived', label: 'arquivadas' },
];

export function PartyList({
  parties,
  interactionsByParty,
  canManage,
  canArchiveParties,
  canRecord,
}: {
  parties: readonly PartyRow[];
  /** O histórico já carregado, por contraparte. A tela não busca sozinha. */
  interactionsByParty: Readonly<Record<string, readonly InteractionRow[]>>;
  canManage: boolean;
  canArchiveParties: boolean;
  canRecord: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'all' | PartyStatus>('all');

  const visiveis = useMemo(
    () =>
      parties.filter(
        (p) => (filtro === 'all' || p.status === filtro) && matchesQuery(p, busca),
      ),
    [parties, busca, filtro],
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-center gap-3 px-5 py-4">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, identificador, e-mail ou etiqueta…"
          aria-label="Buscar contrapartes"
          className="min-w-64 flex-1 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
        />
        <div className="flex items-center gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filtro === f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                filtro === f.key
                  ? 'border border-bos-accent bg-bos-accent/20 text-bos-text'
                  : 'border border-bos-border text-bos-muted hover:text-bos-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Panel>

      {parties.length === 0 ? (
        <EmptyState
          title="Nenhuma contraparte cadastrada"
          hint="Cadastre a primeira acima. Cada contraparte e cada contato registrado viram fato contado ao resto da plataforma — sem que este módulo precise conhecer quem escuta."
        />
      ) : visiveis.length === 0 ? (
        <EmptyState
          title="Nenhuma contraparte encontrada"
          hint="Nada bate com a busca ou com o filtro. Limpe os dois para ver a carteira inteira."
        />
      ) : (
        <Panel className="px-2 py-1.5">
          <Table>
            <THead>
              <TR>
                <TH>Contraparte</TH>
                <TH>Contato</TH>
                <TH num>Contatos</TH>
                <TH>Situação</TH>
                <TH className="w-8" />
              </TR>
            </THead>
            <TBody>
              {visiveis.map((p) => (
                <PartyRowItem
                  key={p.id}
                  party={p}
                  interactions={interactionsByParty[p.id] ?? []}
                  canManage={canManage}
                  canArchiveParties={canArchiveParties}
                  canRecord={canRecord}
                />
              ))}
            </TBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

function PartyRowItem({
  party,
  interactions,
  canManage,
  canArchiveParties,
  canRecord,
}: {
  party: PartyRow;
  interactions: readonly InteractionRow[];
  canManage: boolean;
  canArchiveParties: boolean;
  canRecord: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const [editando, setEditando] = useState(false);
  const painelId = `party-${party.id}`;

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{party.displayName}</span>
          {party.taxId ? (
            <span className="ml-2 font-mono text-[11px] text-bos-muted">{party.taxId}</span>
          ) : null}
          <span className="mt-0.5 block text-xs text-bos-muted">
            {party.kind === 'person' ? 'pessoa' : 'organização'}
            {party.tags.length > 0 ? ` · ${party.tags.join(' · ')}` : ''}
          </span>
        </TD>
        <TD className="text-bos-muted">
          {party.email ?? (party.phone ? '' : '—')}
          {party.email && party.phone ? ' · ' : ''}
          {party.phone ?? ''}
        </TD>
        <TD num className="whitespace-nowrap text-bos-muted">
          {interactions.length}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={party.status === 'active' ? 'success' : 'neutral'}>
            {party.status === 'active' ? 'ativa' : 'arquivada'}
          </Badge>
          <span className="mt-0.5 block text-[11px] text-bos-muted">desde {stamp(party.createdAt)}</span>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              {party.note ? (
                <p className="max-w-2xl text-sm text-bos-muted">{party.note}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVerHistorico((v) => !v)}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-surface"
                >
                  {verHistorico ? 'Fechar histórico' : 'Ver histórico de contato'}
                </button>

                {canManage && !editando ? (
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="text-xs text-bos-muted transition-colors hover:text-bos-text"
                  >
                    Editar cadastro
                  </button>
                ) : null}

                <StatusButton party={party} canArchiveParties={canArchiveParties} />
              </div>

              {editando ? (
                <PartyForm canManage={canManage} party={party} onDone={() => setEditando(false)} />
              ) : null}

              {verHistorico ? (
                <InteractionTimeline
                  partyId={party.id}
                  partyName={party.displayName}
                  interactions={interactions}
                  canRecord={canRecord}
                />
              ) : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

/** O que a confirmação diz que vai acontecer. Nunca um "tem certeza?" vago. */
const CONSEQUENCIA: Record<PartyStatus, string> = {
  archived:
    'A contraparte sai da carteira ativa e o Core registra crm.party.archived. Ela NÃO é apagada: continua na lista, e o histórico de contato continua inteiro. Dá para trazê-la de volta depois.',
  active:
    'A contraparte volta para a carteira ativa, com o histórico que ela já tinha. Nenhum evento é emitido — quem escutou o arquivamento guardou o fato, e desfazer é obrigação que nenhum consumidor pediu.',
};

function StatusButton({
  party,
  canArchiveParties,
}: {
  party: PartyRow;
  canArchiveParties: boolean;
}) {
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const destino: PartyStatus | null = canArchive(party.status)
    ? 'archived'
    : canRestore(party.status)
      ? 'active'
      : null;

  if (destino === null) return null;

  // Cortesia de interface. Quem IMPEDE de verdade é o trigger
  // `crm.guard_status_transition()` no banco, provado no CI.
  if (!canArchiveParties) {
    return (
      <span className="text-xs text-bos-muted" title="Falta crm.party.archive">
        Arquivar exige a permissão <code className="font-mono">crm.party.archive</code>.
      </span>
    );
  }

  const rotulo = destino === 'archived' ? 'Arquivar' : 'Trazer de volta';

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className={`rounded-md border px-3 py-1.5 text-xs text-bos-text transition-colors ${
          destino === 'archived'
            ? 'border-bos-danger/50 hover:bg-bos-danger/15'
            : 'border-bos-border hover:bg-bos-surface'
        }`}
      >
        {rotulo}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="max-w-2xl text-xs text-bos-muted">{CONSEQUENCIA[destino]}</p>

      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await changePartyStatus({ partyId: party.id, to: destino });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setArmado(false);
            });
          }}
          className="rounded-md border border-bos-accent bg-bos-accent/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
        >
          {pending ? 'Aplicando…' : `Confirmar: ${rotulo.toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Não fazer nada
        </button>
      </div>
    </div>
  );
}
