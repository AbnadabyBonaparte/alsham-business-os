'use client';

import { useState, useTransition } from 'react';

import type { ShelfItem, ShelfState } from '@alsham/permissions';

import { installModuleAction, uninstallModuleAction } from '@/app/store-actions';
import { Badge, EmptyState, Panel } from '@/components/states';
import {
  mapShelfToTaxonomy,
  type Gallery,
  type TerritorySection,
  type Territory,
} from '@/lib/store-taxonomy';

/**
 * A prateleira da Store — agora com o MAPA INTEIRO.
 *
 * ⭐ Este componente **não decide nada**. Recebe a prateleira pronta de
 * `buildShelf()`, CRUZA com a Taxonomia (`store-taxonomy.ts`) e desenha duas
 * galerias — Domínios Universais e Verticais por Setor. Território com módulo
 * publicado vira **seção viva** (cards do catálogo); território sem módulo vira
 * uma **pill "Em breve"**. Quando uma onda futura publicar um módulo num
 * território hoje vazio, ele gradua para a seção viva sozinho — sem tocar nesta
 * tela.
 *
 * ⚠️ A recusa que aparece no erro é a mensagem que `core.install_module()`
 * devolveu — palavra por palavra. Instalar e desinstalar têm **confirmação
 * explícita em dois passos** (padrão CRIVO), e a lógica deles é a mesma de
 * sempre: só a moldura mudou.
 *
 * ⛔ **"Em breve" é MAPA, não promessa** (Lei 7 / canon de marketing): sem
 * preço, sem botão de instalar, sem lista de capacidade individual. Só o nome
 * do território e a contagem de capacidades DO MAPA.
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

/**
 * O filtro de EXIBIÇÃO da vitrine — os dois grupos que os badges do topo já
 * contam. Não é enum de banco nem estado do módulo: é só qual fatia da
 * prateleira o dono quer olhar agora.
 */
type FiltroGrupo = 'em-uso' | 'disponivel';

/**
 * O grupo de um item — MESMO critério de `summarizeShelf` (o que ocupa vaga no
 * plano: instalado, instalando ou suspenso). É o que garante que "N instalados"
 * filtra exatamente o que "N instalados" conta.
 */
function grupoDoEstado(state: ShelfState): FiltroGrupo {
  return state === 'installed' || state === 'installing' || state === 'suspended'
    ? 'em-uso'
    : 'disponivel';
}

export function StoreShelf({
  items,
  roles,
  canInstall,
  resumo,
  limite,
}: {
  items: readonly ShelfItem[];
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
  resumo: { readonly installed: number; readonly available: number };
  limite: number | null;
}) {
  // ⭐ Estado LOCAL, mutuamente exclusivo. Sem query param: não há padrão de URL
  // state para listas neste portal (só login e troca de tenant o usam), então
  // seguir um inexistente seria inventar convenção. Clicar no badge ativo
  // desliga o filtro.
  const [filtro, setFiltro] = useState<FiltroGrupo | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhum módulo publicado ainda"
        hint="A vitrine mostra só o que está publicado. Rascunho e depreciado não aparecem — e não é a tela que filtra: é a policy do banco."
      />
    );
  }

  const { domains, verticals } = mapShelfToTaxonomy(items);
  const nenhumVisivel =
    filtro !== null && !items.some((i) => grupoDoEstado(i.state) === filtro);

  return (
    <div className="flex flex-col gap-10">
      <FiltroBadges
        filtro={filtro}
        onToggle={(g) => setFiltro((atual) => (atual === g ? null : g))}
        resumo={resumo}
        limite={limite}
        canInstall={canInstall}
      />

      {nenhumVisivel ? (
        <EmptyState
          title={
            filtro === 'em-uso'
              ? 'Nenhum módulo instalado ainda'
              : 'Nada disponível para instalar'
          }
          hint="É só o filtro. Clique de novo no badge ativo para ver a vitrine inteira."
        />
      ) : (
        <div className="flex flex-col gap-14">
          <GalleryView
            gallery={domains}
            eyebrow="O mapa · Domínios Universais"
            title="Domínios Universais"
            blurb="18 territórios que praticamente toda empresa usa. Cada um agrupa suas capacidades; o empacotamento em módulos é decisão de produto."
            roles={roles}
            canInstall={canInstall}
            filtro={filtro}
          />
          <GalleryView
            gallery={verticals}
            eyebrow="O mapa · Verticais por Setor"
            title="Verticais por Setor"
            blurb="29 territórios por ramo. Reutilizam os Domínios e acrescentam só o que é do ofício."
            roles={roles}
            canInstall={canInstall}
            filtro={filtro}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A fileira de badges do topo — agora TOGGLE de filtro (o dono clicou esperando
 * que filtrassem, e não filtravam). São mutuamente exclusivos; o ativo ganha
 * realce com `--bos-accent` (nunca cor nova, IDENTIDADE-VISUAL §2). O badge
 * "somente leitura" continua informativo: quem barra instalar é
 * `core.install_module()`, não a tela.
 */
function FiltroBadges({
  filtro,
  onToggle,
  resumo,
  limite,
  canInstall,
}: {
  filtro: FiltroGrupo | null;
  onToggle: (grupo: FiltroGrupo) => void;
  resumo: { readonly installed: number; readonly available: number };
  limite: number | null;
  canInstall: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleBadge
        ativo={filtro === 'em-uso'}
        onClick={() => onToggle('em-uso')}
        rotulo={`Filtrar por ${resumo.installed} instalado${resumo.installed === 1 ? '' : 's'}`}
      >
        {resumo.installed} instalado{resumo.installed === 1 ? '' : 's'}
        {/* O teto é INFORMAÇÃO aqui. Quem barra é core.install_module(). */}
        {limite !== null ? ` de ${limite}` : ''}
      </ToggleBadge>
      <ToggleBadge
        ativo={filtro === 'disponivel'}
        onClick={() => onToggle('disponivel')}
        rotulo={`Filtrar por ${resumo.available} disponíve${resumo.available === 1 ? 'l' : 'is'}`}
      >
        {resumo.available} disponíve{resumo.available === 1 ? 'l' : 'is'}
      </ToggleBadge>
      {filtro !== null ? (
        <span className="text-[11px] text-bos-muted">
          filtrando — clique de novo no badge para ver tudo
        </span>
      ) : null}
      {canInstall ? null : (
        <span className="inline-flex items-center gap-1 rounded-full border border-bos-border bg-bos-elevated px-2.5 py-0.5 text-xs whitespace-nowrap text-bos-muted">
          somente leitura
        </span>
      )}
    </div>
  );
}

/** Um badge que é botão: neutro quando inativo, realçado no accent quando ativo. */
function ToggleBadge({
  ativo,
  onClick,
  rotulo,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={rotulo}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap transition-colors ${
        ativo
          ? 'border-bos-accent bg-bos-accent/20 text-bos-text'
          : 'border-bos-border bg-bos-elevated text-bos-muted hover:border-bos-accent/50 hover:text-bos-text'
      }`}
    >
      {children}
    </button>
  );
}

function GalleryView({
  gallery,
  eyebrow,
  title,
  blurb,
  roles,
  canInstall,
  filtro,
}: {
  gallery: Gallery;
  eyebrow: string;
  title: string;
  blurb: string;
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
  filtro: FiltroGrupo | null;
}) {
  const rotuloCamada = gallery.layer === 'domain' ? 'Domínio' : 'Vertical';

  // O filtro é de EXIBIÇÃO, por cima do que buildShelf()/mapShelfToTaxonomy já
  // decidiram: cada seção mostra só os cards do grupo escolhido, e uma seção que
  // fica sem card some. Território "Em breve" (sem módulo) não participa do
  // filtro — some enquanto ele estiver ativo (Lei 7: é mapa, não card).
  const secoesVisiveis = gallery.live
    .map((secao) => ({
      ...secao,
      items: filtro
        ? secao.items.filter((i) => grupoDoEstado(i.state) === filtro)
        : secao.items,
    }))
    .filter((secao) => secao.items.length > 0);

  // Com filtro ativo, uma galeria inteira sem card não vira cabeçalho órfão.
  if (filtro !== null && secoesVisiveis.length === 0) return null;

  return (
    <section>
      <div className="mb-6">
        <p className="bos-eyebrow mb-2">{eyebrow}</p>
        <h2 className="font-display text-[1.4rem] leading-tight tracking-tight text-bos-text">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-bos-muted">{blurb}</p>
      </div>

      {secoesVisiveis.length > 0 ? (
        <div className="flex flex-col gap-8">
          {secoesVisiveis.map((secao) => (
            <LiveSection
              key={secao.territory.key}
              section={secao}
              rotuloCamada={rotuloCamada}
              roles={roles}
              canInstall={canInstall}
            />
          ))}
        </div>
      ) : null}

      {filtro === null && gallery.upcoming.length > 0 ? (
        <UpcomingBlock territories={gallery.upcoming} rotuloCamada={rotuloCamada} />
      ) : null}
    </section>
  );
}

/** Um território VIVO: cabeçalho + grid de cards fechados que expandem. */
function LiveSection({
  section,
  rotuloCamada,
  roles,
  canInstall,
}: {
  section: TerritorySection;
  rotuloCamada: string;
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
}) {
  const n = section.items.length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-bos-border pb-2">
        <div>
          <p className="bos-eyebrow mb-1">{rotuloCamada}</p>
          <h3 className="font-display text-lg text-bos-text">{section.territory.name}</h3>
        </div>
        <span className="text-xs text-bos-muted">
          {n} módulo{n === 1 ? '' : 's'}
          {section.territory.capabilities > 0
            ? ` · de ${section.territory.capabilities} capacidades no mapa`
            : ''}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item) => (
          <ModuleCard key={item.entry.moduleId} item={item} roles={roles} canInstall={canInstall} />
        ))}
      </div>
    </div>
  );
}

/**
 * O card do módulo — fechado por padrão, expande em accordion independente.
 *
 * ⭐ Vários podem estar abertos ao mesmo tempo: o estado é local a cada card.
 * ⚠️ O detalhe (capacidades/permissões/fatos) e as ações vivem FORA do botão
 * de expandir — abrir um card nunca dispara instalar/desinstalar.
 */
function ModuleCard({
  item,
  roles,
  canInstall,
}: {
  item: ShelfItem;
  roles: readonly { key: string; name: string }[];
  canInstall: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { entry, state } = item;
  const emUso = state === 'installed' || state === 'installing' || state === 'suspended';
  const painelId = `mod-${entry.moduleId}`;

  return (
    <Panel className="flex flex-col">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={painelId}
        className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-bos-elevated/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="min-w-0 font-display text-base leading-snug text-bos-text">{entry.name}</h4>
          <Badge tone={TOM[state]}>{ROTULO[state]}</Badge>
        </div>
        <p className="line-clamp-1 text-xs text-bos-muted">{entry.summary}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-bos-muted">
            {entry.moduleId} · v{entry.version}
          </span>
          <span className="text-[10px] text-bos-muted">{aberto ? 'fechar ▲' : 'detalhes ▼'}</span>
        </div>
      </button>

      {aberto ? (
        <div id={painelId} className="border-t border-bos-border px-5 py-5">
          <p className="mb-4 font-mono text-[11px] text-bos-muted">
            {entry.layer === 'domain' ? 'Domain' : 'Vertical'}{' '}
            {entry.domainKey ?? entry.verticalKey}
            {item.installedVersion ? ` · você tem a v${item.installedVersion}` : ''}
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
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
                      Só reage se{' '}
                      <strong className="text-bos-text">{item.listensTo.join(', ')}</strong> também
                      estiver instalado e emitindo. Sem isso, o módulo funciona — apenas não é
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
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * O bloco "Em breve" de uma galeria — os territórios do mapa que ainda não têm
 * módulo publicado. Tratamento LEVE: pills recuadas, sem CTA, sem preço, sem
 * capacidade individual. É mapa, não promessa.
 */
function UpcomingBlock({
  territories,
  rotuloCamada,
}: {
  territories: readonly Territory[];
  rotuloCamada: string;
}) {
  return (
    <div className="mt-8">
      <p className="bos-eyebrow mb-3 text-bos-muted">
        Em breve · {territories.length} {rotuloCamada === 'Domínio' ? 'domínios' : 'verticais'} no
        mapa
      </p>
      <div className="flex flex-wrap gap-2">
        {territories.map((t) => (
          <span
            key={t.key}
            className="inline-flex items-center gap-2 rounded-full border border-bos-border/60 bg-bos-elevated/30 px-3 py-1.5 text-xs text-bos-muted"
          >
            <span className="text-bos-text/80">{t.name}</span>
            <span className="text-[10px] text-bos-muted">· {t.capabilities} capacidades mapeadas</span>
            <span className="rounded-full border border-bos-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-bos-muted">
              Em breve
            </span>
          </span>
        ))}
      </div>
    </div>
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
