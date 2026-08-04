-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0115_pack.sql
-- Módulo 100: Pacotes. Schema `pack`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver o runbook. ⭐⭐ É o Módulo 100 do
-- catálogo: a peça que fecha a campanha "rumo aos 100 módulos". Vertical
-- 💇 Beleza & Estética (`vertical_key='beauty'`, VerticalKey do `@alsham/core`).
--
-- Taxonomia: Vertical 💇 Beleza & Estética (§6, "vertical viva: Suprema
-- Beleza") — capacidade *Pacotes*.
-- Spec: docs/canon/MODULO-PACK-SPEC.md
--
-- ⚠️ `pack` NÃO é palavra reservada do PostgreSQL — é seguro como nome de
-- schema (conferido com `create schema pack;` no CI e no self-verify).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE É — UM PACOTE FECHADO DE SESSÕES (a física do loyalty/invest)
-- -----------------------------------------------------------------------------
-- O cliente compra N sessões de um serviço; cada visita consome uma; não se
-- consome mais do que resta. O saldo é uma VIEW (total − consumidas), NUNCA
-- coluna — a física do `loyalty`/`invest`/`cash`: saldo é sempre calculado do
-- livro. E ⭐⭐ consumir mais que o saldo é RECUSADO (a TERCEIRA resposta ao
-- "pode ficar negativo?": `bank`/`inv` permitem negativo, `loyalty`/`invest`
-- recusam por promessa/posse, e aqui `pack` recusa porque a sessão que não foi
-- comprada não existe — inventá-la é mentir sobre o que a cliente pagou).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO — pack × loyalty
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O que
-- se MANTÉM do `loyalty`: saldo é VIEW, consumo > saldo é RECUSADO por um
-- gatilho que soma INTRA-schema (nunca schema alheio), o livro de consumo é
-- IMUTÁVEL (as duas camadas). O que DIVERGE:
--
--   • Um ponto de fidelidade é FUNGÍVEL — uma carteira genérica por cliente, e
--     a direção mora no tipo (earn/redeem). Um PACOTE não é fungível: é um
--     bundle amarrado a UM serviço (texto livre) e a UM cliente, com identidade
--     de COMPRA própria (o total congela na compra). Não há "earn": a compra
--     nasce com o teto (`total_sessions`), e o uso só SUBTRAI — cada sessão
--     consome exatamente uma. O teto não é um saldo que sobe; é uma trave.
--   • Consequência: o saldo é `total_sessions − count(usos)` de UM pacote (a
--     trave menos o que já se gastou dela), não `Σ(earn) − Σ(redeem)` de uma
--     carteira. São DUAS tabelas — a compra (cabeçalho que congela) e o livro
--     de usos (imutável) —, ligadas por FK REAL intra-schema.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o cliente por ID SOLTO ao `crm` (uuid, OBRIGATÓRIO — não há pacote
--      sem dono) + nome carimbado pela TELA; o serviço em TEXTO LIVRE (corte,
--      massagem, sessão de laser — vocabulário de cada casa, nunca enum); o
--      total de sessões (> 0, a trave); o uso com a data e um motivo opcional.
--   ❌ NÃO ENTRA preço do pacote / cálculo de valor por sessão (é comercial —
--      o título a receber é o `ar`, por id solto quando construído); validade
--      por relógio (expiração automática — sem cron fingido, Lei 7);
--      cancelamento/estorno do pacote (declarado FORA — não há máquina de
--      estados nesta etapa). `consumes` VAZIO.
--
-- 🔴 O `pack` NÃO LÊ o `crm`: o cliente é ID SOLTO, sem FK cruzada e sem uma
-- linha que toque schema alheio — a Lei do Lego. A ÚNICA FK cruzando tabelas é
-- INTRA-schema (`pack.uses → pack.packages`), e essa é permitida.
-- =============================================================================

create schema if not exists pack;

comment on schema pack is
  'Módulo Pacotes. Vertical beauty (Beleza & Estética) da Taxonomia. O pacote fechado de sessões: a compra congela o total (trave), cada uso consome uma sessão do livro IMUTÁVEL, o saldo é VIEW (total − usos) e consumir mais que o saldo é RECUSADO (a física do loyalty/invest, o gatilho soma INTRA-schema). ⭐⭐ O DIVERGE do loyalty: o ponto é fungível, o pacote é amarrado a UM serviço e UM cliente com identidade de compra própria. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a centésima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function pack.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not like 'pack.%' then
    raise exception 'pack.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pack',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pack.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pack.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pack.package.manage')
      or core.has_permission(p_tenant_id, 'pack.session.record');
$$;

-- =============================================================================
-- 2. PACKAGES — a COMPRA: cabeçalho que congela a trave (total_sessions)
-- -----------------------------------------------------------------------------
-- É a identidade de COMPRA: nasce com o total, e o total NUNCA muda (o DIVERGE
-- do loyalty, cuja carteira não tem teto). NENHUMA coluna de status, NENHUMA
-- máquina de estados (cancelamento/estorno é FORA nesta etapa). O cabeçalho é
-- fato consumado: não se edita nem se apaga — corrigir é registrar outro pacote.
-- =============================================================================

create table pack.packages (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O cliente por ID SOLTO ao crm — SEM FK cruzada (Lei do Lego), OBRIGATÓRIO
  -- (não há pacote sem dono). O nome carimbado pela TELA sobrevive ao redesenho.
  client_id       uuid        not null,
  client_name     text        not null default '',
  -- ⭐ O serviço — TEXTO LIVRE (corte, massagem, laser), NUNCA enum (anti-viés).
  service         text        not null check (length(btrim(service)) > 0),
  -- ⭐ A TRAVE: o total de sessões compradas. Congela na compra; > 0.
  total_sessions  integer     not null check (total_sessions > 0),
  note            text        not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  -- A FK intra-schema do uso aponta para (id, tenant_id): precisa ser unique.
  constraint pack_packages_id_tenant unique (id, tenant_id)
);

create index pack_packages_book_idx
  on pack.packages (tenant_id, created_at desc);
create index pack_packages_by_client_idx
  on pack.packages (tenant_id, client_id, created_at desc);

alter table pack.packages enable row level security;
alter table pack.packages force row level security;

create policy pack_packages_select on pack.packages
  for select to authenticated
  using (pack.can_access(tenant_id));

create policy pack_packages_insert on pack.packages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pack.package.manage'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a compra é fato consumado, e
-- o total é a trave que congela.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor
-- -----------------------------------------------------------------------------

create or replace function pack.guard_package_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger pack_packages_stamp
  before insert on pack.packages
  for each row execute function pack.guard_package_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ O CABEÇALHO CONGELA — nem o dono do banco altera a trave
-- -----------------------------------------------------------------------------
-- O total de sessões é a promessa vendida à cliente: mudá-lo depois seria
-- mentir sobre o que ela comprou. Não há grant de UPDATE (camada 1: o cliente
-- não tem porta); e o gatilho recusa até para o dono do banco (camada 2).

create or replace function pack.guard_package_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o pacote é uma compra fechada: o total de sessões não se altera. Corrigir é registrar outro pacote.'
    using errcode = '42501';
end;
$$;

create trigger pack_packages_immutable
  before update or delete on pack.packages
  for each row execute function pack.guard_package_immutable();

-- =============================================================================
-- 2.3 O FATO DA COMPRA — payload autossuficiente (cliente pelo NOME, id solto)
-- =============================================================================

create or replace function pack.package_payload(p pack.packages)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'packageId',     p.id,
    'clientId',      p.client_id,
    'clientName',    p.client_name,
    'service',       p.service,
    'totalSessions', p.total_sessions,
    'note',          p.note
  );
$$;

comment on function pack.package_payload(pack.packages) is
  'O envelope de um pacote — AUTOSSUFICIENTE, com o cliente pelo NOME carimbado (id solto). Quem escuta não faz join com o crm.';

create or replace function pack.on_package_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pack.emit_event(new.tenant_id, 'pack.package.registered', pack.package_payload(new));
  return new;
end;
$$;

create trigger pack_packages_emit_registered
  after insert on pack.packages
  for each row execute function pack.on_package_registered();

-- =============================================================================
-- 3. USES — ⭐⭐ O CONSUMO: LANÇAMENTO IMUTÁVEL, e o guarda da trave
-- -----------------------------------------------------------------------------
-- Cada uso é um FATO CONSUMADO: a cliente veio, usou uma sessão. Nasce pronto —
-- para sempre. NENHUM status, NENHUM updated_at. O cliente não tem porta de
-- UPDATE nem DELETE; e o gatilho recusa a reescrita até para o dono do banco.
-- FK REAL intra-schema (id, tenant_id) — o contraste com o client_id SOLTO do
-- pacote: o vínculo COM O PRÓPRIO MÓDULO é FK; o vínculo com o crm é id solto.
-- =============================================================================

create table pack.uses (
  id            uuid          primary key default gen_random_uuid(),
  tenant_id     uuid          not null references core.tenants (id) on delete cascade,
  package_id    uuid          not null,
  used_on       date          not null,
  note          text          not null default '',
  created_at    timestamptz   not null default now(),
  created_by    uuid          references auth.users (id) on delete set null,
  constraint pack_uses_package_fk
    foreign key (package_id, tenant_id)
    references pack.packages (id, tenant_id)
    on delete restrict
);

create index pack_uses_book_idx
  on pack.uses (tenant_id, package_id, created_at);

alter table pack.uses enable row level security;
alter table pack.uses force row level security;

create policy pack_uses_select on pack.uses
  for select to authenticated
  using (pack.can_access(tenant_id));

create policy pack_uses_insert on pack.uses
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pack.session.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o uso é fato consumado.

-- -----------------------------------------------------------------------------
-- 3.1 O carimbo é do servidor — E o uso confere a trave (INTRA-schema)
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TERCEIRA RESPOSTA: consumir mais que o saldo é RECUSADO. O guarda soma
-- os usos do pacote NO PRÓPRIO SCHEMA (pack.uses + pack.packages) — nunca schema
-- alheio. Se as sessões já se esgotaram, o novo uso é recusado com mensagem
-- clara. É a física do `invest`/`loyalty`, re-perguntada para o pacote fechado.

create or replace function pack.guard_use_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_used  int;
begin
  new.created_by := (select auth.uid());

  select total_sessions into v_total
    from pack.packages
   where id = new.package_id and tenant_id = new.tenant_id;

  -- Pacote inexistente? deixa a FK intra-schema recusar (foreign_key_violation).
  if v_total is null then
    return new;
  end if;

  select count(*) into v_used
    from pack.uses
   where package_id = new.package_id and tenant_id = new.tenant_id;

  if v_used >= v_total then
    raise exception 'pacote esgotado: as % sessões já foram consumidas, novo uso recusado', v_total
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger pack_uses_stamp
  before insert on pack.uses
  for each row execute function pack.guard_use_insert();

-- -----------------------------------------------------------------------------
-- 3.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o uso lançado
-- -----------------------------------------------------------------------------

create or replace function pack.guard_use_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o uso de uma sessão é fato consumado: não se edita nem se apaga. Corrigir é registrar outro pacote.'
    using errcode = '42501';
end;
$$;

create trigger pack_uses_immutable
  before update or delete on pack.uses
  for each row execute function pack.guard_use_immutable();

-- =============================================================================
-- 3.3 O FATO DO CONSUMO — payload autossuficiente
-- =============================================================================

create or replace function pack.use_payload(u pack.uses)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'useId',     u.id,
    'packageId', u.package_id,
    'usedOn',    u.used_on,
    'note',      u.note
  );
$$;

comment on function pack.use_payload(pack.uses) is
  'O envelope de um consumo de sessão — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function pack.on_use_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pack.emit_event(new.tenant_id, 'pack.session.used', pack.use_payload(new));
  return new;
end;
$$;

create trigger pack_uses_emit_used
  after insert on pack.uses
  for each row execute function pack.on_use_registered();

-- =============================================================================
-- 4. O SALDO — ⭐ VIEW calculada do livro, NUNCA coluna (a física do loyalty)
-- =============================================================================
-- security_invoker: a VIEW lê sob a RLS de quem consulta — o saldo do tenant do
-- usuário, nunca do vizinho. remaining = total_sessions − usos deste pacote.

create view pack.package_balances
  with (security_invoker = true) as
  select
    p.id           as package_id,
    p.tenant_id,
    p.total_sessions,
    count(u.id)::bigint                        as used_count,
    (p.total_sessions - count(u.id))::bigint   as remaining
  from pack.packages p
  left join pack.uses u
    on u.package_id = p.id and u.tenant_id = p.tenant_id
  group by p.id, p.tenant_id, p.total_sessions;

comment on view pack.package_balances is
  'O saldo de um pacote — VIEW calculada do livro (total_sessions − usos), NUNCA coluna. security_invoker: lê sob a RLS de quem consulta.';

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pack                  from public, anon, authenticated;
revoke all on all tables    in schema pack from public, anon, authenticated;
revoke all on all functions in schema pack from public, anon, authenticated;

grant usage on schema pack to authenticated;

-- ⛔ SÓ SELECT e INSERT nas duas tabelas: reescrever/apagar não existe (a compra
-- congela; o uso é fato consumado).
grant select, insert on pack.packages to authenticated;
grant select, insert on pack.uses to authenticated;
grant select on pack.package_balances to authenticated;

grant execute on function pack.can_access(uuid) to authenticated;

-- `pack.emit_event` NÃO é concedida. `pack.package_payload`/`pack.use_payload`
-- são encanamento dos gatilhos, não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma máquina de estados. Nenhum saldo em
-- coluna (é VIEW). Nenhum preço/valor (é comercial — o ar, futuro). Nenhuma
-- expiração por relógio (Lei 7). Nenhum objeto fora de `pack`. Nenhuma leitura
-- de schema alheio (cliente por id solto; a única FK é intra-schema).
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
