import type { SupabaseClient } from '@supabase/supabase-js';

import { buildShelf } from '@alsham/permissions';
import type { CatalogEntry, ShelfItem, TenantModuleRow } from '@alsham/permissions';

import { DataPortError } from './port';
import type {
  AuditRow,
  CourierSummary,
  ModuleHealth,
  OverviewCard,
  PanelPort,
  PlanUsageRow,
} from './panel-port';

/** ⭐ Janela do veredito de saúde: atividade nos últimos 7 dias ⇒ ativo. */
const HEALTH_ACTIVE_DAYS = 7;

/**
 * O adapter REAL do Painel — tudo sob RLS, como o usuário.
 *
 * ⛔ **Nenhuma leitura global.** A saúde do correio vem de
 * `core.tenant_courier_summary()`, que devolve o veredito e **só os números
 * deste tenant** — a `core.courier_status()` continua fechada. Ver
 * `0021_tenant_panel.sql`.
 *
 * ⚠️ Zero regra de negócio: quem cruza catálogo com instalado é `buildShelf()`,
 * no pacote.
 */
export function createPanelSupabasePort(
  db: SupabaseClient,
  tenantId: string,
  planCode: string,
): PanelPort {
  return {
    kind: 'supabase',
    planCode,

    async loadCourier(): Promise<CourierSummary | null> {
      const { data, error } = await db
        .schema('core')
        .rpc('tenant_courier_summary', { p_tenant_id: tenantId });
      // ⚠️ Painel não derrama erro: sem resposta, a seção diz que não conseguiu
      // ler — nunca inventa "OK". Um veredito falso é pior do que nenhum.
      if (error) return null;
      const linha = (data as unknown[] | null)?.[0] as
        | {
            veredito: CourierSummary['veredito'];
            detalhe: string;
            meus_pendentes: number;
            meus_mortos: number;
            meu_atraso_min: number;
          }
        | undefined;
      if (linha === undefined) return null;
      return {
        veredito: linha.veredito,
        detalhe: linha.detalhe,
        meusPendentes: Number(linha.meus_pendentes),
        meusMortos: Number(linha.meus_mortos),
        meuAtrasoMin: Number(linha.meu_atraso_min),
      };
    },

    async loadPlanUsage(): Promise<PlanUsageRow[]> {
      const { data, error } = await db
        .schema('core')
        .rpc('tenant_plan_usage', { p_tenant_id: tenantId });
      if (error) throw new DataPortError('Não foi possível ler o consumo do plano.', { cause: error });
      return ((data ?? []) as {
        metric: string;
        limit_value: number | null;
        used: number;
        on_exceed: string;
      }[]).map((r) => ({
        metric: r.metric,
        limit: r.limit_value === null ? null : Number(r.limit_value),
        used: Number(r.used),
        onExceed: r.on_exceed === 'meter' ? 'meter' : 'block',
      }));
    },

    async loadRecentAudit(): Promise<AuditRow[]> {
      const { data, error } = await db
        .schema('core')
        .from('audit_log')
        .select('id, action, resource_type, module_id, occurred_at, actor_kind')
        .order('occurred_at', { ascending: false })
        .limit(12);
      // A trilha exige `core.audit.read`. Sem ela, lista vazia — e a tela diz
      // por quê, em vez de mostrar erro.
      if (error) return [];
      return ((data ?? []) as {
        id: string;
        action: string;
        resource_type: string;
        module_id: string | null;
        occurred_at: string;
        actor_kind: AuditRow['actorKind'];
      }[]).map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resource_type,
        moduleId: r.module_id,
        occurredAt: r.occurred_at,
        actorKind: r.actor_kind,
      }));
    },

    async loadShelf(): Promise<ShelfItem[]> {
      const [{ data: cat, error: e1 }, { data: inst, error: e2 }] = await Promise.all([
        db.schema('core').from('module_registry').select('*'),
        db.schema('core').from('tenant_modules').select('module_id, status, version, installed_at'),
      ]);
      if (e1) throw new DataPortError('Não foi possível ler o catálogo.', { cause: e1 });
      if (e2) throw new DataPortError('Não foi possível ler os módulos instalados.', { cause: e2 });

      const catalogo: CatalogEntry[] = ((cat ?? []) as Record<string, unknown>[]).map((r) => ({
        moduleId: r.module_id as string,
        name: r.name as string,
        version: r.version as string,
        summary: r.summary as string,
        layer: r.layer as 'domain' | 'vertical',
        domainKey: (r.domain_key as string | null) ?? null,
        verticalKey: (r.vertical_key as string | null) ?? null,
        capabilities: (r.capabilities as CatalogEntry['capabilities']) ?? [],
        permissions: (r.permissions as CatalogEntry['permissions']) ?? [],
        emits: (r.events_emits as CatalogEntry['emits']) ?? [],
        consumes: (r.events_consumes as CatalogEntry['consumes']) ?? [],
      }));

      const instalados: TenantModuleRow[] = ((inst ?? []) as Record<string, unknown>[]).map((r) => ({
        moduleId: r.module_id as string,
        status: r.status as TenantModuleRow['status'],
        version: r.version as string,
        installedAt: r.installed_at as string,
      }));

      return [...buildShelf(catalogo, instalados)];
    },

    // ⭐ A VISÃO GERAL — cada cartão de um módulo INSTALADO, cada leitura
    // ISOLADA. ⚠️ Fronteira Lego (Opção A, aprovada): a `apps/portal` LÊ views
    // públicas de módulos sob RLS — leitura read-only da PELE, como um BI. Não
    // é módulo lendo módulo em `packages/`, não cria FK, não escreve, não abre
    // transação entre módulos. A Regra de Ouro (que protege contra acoplamento
    // de ESCRITA/transação) continua intacta.
    async loadOverview(): Promise<OverviewCard[]> {
      // 1) Quais módulos este tenant instalou. Sem isso, nenhum cartão nasce.
      const { data: inst, error } = await db
        .schema('core')
        .from('tenant_modules')
        .select('module_id, status');
      if (error) return [];
      const instalados = new Set(
        ((inst ?? []) as { module_id: string; status: string }[])
          .filter((r) => r.status === 'active')
          .map((r) => r.module_id),
      );

      // Janela de "vencendo": hoje + 7 dias, e o começo do mês corrente. Datas
      // do servidor da app; a RLS do banco é quem decide as linhas.
      const hoje = new Date();
      const emSete = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const inicioDoMes = `${hoje.toISOString().slice(0, 7)}-01`;

      // Cada leitura é uma função ISOLADA: devolve o valor real, `null` se a
      // view mudou/falhou (o cartão degrada sozinho), e escolhe a moeda
      // dominante quando há mais de uma.
      const leituras: Record<
        string,
        () => Promise<{ value: number | null; currency?: string }>
      > = {
        // Caixa disponível — saldo do livro (cash.balances), moeda dominante.
        'caixa-disponivel': async () => {
          const { data, error } = await db
            .schema('cash')
            .from('balances')
            .select('currency, balance_cents, entry_count');
          if (error) return { value: null };
          const linhas = (data ?? []) as {
            currency: string;
            balance_cents: number;
            entry_count: number;
          }[];
          if (linhas.length === 0) return { value: 0, currency: 'BRL' };
          const dominante = linhas.reduce((a, b) => (b.entry_count > a.entry_count ? b : a));
          return { value: Number(dominante.balance_cents), currency: dominante.currency };
        },

        // Receita do mês — entradas do mês corrente (cash.monthly), moeda dominante.
        'receita-mes': async () => {
          const { data, error } = await db
            .schema('cash')
            .from('monthly')
            .select('month, currency, inflow_cents')
            .eq('month', inicioDoMes);
          if (error) return { value: null };
          const linhas = (data ?? []) as {
            currency: string;
            inflow_cents: number;
          }[];
          if (linhas.length === 0) return { value: 0, currency: 'BRL' };
          const dominante = linhas.reduce((a, b) => (b.inflow_cents > a.inflow_cents ? b : a));
          return { value: Number(dominante.inflow_cents), currency: dominante.currency };
        },

        // Contas vencendo — a receber, em aberto, vencendo em até 7 dias (ou vencidas).
        'contas-vencendo': async () => {
          const { count, error } = await db
            .schema('ar')
            .from('receivables')
            .select('id', { count: 'exact', head: true })
            .in('status', ['open', 'partially_received'])
            .lte('due_date', emSete);
          if (error) return { value: null };
          return { value: count ?? 0 };
        },

        // Estoque crítico — itens com saldo <= 0 no livro (inv.balances).
        'estoque-critico': async () => {
          const { count, error } = await db
            .schema('inv')
            .from('balances')
            .select('item_id', { count: 'exact', head: true })
            .lte('balance', 0);
          if (error) return { value: null };
          return { value: count ?? 0 };
        },

        // Clientes ativos — contrapartes ativas (crm.parties).
        'clientes-ativos': async () => {
          const { count, error } = await db
            .schema('crm')
            .from('parties')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active');
          if (error) return { value: null };
          return { value: count ?? 0 };
        },
      };

      // O catálogo de cartões: rótulo, módulo-fonte, formato, link e realce.
      const specs: Omit<OverviewCard, 'value' | 'currency'>[] = [
        { key: 'caixa-disponivel', label: 'Caixa disponível', moduleId: 'cash', kind: 'currency', href: '/caixa', hint: 'Saldo do livro-caixa.' },
        { key: 'receita-mes', label: 'Receita do mês', moduleId: 'cash', kind: 'currency', href: '/caixa', hint: 'Entradas do mês corrente.' },
        { key: 'contas-vencendo', label: 'Contas vencendo', moduleId: 'ar', kind: 'count', href: '/contas-a-receber', hint: 'A receber, em aberto, até 7 dias.', tone: 'warning' },
        { key: 'estoque-critico', label: 'Estoque crítico', moduleId: 'inv', kind: 'count', href: '/estoque', hint: 'Itens com saldo zerado ou negativo.', tone: 'danger' },
        { key: 'clientes-ativos', label: 'Clientes ativos', moduleId: 'crm', kind: 'count', href: '/relacionamentos', hint: 'Contrapartes ativas.' },
      ];

      // Só os cartões cujo módulo está instalado. Cada leitura em paralelo e
      // isolada (allSettled): uma que estoure não contamina as outras.
      const alvos = specs.filter((s) => instalados.has(s.moduleId));
      const resultados = await Promise.allSettled(alvos.map((s) => leituras[s.key]!()));

      return alvos.map((s, i): OverviewCard => {
        const r = resultados[i];
        const lido: { value: number | null; currency?: string } =
          r !== undefined && r.status === 'fulfilled' ? r.value : { value: null };
        // Realce só quando há motivo real: contagem de alerta > 0.
        const tone =
          s.tone !== undefined && s.kind === 'count' && typeof lido.value === 'number' && lido.value > 0
            ? s.tone
            : 'neutral';
        return { ...s, tone, value: lido.value, currency: lido.currency };
      });
    },

    // ⭐ A saúde de cada módulo instalado — UMA leitura da trilha, reduzida à
    // última atividade por módulo. Critério objetivo (Lei 7): atividade nos
    // últimos HEALTH_ACTIVE_DAYS ⇒ `active`; senão `idle`. Sem 🔴 forjado.
    async loadModuleHealth(): Promise<ModuleHealth[]> {
      const { data: inst, error: e1 } = await db
        .schema('core')
        .from('tenant_modules')
        .select('module_id, status');
      if (e1) return [];
      const instalados = ((inst ?? []) as { module_id: string; status: string }[])
        .filter((r) => r.status === 'active')
        .map((r) => r.module_id);
      if (instalados.length === 0) return [];

      // Uma janela recente da trilha; reduz à última atividade por módulo. Se a
      // leitura falhar, a saúde some (nunca inventa "ativo").
      const { data: trilha, error: e2 } = await db
        .schema('core')
        .from('audit_log')
        .select('module_id, occurred_at')
        .not('module_id', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (e2) return [];

      const ultimo = new Map<string, string>();
      for (const row of (trilha ?? []) as { module_id: string; occurred_at: string }[]) {
        // como vem ordenado desc, o primeiro visto por módulo é o mais recente.
        if (!ultimo.has(row.module_id)) ultimo.set(row.module_id, row.occurred_at);
      }

      const corte = Date.now() - HEALTH_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
      return instalados
        .map((moduleId): ModuleHealth => {
          const at = ultimo.get(moduleId) ?? null;
          const active = at !== null && new Date(at).getTime() >= corte;
          return { moduleId, lastActivityAt: at, verdict: active ? 'active' : 'idle' };
        })
        .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
    },
  };
}
