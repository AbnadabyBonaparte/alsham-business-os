-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0088_cashregister.sql
-- Módulo 73: Sessão de Caixa. Schema `cashregister`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §31, o
-- terceiro módulo da Onda Dezoito (Fase 2 — o Vertical 🛒 Varejo &
-- Supermercados). Nasce sob `vertical_key='retail'` (confirmado na
-- store-taxonomy).
--
-- Taxonomia: Vertical 🛒 Varejo & Supermercados — capacidade *Caixa* (§6).
-- Spec: docs/canon/MODULO-CASHREGISTER-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO: cashregister × cash — DUAS FÍSICAS DIFERENTES
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- `cash` (Módulo 14) e este módulo têm a palavra "caixa" no nome — e são coisas
-- OPOSTAS de propósito:
--
--   • `cash` é o LIVRO-CAIXA CORPORATIVO: lançamentos IMUTÁVEIS, sinal do tipo,
--     saldo é VIEW, SEM ciclo de vida — o livro nunca "fecha um turno". É a
--     contabilidade do dinheiro da empresa ao longo do tempo.
--   • `cashregister` é a SESSÃO FÍSICA DE UMA GAVETA: um turno de operador tem
--     COMEÇO e FIM. Abre-se contando o fundo de troco (`opening_amount`),
--     fecha-se contando a gaveta (`closing_amount`). Tem ciclo `open → closed`,
--     e `closed` é TERMINAL (a física do `scrum`/`bud`/`proj`): o turno
--     encerrado não reabre — o próximo turno é sessão NOVA.
--
-- Uma é livro perpétuo; a outra é turno com abertura e fechamento. O teste
-- assina o contraste: o `cash` NÃO tem `allowed_transition` (não tem ciclo);
-- este tem, e `closed` é terminal.
--
-- -----------------------------------------------------------------------------
-- ⭐ UMA SESSÃO ABERTA POR CAIXA — na CONSTRAINT (a física do `scrum`/`spc`)
-- -----------------------------------------------------------------------------
-- Uma gaveta física não tem dois turnos abertos ao mesmo tempo. A regra mora
-- num índice único PARCIAL sobre (tenant, caixa) onde status='open' — a física
-- do domínio no banco, não em código de aplicação.
--
-- ⛔ FORA: a conferência "esperado × contado" (a quebra de caixa) exigiria SOMAR
-- as vendas do `pdv` — leitura de schema alheio, acoplamento proibido. A
-- composição vive na TELA (como os cartões do sprint no `scrum`), alimentada de
-- FORA; aqui a sessão guarda só as CONTAGENS FÍSICAS (abertura e fechamento).
-- E sangria/suprimento estruturado (movimentos de gaveta) é capacidade futura.
-- =============================================================================

create schema if not exists cashregister;

comment on schema cashregister is
  'Módulo Sessão de Caixa. Vertical retail (Varejo & Supermercados) da Taxonomia. O turno físico de uma gaveta: abre contando o fundo de troco, fecha contando a gaveta. open → closed, closed TERMINAL (a física do scrum — o DIVERGE do cash, que é livro perpétuo sem ciclo). UMA sessão aberta por caixa (índice único parcial). Operador por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function cashregister.emit_event(
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
  if p_event_type not like 'cashregister.%' then
    raise exception 'cashregister.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'cashregister',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function cashregister.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function cashregister.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'cashregister.session.manage');
$$;

create or replace function cashregister.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. SESSIONS — o turno de caixa
-- =============================================================================

create table cashregister.sessions (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ A gaveta física por NOME em TEXTO LIVRE ("Caixa 1", "PDV Frente").
  register_name        text        not null check (length(btrim(register_name)) > 0),
  -- ⭐ Operador por ID SOLTO ao hr (opcional — temporário/terceiro não tem
  -- cadastro) + nome carimbado pela tela.
  operator_id          uuid,
  operator_name        text        not null default '',
  -- ⭐ Fundo de troco na abertura (>= 0; gaveta vazia a 0 é honesto).
  opening_amount_cents bigint      not null default 0 check (opening_amount_cents >= 0),
  -- ⭐ Contagem física no fechamento — nula até fechar.
  closing_amount_cents bigint      check (closing_amount_cents is null or closing_amount_cents >= 0),
  currency             text        not null default 'BRL' check (length(currency) = 3),
  status               text        not null default 'open'
                       check (status in ('open', 'closed')),
  note                 text        not null default '',
  opened_at            timestamptz not null default now(),
  opened_by            uuid        references auth.users (id) on delete set null,
  closed_at            timestamptz,
  closed_by            uuid        references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint cashregister_sessions_id_tenant unique (id, tenant_id),
  -- ⭐ closed ⇔ tem carimbo de fechamento E contagem de fechamento.
  constraint cashregister_sessions_close_coherent check (
    (status = 'closed' and closed_at is not null and closing_amount_cents is not null)
    or
    (status = 'open'   and closed_at is null     and closing_amount_cents is null)
  )
);

-- ⭐⭐ A REGRA NA CONSTRAINT: no máximo UMA sessão `open` por caixa (por tenant).
-- Abrir um segundo turno na mesma gaveta bate aqui (a física do scrum/spc/shift).
create unique index cashregister_sessions_one_open
  on cashregister.sessions (tenant_id, register_name)
  where status = 'open';

create index cashregister_sessions_roster_idx
  on cashregister.sessions (tenant_id, status, opened_at desc);

create trigger cashregister_sessions_touch
  before update on cashregister.sessions
  for each row execute function cashregister.touch_updated_at();

alter table cashregister.sessions enable row level security;
alter table cashregister.sessions force row level security;

create policy cashregister_sessions_select on cashregister.sessions
  for select to authenticated
  using (cashregister.can_access(tenant_id));

create policy cashregister_sessions_insert on cashregister.sessions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'cashregister.session.manage'));

create policy cashregister_sessions_update on cashregister.sessions
  for update to authenticated
  using (cashregister.can_access(tenant_id))
  with check (cashregister.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Turno encerrado é história do caixa.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ABERTO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function cashregister.guard_session_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'a sessão de caixa nasce aberta — fechar é decisão à parte'
      using errcode = '22023';
  end if;

  -- A gaveta abre agora, pelo servidor: a hora e o autor não vêm do formulário.
  new.opened_at := now();
  new.opened_by := (select auth.uid());
  new.closing_amount_cents := null;
  new.closed_at := null;
  new.closed_by := null;
  return new;
end;
$$;

create trigger cashregister_sessions_stamp
  before insert on cashregister.sessions
  for each row execute function cashregister.guard_session_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/cashregister
-- -----------------------------------------------------------------------------
-- ⭐ open → closed, e SÓ. `closed` é TERMINAL (a física do scrum/bud/proj): o
-- turno encerrado não reabre. O próximo turno é sessão NOVA.

create or replace function cashregister.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open', 'closed')
  );
$$;

comment on function cashregister.allowed_transition(text, text) is
  'Ciclo de vida da sessão de caixa. Espelho de ALLOWED_TRANSITIONS em @alsham/cashregister — há teste que lê este arquivo e compara. open → closed, e closed é TERMINAL: o turno encerrado não reabre (a física do scrum, o DIVERGE do cash que não tem ciclo).';

create or replace function cashregister.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not cashregister.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da sessão: o turno encerrado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'cashregister.session.manage') then
    raise exception 'fechar a sessão de caixa exige a permissão cashregister.session.manage'
      using errcode = '42501';
  end if;

  -- Fechar EXIGE a contagem física da gaveta — sem número, não fecha (Lei 7).
  if new.closing_amount_cents is null then
    raise exception 'fechar o caixa exige a contagem física da gaveta (closing_amount_cents)'
      using errcode = '22023';
  end if;

  -- O fechamento é carimbado pelo SERVIDOR (a hora digitada é descartada).
  new.closed_at := now();
  new.closed_by := (select auth.uid());
  return new;
end;
$$;

create trigger cashregister_sessions_guard_status
  before update of status on cashregister.sessions
  for each row execute function cashregister.guard_status_transition();

-- ⭐ A abertura CONGELA quando a sessão fecha: caixa, operador e fundo de troco
-- não mudam depois do fechamento (fato consumado do turno).
create or replace function cashregister.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed'
     and (new.register_name is distinct from old.register_name
          or new.operator_id is distinct from old.operator_id
          or new.operator_name is distinct from old.operator_name
          or new.opening_amount_cents is distinct from old.opening_amount_cents
          or new.currency is distinct from old.currency
          or new.closing_amount_cents is distinct from old.closing_amount_cents) then
    raise exception 'a sessão já foi fechada: caixa, operador, fundo e contagem não mudam mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger cashregister_sessions_content_frozen
  before update on cashregister.sessions
  for each row execute function cashregister.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function cashregister.session_payload(p cashregister.sessions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId',          p.id,
    'registerName',       p.register_name,
    'operatorId',         p.operator_id,
    'operatorName',       p.operator_name,
    'openingAmountCents', p.opening_amount_cents,
    'closingAmountCents', p.closing_amount_cents,
    'currency',           p.currency,
    'status',             p.status,
    'openedAt',           p.opened_at,
    'closedAt',           p.closed_at
  );
$$;

comment on function cashregister.session_payload(cashregister.sessions) is
  'O envelope de uma sessão de caixa — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function cashregister.on_session_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cashregister.emit_event(new.tenant_id, 'cashregister.session.opened', cashregister.session_payload(new));
  return new;
end;
$$;

create trigger cashregister_sessions_emit_opened
  after insert on cashregister.sessions
  for each row execute function cashregister.on_session_opened();

create or replace function cashregister.on_session_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status = 'closed' then
    perform cashregister.emit_event(new.tenant_id, 'cashregister.session.closed', cashregister.session_payload(new));
  end if;

  return new;
end;
$$;

create trigger cashregister_sessions_emit_changed
  after update of status on cashregister.sessions
  for each row execute function cashregister.on_session_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema cashregister                  from public, anon, authenticated;
revoke all on all tables    in schema cashregister from public, anon, authenticated;
revoke all on all functions in schema cashregister from public, anon, authenticated;

grant usage on schema cashregister to authenticated;

grant select, insert, update on cashregister.sessions to authenticated;

grant execute on function cashregister.can_access(uuid) to authenticated;

-- `cashregister.emit_event` e `cashregister.session_payload` NÃO são concedidas.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma leitura de venda (a quebra de caixa é de tela,
-- não lê o pdv). Nenhum ciclo além de open→closed. Nenhum objeto fora de
-- `cashregister`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
