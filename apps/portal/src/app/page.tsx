import Link from 'next/link';

import { usageBand } from '@alsham/billing';
import type { UsageBand } from '@alsham/billing';
import { visibleMenu } from '@alsham/permissions';
import type { ShelfItem } from '@alsham/permissions';

import { getPanelPort, loadAllPermissions } from '@/lib/data';
import type { AuditRow, CourierSummary, PlanUsageRow } from '@/lib/data/panel-port';
import { resolveSession } from '@/lib/session';
import { Badge, DemoNotice, EmptyState, PageHero, Panel, SectionHeader } from '@/components/states';

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
  const [correio, consumo, trilha, prateleira, permissoes] = await Promise.allSettled([
    port.loadCourier(),
    port.loadPlanUsage(),
    port.loadRecentAudit(),
    port.loadShelf(),
    loadAllPermissions(),
  ]);

  const saude = correio.status === 'fulfilled' ? correio.value : null;
  const metricas = consumo.status === 'fulfilled' ? consumo.value : null;
  const linhas = trilha.status === 'fulfilled' ? trilha.value : [];
  const modulos = prateleira.status === 'fulfilled' ? prateleira.value : null;
  const permissoesDoUsuario =
    permissoes.status === 'fulfilled' ? permissoes.value : new Set<string>();

  const instalados = (modulos ?? []).filter((m) => m.state === 'installed');
  const disponiveis = (modulos ?? []).filter((m) => m.state !== 'installed');

  // Os atalhos são os MESMOS itens do menu — uma fonte só. Um painel com lista
  // própria de links seria a segunda lista a manter em dia, e a que envelhece.
  const atalhos = visibleMenu(permissoesDoUsuario).filter((i) => i.href !== '/');

  return (
    <>
      {session.mode === 'demo' ? <DemoNotice /> : null}

      <PageHero
        eyebrow="O painel executivo"
        title={session.mode === 'authenticated' ? `${session.activeTenant.name}.` : 'Painel.'}
        accent="Tudo aqui é contado no banco."
        subtitle="Nenhum número nesta tela é ilustrativo — cada um sai de uma contagem real ou de uma linha do plano."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SaudeDoCorreio saude={saude} />
        </div>
        <ConsumoDoPlano metricas={metricas} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ModulosDoTenant instalados={instalados} disponiveis={disponiveis} falhou={modulos === null} />
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

function ModulosDoTenant({
  instalados,
  disponiveis,
  falhou,
}: {
  instalados: readonly ShelfItem[];
  disponiveis: readonly ShelfItem[];
  falhou: boolean;
}) {
  return (
    <Panel className="h-full px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">Os seus módulos</h2>
        <Link
          href="/store"
          className="text-xs text-bos-muted underline-offset-4 transition-colors hover:text-bos-text hover:underline"
        >
          ver o catálogo
        </Link>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-bos-muted">
        A empresa não compra um sistema. Ela monta o dela — Core mais módulos, como Lego.
      </p>

      {falhou ? (
        <p className="mt-4 text-sm text-bos-muted">Não foi possível ler o catálogo agora.</p>
      ) : instalados.length === 0 ? (
        <p className="mt-4 text-sm text-bos-muted">
          Nenhum módulo instalado ainda. O Core já está de pé — falta escolher o primeiro na{' '}
          <Link href="/store" className="text-bos-text underline underline-offset-4">
            Store
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-bos-border border-t border-bos-border">
          {instalados.map((m) => (
            <li key={m.entry.moduleId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className="text-sm text-bos-text">{m.entry.name}</span>
              {/* ⚠️ A versão exibida é a QUE ESTE TENANT TEM, quando diferente
                  da publicada. Mostrar sempre a do catálogo faria a tela mentir
                  logo depois de uma publicação. */}
              <span className="font-mono text-[11px] text-bos-muted">
                {m.entry.moduleId} v{m.installedVersion ?? m.entry.version}
              </span>
              {m.installedVersion !== null && m.installedVersion !== m.entry.version ? (
                <Badge tone="info">catálogo v{m.entry.version}</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {disponiveis.length > 0 ? (
        <p className="mt-4 text-xs text-bos-muted">
          Disponíveis para instalar: {disponiveis.map((m) => m.entry.name).join(' · ')}.
        </p>
      ) : null}
    </Panel>
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
        <ul className="mt-4 divide-y divide-bos-border border-t border-bos-border">
          {linhas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
              <span className="font-mono text-xs text-bos-text">{l.action}</span>
              <span className="text-xs text-bos-muted">{l.resourceType}</span>
              {l.moduleId !== null ? (
                <span className="font-mono text-[11px] text-bos-muted">{l.moduleId}</span>
              ) : null}
              {l.actorKind !== 'user' ? <Badge tone="neutral">{l.actorKind}</Badge> : null}
              <time
                dateTime={l.occurredAt}
                className="ml-auto font-mono text-[11px] text-bos-muted"
              >
                {l.occurredAt.slice(0, 16).replace('T', ' ')}
              </time>
            </li>
          ))}
        </ul>
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
