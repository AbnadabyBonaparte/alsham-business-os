-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0119_tenant_timezone.sql
-- DATA SEMPRE NO FUSO DO TENANT — a correção de fundamento.
-- Objetos no schema `core`. Core, NÃO módulo.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono. ADITIVA: só acrescenta a coluna com
-- default seguro e a função central; não reescreve dado histórico.
--
-- -----------------------------------------------------------------------------
-- ⭐ O BUG DE FUNDAMENTO QUE ESTE ARQUIVO CORRIGE
-- -----------------------------------------------------------------------------
-- O banco roda em UTC. Toda comparação "vencido = due_date < hoje" usava
-- `current_date` — a data do SERVIDOR, nunca a data local de quem opera. Para
-- um tenant no Brasil isso já erra por até 3h perto da virada do dia; para um
-- tenant longe de UTC (EUA, Ásia), pode errar por um DIA INTEIRO, o tempo todo:
-- um título aparece vencido um dia antes (ou depois) da hora real dele.
--
-- Não é só o Engenheiro que assumia "hoje é tal dia": é o Avisador/Analista
-- (o observador de recebíveis vencidos, `0116`-`0118`) e qualquer módulo futuro
-- que compare data. A causa é UMA só: o sistema não tinha noção de fuso por
-- tenant. Este arquivo dá essa noção e a função central que todos passam a usar.
--
-- ⛔ **NUNCA hardcode fuso no código** — sempre lido de `core.tenants.timezone`
-- do tenant específico. O default abaixo é do tenant piloto ATUAL; um tenant
-- novo em outro país declara o fuso dele na criação.
-- =============================================================================

-- =============================================================================
-- 1. A COLUNA — aditiva, com default seguro que não quebra ninguém hoje
-- -----------------------------------------------------------------------------
-- `America/Sao_Paulo` é o fuso do tenant piloto atual (Brasil aboliu horário de
-- verão em 2019 — é estável UTC-3). Linhas existentes herdam o default; o
-- comportamento de hoje não muda para quem já está no ar.
-- =============================================================================

alter table core.tenants
  add column timezone text not null default 'America/Sao_Paulo';

comment on column core.tenants.timezone is
  'Fuso horário IANA do tenant (ex.: America/Sao_Paulo, America/New_York). É a fonte de "hoje" para toda comparação de data. Validado contra pg_timezone_names pelo gatilho. NUNCA hardcode fuso no código — leia daqui.';

-- =============================================================================
-- 2. A VALIDAÇÃO — o valor tem que ser um fuso IANA REAL (não string qualquer)
-- -----------------------------------------------------------------------------
-- ⚠️ Um CHECK não serve: validar contra `pg_timezone_names` é consultar um
-- catálogo, e CHECK exige expressão IMMUTABLE. Então é um gatilho, que reaproveita
-- a lista nativa do Postgres — nunca uma lista nossa que envelheceria.
--
-- ⚠️ O gatilho dispara em INSERT e em UPDATE OF timezone. O `add column` acima
-- NÃO dispara gatilho de linha, então as linhas existentes recebem o default
-- 'America/Sao_Paulo' (que é válido) sem passar por aqui — e está correto.
-- =============================================================================

create or replace function core.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'fuso horário inválido: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger tenants_timezone_valid
  before insert or update of timezone on core.tenants
  for each row execute function core.assert_valid_timezone();

-- =============================================================================
-- 3. A FUNÇÃO CENTRAL — `core.tenant_today(tenant_id)`
-- -----------------------------------------------------------------------------
-- Devolve a data de HOJE no fuso DAQUELE tenant, não do servidor. É a ÚNICA
-- fonte de "hoje" para decidir vencido: todo lugar que fazia `current_date` ou
-- `now()::date` para comparar data passa a chamá-la (Sol Único da data).
--
-- `now() at time zone t.timezone` converte o instante atual (timestamptz) para
-- o relógio de parede DAQUELE fuso; `::date` tira a data local. É exatamente
-- "que dia é hoje para quem está lá".
--
-- ⛔ SECURITY DEFINER porque lê `core.tenants`. E como toda função nasce
-- executável por PUBLIC no Postgres (a lição do 0022/0116/0118), o revoke
-- abaixo é o que faz o grant seguinte significar alguma coisa.
-- ⚖️ Devolve só uma DATA (não dado privado do tenant), então é concedida ao
-- `authenticated` (o Engenheiro, sob a sessão do usuário) E ao `service_role`
-- (o observador agendado) — os dois chamadores legítimos.
-- =============================================================================

create or replace function core.tenant_today(p_tenant_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone t.timezone)::date
    from core.tenants t
   where t.id = p_tenant_id;
$$;

comment on function core.tenant_today(uuid) is
  'A data de HOJE no fuso do tenant (core.tenants.timezone), não do servidor. Fonte única de "hoje" para comparação de vencido. Chamada pelo Engenheiro (authenticated) e pelo observador (service_role).';

-- =============================================================================
-- 4. FECHAMENTO — revogar ANTES de conceder (a lição do 0022/0116/0118)
-- -----------------------------------------------------------------------------
-- ⛔ A função de gatilho também nasceu aberta a PUBLIC — e não precisa de EXECUTE
-- concedido a ninguém (o gatilho a roda no contexto do dono da tabela). Deixá-la
-- aberta faria a guarda de CI "função executável por anon" reprovar.
revoke all on function core.assert_valid_timezone()
  from public, anon, authenticated;

revoke all on function core.tenant_today(uuid)
  from public, anon, authenticated;

grant execute on function core.tenant_today(uuid)
  to authenticated, service_role;

-- =============================================================================
-- FIM. Uma coluna de fuso (validada), e uma função central de "hoje no fuso do
-- tenant". A partir daqui, o Avisador/Analista (insight-service) e o Engenheiro
-- (o prompt + os fatos grounded) usam `core.tenant_today()` — nunca a data do
-- servidor. Qualquer módulo futuro que compare data faz o mesmo.
-- =============================================================================
