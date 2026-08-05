-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0118_tenant_insight_history.sql
-- O LIVRO DE HISTÓRICO DO INSIGHT — o "arreio" que faltava para ANALISAR.
-- Objetos no schema `core`. Core, NÃO módulo: sem manifesto, fora da Store.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono. Próxima migration livre depois do 0117.
--
-- -----------------------------------------------------------------------------
-- ⭐ O PROBLEMA DE DESENHO QUE ESTE ARQUIVO RESOLVE
-- -----------------------------------------------------------------------------
-- `core.tenant_insights` (0116) é **recompute-e-substitui**: cada rodada apaga e
-- regrava o quadro atual. Isso é certo para "o hoje", mas **destrói a
-- possibilidade de comparar** — não sobra rastro da rodada anterior para dizer
-- "subiu", "é o mesmo de novo", "40% acima da média".
--
-- Sem um segundo lugar, o observador continua um AVISADOR (gatilho: SE vencidos
-- > 0 ENTÃO frase). Para virar ANALISTA — comparar leitura de hoje com a
-- história real — falta um LIVRO. Este é o livro.
--
-- ⚖️ **É o OPOSTO do `tenant_insights`:** append-only, IMUTÁVEL, nunca reescrito.
-- Cada rodada do observador grava UMA linha nova com o snapshot daquele momento.
-- É a memória-além-da-janela da pesquisa de agentes (design-report/
-- pesquisa-agentes-2026.md) — o mecanismo mais barato e direto para o nosso caso.
--
-- ⛔ **Escopo pequeno de propósito.** Este livro serve UMA análise: a TENDÊNCIA
-- agregada (hoje × média das leituras recentes). NÃO serve "devedor repetido" —
-- o `ar.receivables` não tem vínculo estruturado com o `crm` (sem `party_id`;
-- só `payer_name`/`counterparty_tax_id` opcionais em texto livre), então essa
-- análise fica DECLARADA FORA (Lei 7 — não inventar dado que a leitura não tem).
--
-- ⚖️ LEI 7 no desenho, como no 0116: quem ESCREVE é só o `service_role` (o
-- observador agendado); a média é CONTADA do livro, nunca estimada; a tabela é
-- FECHADA ao `authenticated` (o tenant vê a tendência já na frase do
-- `tenant_insights`, não lê o livro cru).
-- =============================================================================

-- =============================================================================
-- 1. O LIVRO — append-only, imutável em DUAS camadas
-- -----------------------------------------------------------------------------
-- ⚠️ Sem chave natural única: o MESMO (tenant, tipo, recorte) grava uma linha a
-- CADA rodada — é justamente o histórico que se quer. O que distingue as linhas
-- é o `observed_at`.
-- =============================================================================

create table core.tenant_insight_history (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,

  kind          text        not null check (kind <> ''),
  subject_key   text        not null default '',

  -- O NÚMERO daquela leitura — a contagem de vencidos, e o valor. É sobre isto
  -- que a tendência é calculada.
  metric_value  bigint      not null,
  amount_cents  bigint,
  currency      char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),

  observed_at   timestamptz not null default now()
);

comment on table core.tenant_insight_history is
  'O livro append-only de leituras do observador. Uma linha por (tenant, tipo, recorte) a cada rodada. IMUTÁVEL: é a memória que permite comparar hoje com a média recente. O oposto do tenant_insights (que é recompute-e-substitui).';

-- ⛔ RLS ligada e forçada: a tabela é fechada ao authenticated (defesa em
-- profundidade). A leitura do tenant é a TENDÊNCIA na frase do tenant_insights,
-- não o livro cru. Nenhuma policy, nenhum grant a authenticated.
alter table core.tenant_insight_history enable row level security;
alter table core.tenant_insight_history force row level security;

-- O índice que a leitura da média usa: as N mais recentes de um (tenant, tipo,
-- recorte), por data desc.
create index tenant_insight_history_recent_idx
  on core.tenant_insight_history (tenant_id, kind, subject_key, observed_at desc);

-- ⭐⭐ IMUTÁVEL EM DUAS CAMADAS (a física do crm/pcost/timesheet): nem o dono do
-- banco reescreve ou apaga uma leitura. Histórico que se edita não é histórico.
-- Corrigir é registrar outra leitura, nunca reescrever a antiga.
create or replace function core.tenant_insight_history_frozen()
returns trigger
language plpgsql
as $$
begin
  raise exception 'histórico de insight é fato consumado: não se edita nem se apaga';
end;
$$;

create trigger tenant_insight_history_no_update
  before update on core.tenant_insight_history
  for each row execute function core.tenant_insight_history_frozen();

create trigger tenant_insight_history_no_delete
  before delete on core.tenant_insight_history
  for each row execute function core.tenant_insight_history_frozen();

-- =============================================================================
-- 2. A ESCRITA — append, só o service_role
-- =============================================================================

create or replace function core.record_insight_history(
  p_tenant_id    uuid,
  p_kind         text,
  p_subject_key  text,
  p_metric_value bigint,
  p_amount_cents bigint,
  p_currency     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_kind), '') = '' then
    raise exception 'leitura sem tipo não se grava' using errcode = '23514';
  end if;

  insert into core.tenant_insight_history (
    tenant_id, kind, subject_key, metric_value, amount_cents, currency, observed_at
  )
  values (
    p_tenant_id, p_kind, coalesce(p_subject_key, ''), p_metric_value, p_amount_cents,
    case when p_currency is null then null else upper(p_currency)::char(3) end,
    now()
  );
end;
$$;

comment on function core.record_insight_history(uuid, text, text, bigint, bigint, text) is
  'Acrescenta uma leitura ao livro de histórico. Só o service_role (o observador agendado). Append-only.';

-- =============================================================================
-- 3. A LEITURA DA MÉDIA — CONTADA do livro, nunca estimada (Lei 7)
-- -----------------------------------------------------------------------------
-- Devolve quantas leituras entraram (`sample_count`) e a média da contagem
-- (`avg_metric`) sobre as `p_last_n` mais recentes de um (tenant, tipo, recorte).
-- Quem chama (o observador) já leu HOJE do `ar` e ainda NÃO gravou a leitura de
-- hoje no livro — então a média é das rodadas ANTERIORES, que é o que a
-- comparação "hoje × média recente" precisa.
--
-- ⛔ É do service_role: é encanamento do observador, não leitura do tenant. O
-- tenant recebe a tendência já pronta na frase do tenant_insights.
-- =============================================================================

create or replace function core.insight_history_baseline(
  p_tenant_id   uuid,
  p_kind        text,
  p_subject_key text,
  p_last_n      int
)
returns table (sample_count bigint, avg_metric numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint,
         coalesce(avg(metric_value), 0)::numeric
    from (
      select h.metric_value
        from core.tenant_insight_history h
       where h.tenant_id = p_tenant_id
         and h.kind = p_kind
         and h.subject_key = coalesce(p_subject_key, '')
       order by h.observed_at desc
       limit greatest(p_last_n, 0)
    ) recent;
$$;

comment on function core.insight_history_baseline(uuid, text, text, int) is
  'A média CONTADA da contagem nas últimas N leituras de um (tenant, tipo, recorte). Base da tendência. Só o service_role.';

-- =============================================================================
-- 4. FECHAMENTO — revogar ANTES de conceder (a lição do 0021/0022/0116)
-- -----------------------------------------------------------------------------
-- Estas funções nasceram depois do revoke de `core`, herdando EXECUTE de PUBLIC.
-- O revoke abaixo é o que faz o grant seguinte significar alguma coisa.
-- =============================================================================

-- ⛔ A FUNÇÃO DO TRIGGER também nasceu aberta a PUBLIC — e uma função de trigger
-- não precisa de EXECUTE concedido a ninguém (o gatilho a roda no contexto do
-- dono da tabela, sem checar privilégio do chamador). Deixá-la aberta faria a
-- guarda de CI "função executável por anon" reprovar (a lição do 0022, de novo).
revoke all on function core.tenant_insight_history_frozen()
  from public, anon, authenticated;

revoke all on function core.record_insight_history(uuid, text, text, bigint, bigint, text)
  from public, anon, authenticated;
revoke all on function core.insight_history_baseline(uuid, text, text, int)
  from public, anon, authenticated;

grant execute on function core.record_insight_history(uuid, text, text, bigint, bigint, text)
  to service_role;
grant execute on function core.insight_history_baseline(uuid, text, text, int)
  to service_role;

-- =============================================================================
-- FIM. Um livro append-only e imutável, duas portas de serviço (append + média).
-- O tenant não lê o livro cru — recebe a tendência já na frase do 0116. Quem
-- calcula a frase é o motor puro de @alsham/engineer; quem lê o ar, lê a média
-- daqui e grava, é o runInsightOnce do apps/api.
-- ⛔ "Devedor repetido" fica FORA: o ar.receivables não tem vínculo estruturado
-- com o crm (Lei 7). Ver o corpo do PR.
-- =============================================================================
