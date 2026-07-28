'use client';

import { useState, useTransition } from 'react';

import type { ShelfItem, ShelfState } from '@alsham/permissions';

import { installModuleAction, uninstallModuleAction } from '@/app/store-actions';
import { Badge, EmptyState, Panel } from '@/components/states';

/**
 * A prateleira da Store.
 *
 * ⭐ Este componente **não decide nada**. Recebe a prateleira pronta de
 * `buildShelf()` e desenha. A recusa que aparece no erro é a mensagem que
 * `core.install_module()` devolveu — palavra por palavra, porque ela foi
 * escrita para o humano ler ("o tenant não tem o papel X", "o plano permite N").
 *
 * Instalar e desinstalar têm **confirmação explícita em dois passos** (padrão
 * CRIVO). Desinstalar diz, na confirmação, o que acontece com o dado — porque
 * é a pergunta que a pessoa está fazendo em silêncio.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<ShelfState, string> = {
  available: 'disponível',
  installing: 'instalando',
  installed: 'instalado',
  suspended: 'suspenso',
  'previously-installed': 'já instalado antes',
};

const TOM: Record<ShelfState, Tone> = {
  available: 'neutral',
  installing: 'info',
  installed: 'success',
  suspended: 'warning',
  'previously-installed': 'neutral',
};

export function StoreShelf({
  items,
  roles,
  canInstall,
}: {
  items: readonly ShelfItem[];
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhum módulo publicado ainda"
        hint="A vitrine mostra só o que está publicado. Rascunho e depreciado não aparecem — e não é a tela que filtra: é a policy do banco."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <ModuleCard key={item.entry.moduleId} item={item} roles={roles} canInstall={canInstall} />
      ))}
    </div>
  );
}

function ModuleCard({
  item,
  roles,
  canInstall,
}: {
  item: ShelfItem;
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
}) {
  const { entry, state } = item;
  const emUso = state === 'installed' || state === 'installing' || state === 'suspended';

  return (
    <Panel className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-bos-text">{entry.name}</h2>
          <p className="mt-1 max-w-2xl text-sm text-bos-muted">{entry.summary}</p>
          <p className="mt-2 font-mono text-[11px] text-bos-muted">
            {entry.moduleId} · v{entry.version} · {entry.layer === 'domain' ? 'Domain' : 'Vertical'}{' '}
            {entry.domainKey ?? entry.verticalKey}
            {item.installedVersion ? ` · você tem a v${item.installedVersion}` : ''}
          </p>
        </div>
        <Badge tone={TOM[state]}>{ROTULO[state]}</Badge>
      </div>

      <div className="mt-5 grid gap-5 border-t border-bos-border pt-5 sm:grid-cols-2">
        <Bloco titulo="Capacidades">
          {entry.capabilities.length === 0 ? (
            <Vazio>nenhuma declarada</Vazio>
          ) : (
            <ul className="flex flex-col gap-1">
              {entry.capabilities.map((c) => (
                <li key={c.key} className="text-xs text-bos-text">
                  {c.canonicalName}
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Permissões que o módulo registra">
          <ul className="flex flex-col gap-1">
            {entry.permissions.map((p) => (
              <li key={p.key} className="text-xs text-bos-muted">
                <span className="font-mono text-bos-text">{p.key}</span>
              </li>
            ))}
          </ul>
        </Bloco>

        <Bloco titulo="Fatos que ele conta">
          {entry.emits.length === 0 ? (
            <Vazio>nenhum</Vazio>
          ) : (
            <ul className="flex flex-col gap-1">
              {entry.emits.map((e) => (
                <li key={e.type} className="font-mono text-[11px] text-bos-muted">
                  {e.type}
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Fatos que ele escuta">
          {entry.consumes.length === 0 ? (
            <Vazio>nenhum — funciona sozinho</Vazio>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {entry.consumes.map((e) => (
                  <li key={e.type} className="font-mono text-[11px] text-bos-muted">
                    {e.type}
                  </li>
                ))}
              </ul>
              {/* ⭐ HONESTIDADE NA VITRINE. Dizer "consome eventos" sem dizer
                  de quem faria a Store prometer uma reação que depende de um
                  módulo que o cliente talvez não tenha. */}
              {item.listensTo.length > 0 ? (
                <p className="mt-2 text-[11px] text-bos-muted">
                  Só reage se <strong className="text-bos-text">{item.listensTo.join(', ')}</strong>{' '}
                  também estiver instalado e emitindo. Sem isso, o módulo funciona — apenas não é
                  acordado.
                </p>
              ) : null}
            </>
          )}
        </Bloco>
      </div>

      <div className="mt-5 border-t border-bos-border pt-4">
        <Acoes item={item} roles={roles} canInstall={canInstall} emUso={emUso} />
      </div>
    </Panel>
  );
}

function Acoes({
  item,
  roles,
  canInstall,
  emUso,
}: {
  item: ShelfItem;
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
  emUso: boolean;
}) {
  const [armado, setArmado] = useState<'install' | 'uninstall' | null>(null);
  const [papel, setPapel] = useState(roles[0]?.key ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE é `core.install_module()`, na primeira
  // linha dela, com a sessão do usuário.
  if (!canInstall) {
    return (
      <span className="text-xs text-bos-muted">
        Instalar e desinstalar exigem a permissão{' '}
        <code className="font-mono">core.module.install</code>.
      </span>
    );
  }

  function agir(acao: 'install' | 'uninstall') {
    setErro(null);
    startTransition(async () => {
      const r =
        acao === 'install'
          ? await installModuleAction({ moduleId: item.entry.moduleId, roleKey: papel })
          : await uninstallModuleAction({ moduleId: item.entry.moduleId });
      if (!r.ok) setErro(r.message);
      setArmado(null);
    });
  }

  if (armado === 'install') {
    return (
      <div className="flex flex-col gap-3">
        <p className="max-w-2xl text-xs text-bos-muted">
          As {item.entry.permissions.length} permissões deste módulo serão concedidas ao papel
          escolhido, e o Core registra <code className="font-mono">core.module.installed</code>.
        </p>
        {roles.length === 0 ? (
          <p className="text-xs text-bos-danger">
            Este tenant ainda não tem nenhum papel próprio. Crie um antes de instalar — as
            permissões do módulo não podem ir para um papel de sistema, que valeria em todos os
            tenants.
          </p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-bos-text">Papel que recebe as permissões</span>
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              className="max-w-xs rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Botoes
          confirmar="Confirmar instalação"
          onConfirmar={() => agir('install')}
          onCancelar={() => setArmado(null)}
          pending={pending}
          desabilitado={roles.length === 0}
          erro={erro}
        />
      </div>
    );
  }

  if (armado === 'uninstall') {
    return (
      <div className="flex flex-col gap-3">
        {/* A pergunta que a pessoa está fazendo em silêncio, respondida antes
            de ela clicar. */}
        <p className="max-w-2xl text-xs text-bos-muted">
          O acesso ao módulo é cortado e as permissões dele são revogadas neste tenant.{' '}
          <strong className="text-bos-text">Nenhum dado é apagado</strong> — o que o módulo já
          gravou continua no banco, e reinstalar devolve o acesso a ele.
        </p>
        <Botoes
          confirmar="Confirmar desinstalação"
          onConfirmar={() => agir('uninstall')}
          onCancelar={() => setArmado(null)}
          pending={pending}
          erro={erro}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {emUso ? (
        <button
          type="button"
          onClick={() => setArmado('uninstall')}
          className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors hover:border-bos-danger"
        >
          Desinstalar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setArmado('install')}
          className="rounded-md border border-bos-accent bg-bos-accent/15 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-accent/25"
        >
          {item.state === 'previously-installed' ? 'Reinstalar' : 'Instalar'}
        </button>
      )}
      {item.state === 'previously-installed' ? (
        <span className="text-[11px] text-bos-muted">
          Os dados desta instalação anterior continuam no banco.
        </span>
      ) : null}
      {erro ? <span className="text-xs text-bos-danger">{erro}</span> : null}
    </div>
  );
}

function Botoes({
  confirmar,
  onConfirmar,
  onCancelar,
  pending,
  desabilitado = false,
  erro,
}: {
  confirmar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  pending: boolean;
  desabilitado?: boolean;
  erro: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onConfirmar}
        disabled={pending || desabilitado}
        className="rounded-md border border-bos-accent bg-bos-accent/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
      >
        {pending ? 'registrando…' : confirmar}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        disabled={pending}
        className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-muted transition-colors hover:text-bos-text"
      >
        Cancelar
      </button>
      {erro ? <span className="max-w-xl text-xs text-bos-danger">{erro}</span> : null}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] uppercase tracking-wide text-bos-muted">{titulo}</h3>
      {children}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-bos-muted">{children}</p>;
}
