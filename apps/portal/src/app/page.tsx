import type { ReactNode } from 'react';
import Link from 'next/link';

import { usageBand } from '@alsham/billing';
import type { UsageBand } from '@alsham/billing';
import { visibleMenu } from '@alsham/permissions';
import type { ShelfItem } from '@alsham/permissions';

import { getPanelPort, loadAllPermissions } from '@/lib/data';
import type {
  AuditRow,
  CourierSummary,
  ModuleHealth,
  OverviewCard,
  PlanUsageRow,
  TenantInsight,
} from '@/lib/data/panel-port';
import { resolveSession } from '@/lib/session';
import { Badge, DemoNotice, EmptyState, Panel, SectionHeader } from '@/components/states';
import { EventTimeline } from '@/components/event-timeline';
import { DomainSectionHeader } from '@/components/domain-section';
import { Table, TBody, TR, TD } from '@/components/table';
import { mapShelfToTaxonomy, type TerritorySection } from '@/lib/store-taxonomy';

export const dynamic = 'force-dynamic';

/**
 * ⭐ **O PAINEL EXECUTIVO — a home do tenant logado (Etapa 15).**
 *
 * É a primeira tela que alguém vê, e por isso é a mais fácil de encher de
 * número bonito. Ela faz o contrário: **cada número aqui sai de um `count()`
 * do banco ou de uma linha de `core.plan_limits`.** Não há um só valor
 * decorativo, ilustrativo ou "de exemplo" — Lei 7 vale mais na vitrine do que
 * no porão.
 *
 * ⚠️ **É Core, não módulo.** Não tem manifesto, não entra no catálogo da Store,
 * não se desinstala. É a plataforma; os módulos é que vêm e vão.
 *
 * ⛔ **A saúde do correio NÃO vem de `core.courier_status()`.** Aquela função
 * conta a fila inteira da plataforma — o tenant saberia, pelo número, quando o
 * vizinho está importando um extrato grande. O que se lê aqui é
 * `core.tenant_courier_summary()`: o veredito em texto e os números **deste**
 * tenant. Ver `0021_tenant_panel.sql`.
 *
 * ⚠️ **E a tela nunca inventa "OK".** Se a leitura falhar, a seção diz que não
 * conseguiu ler. Um veredito falso é pior do que veredito nenhum: ele faz o
 * operador parar de olhar.
 */
export default async function Painel() {
  const session = await resolveSession();

  // Autenticado, mas sem nenhum vínculo. Não é erro do usuário nem falha do
  // sistema — é convite que não chegou. A tela diz isso em vez de mostrar um
  // painel vazio que parece quebrado.
  if (session.mode === 'no-access') {
    return (
      <>
        <SectionHeader title="Sem acesso a nenhuma empresa" />
        <EmptyState
          title="Sua conta existe, mas ainda não está vinculada a nenhuma empresa"
          hint="Peça a quem administra a empresa para convidar este e-mail. Assim que o vínculo existir, o painel aparece aqui."
        />
      </>
    );
  }

  const port = await getPanelPort();

  // ⚠️ `Promise.allSettled`, não `all`: uma seção que não carrega não pode
  // apagar as outras. O Painel é a home — ele degrada por partes.
  const [correio, consumo, trilha, prateleira, visao, saudeMod, permissoes, avisosR] =
    await Promise.allSettled([
      port.loadCourier(),
      port.loadPlanUsage(),
      port.loadRecentAudit(),
      port.loadShelf(),
      port.loadOverview(),
      port.loadModuleHealth(),
      loadAllPermissions(),
      port.loadInsights(),
    ]);

  const saude = correio.status === 'fulfilled' ? correio.value : null;
  const metricas = consumo.status === 'fulfilled' ? consumo.value : null;
  const linhas = trilha.status === 'fulfilled' ? trilha.value : [];
  const modulos = prateleira.status === 'fulfilled' ? prateleira.value : null;
  // ⭐ A Visão Geral degrada por partes como todo o resto: se a leitura inteira
  // falhar, a seção some (nunca inventa cartão). Cada cartão de dentro já vem
  // isolado do adapter — um que falhou vem com value=null e diz "sem leitura".
  const cartoes = visao.status === 'fulfilled' ? visao.value : [];
  // ⭐ A saúde por módulo — um mapa moduleId → veredito. Se a leitura falhar,
  // o mapa fica vazio e os módulos aparecem sem o ponto (nunca "ativo" forjado).
  const saudePorModulo = new Map(
    (saudeMod.status === 'fulfilled' ? saudeMod.value : []).map((s) => [s.moduleId, s]),
  );
  const permissoesDoUsuario =
    permissoes.status === 'fulfilled' ? permissoes.value : new Set<string>();
  // ⭐ Os avisos proativos — o que a inteligência ALSHAM notou sozinha. `null` =
  // a leitura falhou (a seção diz "sem leitura", nunca inventa "tudo em dia").
  const avisos = avisosR.status === 'fulfilled' ? avisosR.value : null;

  const instalados = (modulos ?? []).filter((m) => m.state === 'installed');
  const disponiveis = (modulos ?? []).filter((m) => m.state !== 'installed');

  // Os atalhos são os MESMOS itens do menu — uma fonte só. Um painel com lista
  // própria de links seria a segunda lista a manter em dia, e a que envelhece.
  const atalhos = visibleMenu(permissoesDoUsuario).filter((i) => i.href !== '/');

  return (
    <>
      {session.mode === 'demo' ? <DemoNotice /> : null}

      <PainelHero
        titulo={session.mode === 'authenticated' ? `${session.activeTenant.name}.` : 'Painel.'}
      />

      <VisaoGeral cartoes={cartoes} />

      <AvisosProativos avisos={avisos} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SaudeDoCorreio saude={saude} />
        </div>
        <ConsumoDoPlano metricas={metricas} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ModulosDoTenant
            instalados={instalados}
            disponiveis={disponiveis}
            falhou={modulos === null}
            saude={saudePorModulo}
          />
        </div>
        <Atalhos itens={atalhos} />
      </div>

      <div className="mt-4">
        <UltimasLinhas linhas={linhas} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * O HERO COM IMAGEM — a "Planta antes da Obra"
 * ──────────────────────────────────────────────────────────────────────
 * ⭐ A primeira alma visual do portal: uma arte ARQUITETÔNICA (obsidian + um
 * só ouro, o Sol Único como horizonte) em `public/hero-painel.svg` — asset
 * ESTÁTICO, gerado uma vez, sem custo nem latência de runtime. Nada de foto de
 * banco, nada de gradiente genérico (Anti-Brand §6). O texto vive sobre um
 * scrim de `--bos-bg`, então respira em qualquer largura.
 */
function PainelHero({ titulo }: { titulo: string }) {
  return (
    <header className="bos-sheen relative mb-10 overflow-hidden rounded-lg border border-bos-border">
      {/* A arte, como fundo decorativo (aria-hidden): a informação é o texto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/hero-painel.svg)' }}
      />
      {/* Scrim extra à esquerda — só tokens, nenhum HEX. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, var(--bos-bg) 6%, color-mix(in srgb, var(--bos-bg) 35%, transparent) 52%, transparent)',
        }}
      />
      <div className="relative px-6 py-14 sm:py-16">
        <p className="bos-eyebrow mb-3">O painel executivo</p>
        <h1 className="bos-hero-title">
          {titulo}
          <em className="block text-[0.72em]">Tudo aqui é contado no banco.</em>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-bos-muted">
          Nenhum número nesta tela é ilustrativo — cada um sai de uma contagem real ou de uma
          linha do plano.
        </p>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ⭐ A VISÃO GERAL — os números do negócio, um por módulo instalado
 * ──────────────────────────────────────────────────────────────────────
 * Lei 7 no desenho: cada cartão sai de uma leitura REAL do módulo-fonte, sob
 * RLS. Módulo não instalado ⇒ o cartão nem aparece (nunca um zero fabricado).
 * Módulo instalado com leitura falha ⇒ "sem leitura", jamais "0".
 *
 * ⚠️ Fronteira Lego (Opção A, aprovada): esta é leitura da PELE sobre views
 * públicas de módulos — como um BI. Nenhuma escrita, nenhuma transação entre
 * módulos, nenhuma FK. A Regra de Ouro segue intacta.
 *
 * Ícones: SVG de TRAÇO inline (geometria Lucide, MIT), no mesmo idioma do
 * portal — zero emoji, zero raster, zero dependência nova.
 */
const CARD_ICON: Record<string, ReactNode> = {
  'caixa-disponivel': (
    <>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H18a1 1 0 0 1 1 1v2" />
      <path d="M3 6.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M20 10h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z" />
    </>
  ),
  'receita-mes': (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 4h6v6" />
    </>
  ),
  'contas-vencendo': (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13.5v3l2 1.5" />
    </>
  ),
  'estoque-critico': (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  'clientes-ativos': (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a6.5 6.5 0 0 0-3-5.5" />
    </>
  ),
};

const CARD_TOM = {
  neutral: 'text-bos-text',
  warning: 'text-bos-warning',
  danger: 'text-bos-danger',
} as const;

function VisaoGeral({ cartoes }: { cartoes: readonly OverviewCard[] }) {
  // Nenhum módulo-fonte instalado ⇒ a seção inteira não aparece. Honesto: não
  // há visão geral a dar antes do primeiro módulo de dado entrar.
  if (cartoes.length === 0) return null;

  return (
    <section className="mb-4">
      <h2 className="bos-eyebrow mb-3">Visão geral</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cartoes.map((c, i) => (
          <CartaoVisao key={c.key} c={c} indice={i} />
        ))}
      </div>
    </section>
  );
}

function formatarValor(c: OverviewCard): string {
  if (c.value === null) return '—';
  if (c.kind === 'currency') {
    return (c.value / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: c.currency ?? 'BRL',
      maximumFractionDigits: 0,
    });
  }
  return c.value.toLocaleString('pt-BR');
}

function CartaoVisao({ c, indice = 0 }: { c: OverviewCard; indice?: number }) {
  const tom = CARD_TOM[c.tone ?? 'neutral'];
  const corpo = (
    <Panel
      className="bos-sheen bos-lift bos-enter h-full px-4 py-4 transition-colors duration-200 hover:border-bos-accent/50"
      // ⭐ Cascata sutil na entrada — cada cartão surge um instante depois do
      //    anterior. Sob prefers-reduced-motion o bos-enter nem anima (globals).
      style={{ animationDelay: `${indice * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-bos-muted">{c.label}</p>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-bos-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {CARD_ICON[c.key] ?? null}
        </svg>
      </div>

      {c.value === null ? (
        <>
          <p className="tabular mt-2 font-display text-2xl text-bos-muted">—</p>
          <p className="mt-1 text-[11px] text-bos-muted">
            sem leitura agora — o dado existe, esta tela não conseguiu lê-lo
          </p>
        </>
      ) : c.value === 0 && c.zeroText ? (
        /* ⭐ Estado-zero contextual (Mandato de Beleza 4/6): o zero de
           ausência-de-dado vira texto — mesma verdade, sem parecer quebrado. */
        <>
          <p className="mt-2 font-display text-lg leading-tight text-bos-muted">{c.zeroText}</p>
          {c.hint ? <p className="mt-1 text-[11px] text-bos-muted">{c.hint}</p> : null}
        </>
      ) : (
        <>
          <p className={`tabular mt-2 font-display text-2xl ${tom}`}>{formatarValor(c)}</p>
          {c.hint ? <p className="mt-1 text-[11px] text-bos-muted">{c.hint}</p> : null}
        </>
      )}
    </Panel>
  );

  return c.href ? (
    <Link href={c.href} className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-bos-accent/60 rounded-lg">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * A SAÚDE DO CORREIO
 * ────────────────────────────────────────────────────────────────────── */

const VEREDITO_TOM = {
  OK: 'success',
  ATRASADO: 'warning',
  PARADO: 'danger',
  ATENCAO: 'warning',
} as const;

const VEREDITO_ROTULO = {
  OK: 'entregando',
  ATRASADO: 'com atraso',
  PARADO: 'parado',
  ATENCAO: 'precisa de atenção',
} as const;

/* ─────────────────────────────────────────────────────────────────────────
 * ⭐ OS AVISOS PROATIVOS — o que a inteligência ALSHAM notou SOZINHA
 * ──────────────────────────────────────────────────────────────────────
 * A prova de cognição proativa do Memorando da Divisão de Águas: o observador
 * agendado leu um fato que já existe (contas a receber vencidas) e AVISOU sem
 * ser perguntado. A frase é determinística, sobre um número real — nunca
 * inventada. Ver `core.tenant_insights` (0116).
 */

/** "notado há X" — o carimbo que impede o aviso de mentir sobre o presente. */
function notadoHa(observedAtIso: string): string {
  const then = new Date(observedAtIso).getTime();
  if (Number.isNaN(then)) return '';
  const min = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function AvisosProativos({ avisos }: { avisos: TenantInsight[] | null }) {
  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">O que a inteligência ALSHAM notou</h2>
        {avisos === null ? <Badge tone="neutral">sem leitura</Badge> : null}
      </div>

      {avisos === null ? (
        /* ⛔ Nunca "tudo em dia" por omissão: leitura que falha diz que falhou. */
        <p className="mt-3 max-w-2xl text-sm text-bos-muted">
          Não foi possível ler os avisos agora. Isso não quer dizer que está tudo em dia — quer
          dizer que esta tela não conseguiu ler.
        </p>
      ) : avisos.length === 0 ? (
        <p className="mt-3 max-w-2xl text-sm text-bos-muted">
          Nada a sinalizar por enquanto. Quando a inteligência ALSHAM notar algo que peça sua
          atenção, o aviso aparece aqui — sem você precisar perguntar.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {avisos.map((a, i) => (
            <li
              key={`${a.kind}-${i}`}
              className="rounded-lg border border-bos-border bg-bos-surface px-4 py-3"
            >
              <p className="text-sm font-medium text-bos-text">{a.headline}</p>
              <p className="mt-1 text-sm text-bos-muted">{a.detail}</p>
              <p className="mt-2 text-xs text-bos-muted">notado {notadoHa(a.observedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SaudeDoCorreio({ saude }: { saude: CourierSummary | null }) {
  return (
    <Panel className="h-full px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">O correio</h2>
        {saude !== null ? (
          <Badge tone={VEREDITO_TOM[saude.veredito]}>{VEREDITO_ROTULO[saude.veredito]}</Badge>
        ) : (
          <Badge tone="neutral">sem leitura</Badge>
        )}
      </div>

      {saude === null ? (
        /* ⛔ Nunca "OK" por omissão. */
        <p className="mt-3 max-w-2xl text-sm text-bos-muted">
          Não foi possível ler a saúde do correio agora. Isso não quer dizer que ele parou — quer
          dizer que esta tela não sabe. Nada se perde de qualquer forma: os fatos ficam na caixa de
          saída até serem entregues.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-sm text-bos-muted">{saude.detalhe}</p>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <Numero rotulo="Na fila" valor={saude.meusPendentes} />
            <Numero rotulo="Espera" valor={saude.meuAtrasoMin} sufixo=" min" />
            <Numero rotulo="Esgotados" valor={saude.meusMortos} alerta={saude.meusMortos > 0} />
          </div>
          <p className="mt-4 text-xs text-bos-muted">
            {/* ⚠️ Dizer de quem são os números é parte da honestidade: o
                operador não confunde a fila dele com a da plataforma. */}
            Os números são <strong className="text-bos-text">da sua empresa</strong>. A fila das
            outras não é assunto seu — nem a sua, delas.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * O CONSUMO DO PLANO
 * ────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ Classe de Tailwind **escrita por extenso**, nunca montada por template.
 * `bg-bos-${cor}` não existe no CSS gerado — o compilador só enxerga o que
 * está literal no código. Já custou uma barra invisível uma vez.
 */
const BANDA_BARRA: Record<UsageBand, string> = {
  unlimited: 'bg-bos-border',
  ok: 'bg-bos-success',
  warning: 'bg-bos-warning',
  exceeded: 'bg-bos-danger',
};

function ConsumoDoPlano({ metricas }: { metricas: PlanUsageRow[] | null }) {
  return (
    <Panel className="h-full px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">O seu plano</h2>

      {metricas === null ? (
        <p className="mt-3 text-sm text-bos-muted">
          Não foi possível ler o consumo agora. Nenhum número aqui seria melhor do que um número
          errado.
        </p>
      ) : metricas.length === 0 ? (
        <p className="mt-3 text-sm text-bos-muted">
          O plano desta empresa ainda não tem teto declarado para nenhuma métrica. Enquanto não
          tiver, o que depende de medição fica indisponível — e a tela diz isso onde acontece, em
          vez de deixar o botão prometer.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {metricas.map((m) => {
            const banda = usageBand(m.used, m.limit);
            const proporcao =
              m.limit === null || m.limit <= 0 ? 0 : Math.min(100, (m.used / m.limit) * 100);
            return (
              <li key={m.metric}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-bos-muted">{m.metric}</span>
                  <span className="text-sm text-bos-text">
                    {m.used.toLocaleString('pt-BR')}
                    <span className="text-bos-muted">
                      {m.limit === null ? ' · sem teto' : ` / ${m.limit.toLocaleString('pt-BR')}`}
                    </span>
                  </span>
                </div>
                {/* ⚠️ A barra tem papel e rótulo: cor sozinha não é
                    informação para quem não a enxerga. */}
                <div
                  role="meter"
                  aria-valuenow={m.used}
                  aria-valuemin={0}
                  aria-valuemax={m.limit ?? undefined}
                  aria-label={`${m.metric}: ${m.used} de ${m.limit === null ? 'sem teto' : m.limit}`}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bos-elevated"
                >
                  <div
                    className={`h-full ${BANDA_BARRA[banda]}`}
                    style={{ width: `${proporcao}%` }}
                  />
                </div>
                {banda === 'warning' ? (
                  <p className="mt-1.5 text-xs text-bos-muted">
                    Passou de 80% do mês. Ainda dá tempo de pedir mais.
                  </p>
                ) : null}
                {banda === 'exceeded' ? (
                  <p className="mt-1.5 text-xs text-bos-muted">
                    {m.onExceed === 'block'
                      ? 'Teto atingido — o que depende desta métrica para de funcionar até o mês virar.'
                      : 'Teto atingido — o excedente continua contando e entra na apuração.'}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * OS MÓDULOS
 * ────────────────────────────────────────────────────────────────────── */

/** ⭐ Relativo curto em pt-BR — "hoje", "há 3 dias". Sem lib, sem enfeite. */
function haQuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

/** O ponto de saúde — verde (ativo) / âmbar (parado). Nunca o ouro (é estado). */
function PontoSaude({ verdict }: { verdict: ModuleHealth['verdict'] }) {
  const cor = verdict === 'active' ? 'bg-bos-success' : 'bg-bos-warning';
  const rotulo = verdict === 'active' ? 'ativo' : 'parado';
  return (
    <span className="inline-flex items-center gap-1.5" title={`Módulo ${rotulo}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${cor}`} />
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}

function ModulosDoTenant({
  instalados,
  disponiveis,
  falhou,
  saude,
}: {
  instalados: readonly ShelfItem[];
  disponiveis: readonly ShelfItem[];
  falhou: boolean;
  saude: ReadonlyMap<string, ModuleHealth>;
}) {
  const cabecalho = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-display text-lg text-bos-text">Os seus módulos</h2>
      <Link
        href="/store"
        className="text-xs text-bos-muted underline-offset-4 transition-colors hover:text-bos-text hover:underline"
      >
        ver o catálogo
      </Link>
    </div>
  );

  // ⭐ Primeira corrida do tenant: nenhum módulo ainda. Não é uma lista vazia —
  // é o convite. Estado vazio DESENHADO com um CTA de VERDADE (Onda UX Viva
  // 4/6): a Store existe, o passo é real, o botão leva a ele. Sem outra Panel
  // por fora (o próprio EmptyState é a moldura) — nada de borda dupla.
  if (!falhou && instalados.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3">
        {cabecalho}
        <EmptyState
          title="Nenhum módulo instalado ainda"
          hint="O Core já está de pé. A empresa não compra um sistema — monta o dela, Core mais módulos, como Lego. Falta escolher o primeiro."
          action={{ label: 'Escolher o primeiro módulo', href: '/store' }}
        />
      </div>
    );
  }

  // ⭐ Agrupamento por domínio — REAPROVEITA o `mapShelfToTaxonomy` da Store
  // (Mandato de Beleza 1/6). Uma fonte só de agrupamento (Sol Único): o mesmo
  // que a vitrine usa para os territórios, na MESMA ordem da Taxonomia. Os
  // instalados só carregam módulos vivos, então `upcoming` é ignorado aqui.
  const { domains, verticals } = mapShelfToTaxonomy(instalados);
  const secoes: TerritorySection[] = [...domains.live, ...verticals.live];

  return (
    <Panel className="h-full px-6 py-5">
      {cabecalho}
      <p className="mt-1 max-w-2xl text-sm text-bos-muted">
        A empresa não compra um sistema. Ela monta o dela — Core mais módulos, como Lego.
      </p>

      {falhou ? (
        <p className="mt-4 text-sm text-bos-muted">Não foi possível ler o catálogo agora.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          {secoes.map((secao) => (
            <div key={`${secao.territory.layer}:${secao.territory.key}`}>
              <DomainSectionHeader
                territoryKey={secao.territory.key}
                layerLabel={secao.territory.layer === 'domain' ? 'Domínio' : 'Vertical'}
                name={secao.territory.name}
                right={`${secao.items.length} módulo${secao.items.length === 1 ? '' : 's'}`}
              />
              <Table>
                <TBody>
                  {secao.items.map((m) => (
                    <LinhaModulo key={m.entry.moduleId} m={m} saude={saude} />
                  ))}
                </TBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      {disponiveis.length > 0 ? (
        <p className="mt-6 text-xs text-bos-muted">
          Disponíveis para instalar: {disponiveis.map((m) => m.entry.name).join(' · ')}.
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * Uma linha de módulo — agora TABELA DE VERDADE (Mandato de Beleza 3/6):
 * colunas alinhadas linha a linha, a última atividade à direita com tabular
 * figures. Ponto de saúde + nome | identificação | atividade.
 */
function LinhaModulo({
  m,
  saude,
}: {
  m: ShelfItem;
  saude: ReadonlyMap<string, ModuleHealth>;
}) {
  const h = saude.get(m.entry.moduleId);
  const versaoDivergente =
    m.installedVersion !== null && m.installedVersion !== m.entry.version;
  return (
    <TR className="transition-colors hover:bg-bos-elevated/30">
      <TD>
        <span className="flex items-center gap-2.5">
          {/* espaço fixo para o ponto — o nome alinha mesmo sem leitura de saúde */}
          <span className="flex w-2 shrink-0 justify-center">
            {h !== undefined ? <PontoSaude verdict={h.verdict} /> : null}
          </span>
          <span className="text-bos-text">{m.entry.name}</span>
        </span>
      </TD>
      <TD className="whitespace-nowrap">
        {/* ⚠️ A versão exibida é a QUE ESTE TENANT TEM, quando diferente da
            publicada. Mostrar sempre a do catálogo faria a tela mentir. */}
        <span className="font-mono text-[11px] text-bos-muted">
          {m.entry.moduleId} v{m.installedVersion ?? m.entry.version}
        </span>
        {versaoDivergente ? (
          <span className="ml-2 align-middle">
            <Badge tone="info">catálogo v{m.entry.version}</Badge>
          </span>
        ) : null}
      </TD>
      {/* ⭐ Última atividade REAL da trilha (à direita, tabular) — ou o silêncio honesto. */}
      <TD num className="whitespace-nowrap text-[11px] text-bos-muted">
        {h?.lastActivityAt != null ? `ativo ${haQuanto(h.lastActivityAt)}` : 'sem atividade recente'}
      </TD>
    </TR>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * OS ATALHOS
 * ────────────────────────────────────────────────────────────────────── */

function Atalhos({ itens }: { itens: readonly { href: string; label: string }[] }) {
  return (
    <Panel className="h-full px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Ir para</h2>
      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-bos-muted">
          Nenhuma tela liberada para o seu perfil ainda. Quem administra a empresa concede as
          permissões ao instalar cada módulo.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {itens.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60"
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * A TRILHA
 * ────────────────────────────────────────────────────────────────────── */

function UltimasLinhas({ linhas }: { linhas: readonly AuditRow[] }) {
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">O que aconteceu</h2>
      <p className="mt-1 max-w-2xl text-sm text-bos-muted">
        As últimas linhas da trilha desta empresa. Nada aqui se edita nem se apaga — corrigir é
        registrar outra linha.
      </p>

      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-bos-muted">
          Sem linhas para mostrar. Ou nada aconteceu ainda, ou o seu perfil não tem{' '}
          <code className="font-mono text-xs">core.audit.read</code> — a trilha existe de qualquer
          forma.
        </p>
      ) : (
        <EventTimeline linhas={linhas} />
      )}
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function Numero({
  rotulo,
  valor,
  sufixo = '',
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  sufixo?: string;
  alerta?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-bos-muted">{rotulo}</p>
      <p
        className={`tabular mt-0.5 font-display text-2xl ${alerta ? 'text-bos-danger' : 'text-bos-text'}`}
      >
        {valor.toLocaleString('pt-BR')}
        <span className="text-base text-bos-muted">{sufixo}</span>
      </p>
    </div>
  );
}
