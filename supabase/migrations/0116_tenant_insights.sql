-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0116_tenant_insights.sql
-- O INSIGHT PROATIVO — a primeira prova de cognição que age sem ser provocada.
-- Objetos no schema `core`. Core, NÃO módulo: sem manifesto, fora da Store.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono. A lacuna 0015–0016 é proposital; esta é
-- a próxima livre depois do 0115_pack.
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE ESTE ARQUIVO RESOLVE, E POR QUE ELE É CORE (não um módulo)
-- -----------------------------------------------------------------------------
-- O MEMORANDO DA DIVISÃO DE ÁGUAS (docs/canon, §1.5 do CLAUDE.md) cobra UMA
-- prova real de cognição PROATIVA: pequena, honesta, rodando sozinha, gerando
-- um insight verdadeiro a partir de dado que JÁ EXISTE — antes de dez
-- capacidades prometidas. O Engenheiro de hoje é REATIVO (responde quando
-- perguntado); esta é a peça que AVISA sem ser perguntada.
--
-- Falta uma única coisa pra isso existir: **a superfície onde o tenant VÊ o
-- insight**. O Painel só LÊ (0021), a caixa de saída é fechada ao tenant, e
-- `packages/notifications` é README. Então nasce aqui uma tabela `core.*` —
-- e é CORE, como o Painel e a Forja, porque serve TODOS os tenants e nenhum
-- módulo em particular (Lei do Lego §5.5.1). Não entra na Store, não tem
-- manifesto, não tem cartão de seed.
--
-- ⚖️ A LEI 7 MORA NO DESENHO, não num comentário:
--   • A tabela NÃO guarda texto gerado por IA paga — guarda o texto
--     DETERMINÍSTICO que o observador puro (@alsham/engineer) montou a partir
--     de contagens reais. A Forja (voz de marca) é refino futuro, medido à
--     parte — e o aviso do 0019 vale: a política de reentrega do correio é
--     segura pra FATO, perigosa pra chamada PAGA.
--   • Quem ESCREVE é só o `service_role` (o observador agendado do apps/api).
--     Quem LÊ é o tenant, e só o PRÓPRIO — via função `security definer` com a
--     checagem de vínculo na primeira linha, o molde do 0021.
--   • A tabela é FECHADA ao `authenticated` (sem grant, sem policy): a única
--     porta de leitura é o leitor abaixo. É o modelo do correio (a caixa de
--     saída é fechada; `tenant_courier_summary` é a janela estreita).
-- =============================================================================

-- =============================================================================
-- 1. A TABELA — o quadro de avisos do tenant, escrito pelo servidor
-- -----------------------------------------------------------------------------
-- ⚠️ Chave natural `(tenant_id, kind, subject_key)`: o observador REESCREVE o
-- aviso no lugar a cada rodada (o número é sempre o da última leitura, nunca um
-- histórico que cresce sem teto). `subject_key` separa avisos do mesmo tipo —
-- para o recebível vencido, é a MOEDA (somar centavos de moedas diferentes
-- seria mentira). Quando o problema some, o observador APAGA a linha
-- (`clear_tenant_insight`) — um aviso velho que ninguém tira é um aviso que
-- mente sobre o presente.
-- =============================================================================

create table core.tenant_insights (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,

  -- O TIPO do aviso (ex.: 'ar-overdue'). Texto, não enum: um insight novo não
  -- deve exigir uma migration de tipo. Não-vazio (Lei 7: aviso sem tipo é ruído).
  kind          text        not null check (kind <> ''),

  -- O RECORTE dentro do tipo (ex.: a moeda 'BRL'). Vazio quando o tipo é único.
  subject_key   text        not null default '',

  -- A FRASE determinística — a única coisa que o tenant lê. Não-vazia.
  headline      text        not null check (headline <> ''),
  detail        text        not null default '',

  -- ⭐ O NÚMERO VERDADEIRO por trás da frase. `metric_value` é a contagem;
  -- `amount_cents`/`currency` o valor, quando o aviso é sobre dinheiro. Todos
  -- podem ser nulos: nem todo insight futuro carrega número/dinheiro.
  metric_value  bigint,
  amount_cents  bigint,
  currency      char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),

  -- QUANDO foi observado. É o carimbo que impede o aviso de mentir sobre o
  -- presente: a tela mostra "notado há X".
  observed_at   timestamptz not null default now(),

  constraint tenant_insights_unique_subject unique (tenant_id, kind, subject_key)
);

comment on table core.tenant_insights is
  'O quadro de avisos proativos do tenant. Escrito só pelo service_role (o observador agendado), lido só pelo próprio tenant via core.tenant_insights_recent(). Um por (tenant, tipo, recorte); reescrito a cada rodada, apagado quando o problema some.';

-- ⛔ RLS ligada e FORÇADA, ainda que a tabela seja fechada ao authenticated:
-- defesa em profundidade. A leitura do tenant passa SEMPRE pelo leitor abaixo;
-- a tabela nua não é concedida a ninguém além do dono/serviço.
alter table core.tenant_insights enable row level security;
alter table core.tenant_insights force row level security;

-- Nenhuma policy e nenhum grant para `authenticated`: a tabela não se lê nem se
-- escreve direto. As três funções abaixo são as únicas portas.

create index tenant_insights_by_tenant_idx
  on core.tenant_insights (tenant_id, observed_at desc);

-- =============================================================================
-- 2. A ESCRITA — só o service_role, por uma porta que valida
-- -----------------------------------------------------------------------------
-- ⚠️ `security definer`: roda com o privilégio do dono, então a checagem do que
-- entra é dela. Recusa tipo/frase vazios (Lei 7). Reescreve no lugar
-- (`on conflict`) — o aviso é sempre a leitura mais recente.
-- =============================================================================

create or replace function core.record_tenant_insight(
  p_tenant_id    uuid,
  p_kind         text,
  p_subject_key  text,
  p_headline     text,
  p_detail       text,
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
    raise exception 'insight sem tipo não se grava' using errcode = '23514';
  end if;
  if coalesce(btrim(p_headline), '') = '' then
    raise exception 'insight sem frase não se grava (Lei 7)' using errcode = '23514';
  end if;

  insert into core.tenant_insights (
    tenant_id, kind, subject_key, headline, detail,
    metric_value, amount_cents, currency, observed_at
  )
  values (
    p_tenant_id, p_kind, coalesce(p_subject_key, ''), p_headline, coalesce(p_detail, ''),
    p_metric_value, p_amount_cents,
    case when p_currency is null then null else upper(p_currency)::char(3) end,
    now()
  )
  on conflict (tenant_id, kind, subject_key) do update set
    headline     = excluded.headline,
    detail       = excluded.detail,
    metric_value = excluded.metric_value,
    amount_cents = excluded.amount_cents,
    currency     = excluded.currency,
    observed_at  = now();
end;
$$;

comment on function core.record_tenant_insight(uuid, text, text, text, text, bigint, bigint, text) is
  'Grava/reescreve um aviso proativo do tenant. Só o service_role (o observador agendado). Recusa tipo/frase vazios.';

-- ⚠️ Quando o problema some, o aviso tem de sumir com ele. Esta é a porta que o
-- observador usa para limpar os avisos de um tipo ANTES de gravar os atuais —
-- um aviso que sobrevive ao fim do problema mente sobre o presente.
create or replace function core.clear_tenant_insight(
  p_tenant_id uuid,
  p_kind      text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from core.tenant_insights
   where tenant_id = p_tenant_id and kind = p_kind;
$$;

comment on function core.clear_tenant_insight(uuid, text) is
  'Apaga os avisos de um tipo para um tenant. Só o service_role, no começo de cada rodada do observador.';

-- =============================================================================
-- 3. A LEITURA — o tenant vê o PRÓPRIO quadro, e só ele
-- -----------------------------------------------------------------------------
-- O molde do 0021: `security definer` com o vínculo checado na PRIMEIRA linha.
-- Uma função que roda com o privilégio do dono não confia no `p_tenant_id` que
-- recebeu.
-- =============================================================================

create or replace function core.tenant_insights_recent(p_tenant_id uuid)
returns table (
  kind         text,
  subject_key  text,
  headline     text,
  detail       text,
  metric_value bigint,
  amount_cents bigint,
  currency     text,
  observed_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.is_tenant_member(p_tenant_id) then
    raise exception 'sem vínculo com este tenant' using errcode = '42501';
  end if;

  return query
  select
    ti.kind, ti.subject_key, ti.headline, ti.detail,
    ti.metric_value, ti.amount_cents, ti.currency::text, ti.observed_at
  from core.tenant_insights ti
  where ti.tenant_id = p_tenant_id
  order by ti.observed_at desc;
end;
$$;

comment on function core.tenant_insights_recent(uuid) is
  'Os avisos proativos DESTE tenant, do mais recente ao mais antigo. O vínculo é checado na primeira linha (molde do 0021).';

-- =============================================================================
-- 4. FECHAMENTO — revogar ANTES de conceder (a lição do 0021/0022)
-- -----------------------------------------------------------------------------
-- No PostgreSQL toda função nasce com EXECUTE para PUBLIC. Estas três nasceram
-- DEPOIS do `revoke ... on all functions in schema core` do 0001, então
-- herdaram o privilégio de PUBLIC — e o `grant` seguinte só significa alguma
-- coisa porque o `revoke` abaixo tira o de PUBLIC primeiro. Sem ele, o grant é
-- decoração (a sabotagem que o 0022 pagou pra aprender).
-- =============================================================================

-- A escrita e a limpeza NUNCA vão ao authenticated: quem escreve é o observador
-- agendado, com service_role. O tenant não fabrica o próprio aviso.
revoke all on function core.record_tenant_insight(uuid, text, text, text, text, bigint, bigint, text)
  from public, anon, authenticated;
revoke all on function core.clear_tenant_insight(uuid, text)
  from public, anon, authenticated;
grant execute on function core.record_tenant_insight(uuid, text, text, text, text, bigint, bigint, text)
  to service_role;
grant execute on function core.clear_tenant_insight(uuid, text)
  to service_role;

-- A leitura é do tenant autenticado (a função checa o vínculo). `anon` fica de
-- fora: quem não está autenticado não tem tenant sobre o que perguntar.
revoke all on function core.tenant_insights_recent(uuid) from public, anon, authenticated;
grant execute on function core.tenant_insights_recent(uuid) to authenticated;

-- =============================================================================
-- FIM. Uma tabela fechada, três portas: escreve o serviço, apaga o serviço, lê
-- o dono do tenant. Nenhum segredo. O agendamento é o 0117 (comentado, ato do
-- dono). O que ENCHE a tabela é o observador do apps/api (runInsightOnce),
-- alimentado pelo motor puro de @alsham/engineer.
-- =============================================================================
