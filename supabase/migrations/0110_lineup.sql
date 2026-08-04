-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0110_lineup.sql
-- Módulo 95: Programação/line-up. Schema `lineup`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver ONDA-EVENTOS-DECISOES.md, o
-- SEGUNDO módulo da Onda Eventos (Fase 3 — o Vertical 🎪 Eventos). Nasce sob
-- `vertical_key='events'`.
--
-- Taxonomia: Vertical 🎪 Eventos (§6, "vertical viva: Events OS™") — capacidade
-- *Programação/line-up* (a linha do Eventos: "Ingressos · Credenciamento ·
-- Programação/line-up · Fornecedores de evento · Patrocínios · Afiliados ·
-- Check-in · Pós-evento"). O token canônico é, literalmente,
-- "Programação/line-up".
-- Spec: docs/canon/MODULO-LINEUP-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON: A AGENDA É PLANO MUTÁVEL, NÃO LIVRO IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- item de line-up (`lineup.slots`) é uma atração/sessão/palestra no programa de
-- um evento. A pergunta é: ele é FATO CONSUMADO (imutável, como o `recv`, o
-- `pcost`, a vistoria do `sec`) ou é PLANO (mutável, como a aresta do `gantt` e
-- o reagendamento do `edcal`)?
--
-- ⭐ **RESPOSTA: PLANO MUTÁVEL, e a linha se APAGA.** O programa de um evento
-- muda até (e durante) o dia: a palestra troca de palco, o horário desliza, a
-- banda cancela e outra entra. Um line-up é a MESMA física do `gantt` (a
-- dependência é metadado do plano — "some quando o plano muda") e do
-- reagendamento do `edcal` ("o calendário é PLANO, não fato"). Logo:
--   • a linha é livremente EDITÁVEL (título, palco, horário, atração, ordem);
--   • a linha é APAGÁVEL — tirar uma atração do programa é redesenhar o plano,
--     não rasurar um fato. Há GRANT de DELETE (a única forma honesta de
--     "removi a atração da grade").
--
-- ⭐ **O DIVERGE ASSINADO do `sched`** (a referência primária): o marco do
-- `sched` carrega uma MÁQUINA DE ESTADOS (`planned → done/cancelled`, com o
-- reabrir) porque um marco tem um FIM que se atinge. Uma atração de line-up NÃO
-- tem ciclo de vida: não existe "line-up concluído" — existe a grade, que se
-- edita e se reordena até não fazer mais sentido, e então se apaga. Por isso
-- ⛔ **NÃO há coluna `status`, NÃO há `create type lineup.…`, NÃO há
-- `allowed_transition`.** Copiar o ciclo do `sched` "por consistência" seria o
-- erro que o canon proíbe: a lei do line-up vive no pacote e no schema POR
-- AUSÊNCIA de máquina de estados. Um teste assina a ausência.
--
-- -----------------------------------------------------------------------------
-- 🔴 O EVENTO ENTRA POR ID SOLTO — sem FK, sem ler o schema alheio
-- -----------------------------------------------------------------------------
-- O item aponta o evento (o módulo universal de eventos, Módulo 11) por id solto
-- (`event_id`) + `event_name` carimbado pela tela. NÃO há FK cruzada e este
-- arquivo NÃO referencia o schema daquele módulo (módulo não conhece módulo — a
-- Lei do Lego). O nome carimbado é o que faz a grade sobreviver mesmo que o
-- cadastro do evento mude. O vínculo CONGELA na criação: mudar de evento seria
-- outra atração, em outra grade.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA título em TEXTO LIVRE (a atração/sessão/palestra), palco/sala/
--      trilha em TEXTO LIVRE (um congresso tem trilhas; um festival tem palcos),
--      horário de início/fim OPCIONAL (o programa pode nascer TBD), atração/
--      palestrante em TEXTO LIVRE OPCIONAL, e uma posição para a ordenação
--      manual da grade.
--   ❌ NÃO ENTRA tipo de evento (é o módulo universal, por id solto), nem
--      ingresso/QR/credencial (são outras capacidades do vertical), nem enum de
--      palco/trilha (congelaria o vocabulário de uma casa).
-- =============================================================================

create schema if not exists lineup;

comment on schema lineup is
  'Módulo Programação/line-up. Vertical events (Eventos) da Taxonomia — capacidade Programação/line-up. A grade de atrações/sessões de um evento (id solto ao módulo universal de eventos). A agenda é PLANO MUTÁVEL, não livro imutável: a linha se edita e se APAGA (a fisica do gantt e do calendario editorial), sem coluna status e sem ciclo de vida — o DIVERGE assinado do modulo de cronogramas. Nao cria objeto em core nem le schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function lineup.emit_event(
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
  if p_event_type not like 'lineup.%' then
    raise exception 'lineup.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'lineup',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function lineup.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function lineup.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'lineup.slot.manage');
$$;

create or replace function lineup.touch_updated_at()
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
-- 2. SLOTS — os itens da grade de programação
-- =============================================================================

create table lineup.slots (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- 🔴 O evento entra por ID SOLTO — sem FK, sem ler o schema alheio do módulo
  -- universal de eventos. O nome é carimbado pela tela e é o que faz a grade
  -- sobreviver ao redesenho do cadastro de evento.
  event_id      uuid        not null,
  event_name    text        not null default '',
  -- Título em TEXTO LIVRE (a atração/sessão/palestra).
  title         text        not null check (length(btrim(title)) > 0),
  -- Palco/sala/trilha em TEXTO LIVRE — OPCIONAL (um evento pode ter palco único).
  stage         text        not null default '',
  -- Horário de início/fim — OPCIONAL: o programa pode nascer TBD ("a definir").
  starts_at     timestamptz,
  ends_at       timestamptz,
  -- Atração/palestrante em TEXTO LIVRE — OPCIONAL.
  performer     text        not null default '',
  -- Posição para a ordenação MANUAL da grade (a leitura ordena por position).
  position      integer     not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint lineup_slots_id_tenant unique (id, tenant_id),
  -- Física do intervalo: não há fim sem início, e o fim não antecede o início.
  -- (Os dois nulos — TBD — são permitidos.)
  constraint lineup_slots_window_coherent check (
    (ends_at is null or starts_at is not null)
    and
    (starts_at is null or ends_at is null or ends_at >= starts_at)
  )
);

-- A leitura da grade: por posição, depois por horário (os sem horário ao fim).
create index lineup_slots_agenda_idx
  on lineup.slots (tenant_id, event_id, position, coalesce(starts_at, 'infinity'::timestamptz));

create trigger lineup_slots_touch
  before update on lineup.slots
  for each row execute function lineup.touch_updated_at();

alter table lineup.slots enable row level security;
alter table lineup.slots force row level security;

create policy lineup_slots_select on lineup.slots
  for select to authenticated
  using (lineup.can_access(tenant_id));

create policy lineup_slots_insert on lineup.slots
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'lineup.slot.manage'));

create policy lineup_slots_update on lineup.slots
  for update to authenticated
  using (core.has_permission(tenant_id, 'lineup.slot.manage'))
  with check (core.has_permission(tenant_id, 'lineup.slot.manage'));

-- ⭐⭐ COM policy de DELETE: a agenda é PLANO — tirar uma atração da grade é
-- redesenhar o plano, não rasurar um fato. É o DIVERGE assinado dos livros
-- imutáveis (recv/pcost/sec): lá não há porta de delete; aqui há.
create policy lineup_slots_delete on lineup.slots
  for delete to authenticated
  using (core.has_permission(tenant_id, 'lineup.slot.manage'));

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function lineup.guard_slot_insert()
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

create trigger lineup_slots_stamp
  before insert on lineup.slots
  for each row execute function lineup.guard_slot_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⛔ O vínculo com o evento CONGELA na criação
-- -----------------------------------------------------------------------------
-- Editar título/palco/horário/atração/ordem é LIVRE (a agenda é plano). Mas
-- mudar de EVENTO seria outra atração, em outra grade: o evento é a identidade.
create or replace function lineup.guard_event_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_id is distinct from old.event_id then
    raise exception 'o item pertence ao evento em que nasceu: mudar de evento é outra atração'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger lineup_slots_event_frozen
  before update on lineup.slots
  for each row execute function lineup.guard_event_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function lineup.slot_payload(p_slot_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot lineup.slots;
begin
  select * into v_slot
    from lineup.slots
   where id = p_slot_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'eventId',   v_slot.event_id,
    'eventName', v_slot.event_name,
    'title',     v_slot.title,
    'stage',     v_slot.stage,
    'startsAt',  v_slot.starts_at,
    'endsAt',    v_slot.ends_at,
    'performer', v_slot.performer,
    'position',  v_slot.position
  );
end;
$$;

comment on function lineup.slot_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do item de line-up. Quem escuta não faz join.';

create or replace function lineup.on_slot_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform lineup.emit_event(
    new.tenant_id,
    'lineup.slot.registered',
    lineup.slot_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger lineup_slots_emit_registered
  after insert on lineup.slots
  for each row execute function lineup.on_slot_registered();

-- ⭐ A agenda é PLANO: qualquer edição do item emite `lineup.slot.updated`.
-- (Não há fato de "conclusão" — o item não tem ciclo; a edição é o fato.)
create or replace function lineup.on_slot_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform lineup.emit_event(
    new.tenant_id,
    'lineup.slot.updated',
    lineup.slot_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger lineup_slots_emit_updated
  after update on lineup.slots
  for each row execute function lineup.on_slot_updated();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema lineup                  from public, anon, authenticated;
revoke all on all tables    in schema lineup from public, anon, authenticated;
revoke all on all functions in schema lineup from public, anon, authenticated;

grant usage on schema lineup to authenticated;

-- ⭐⭐ INSERT, UPDATE e DELETE: a agenda é plano mutável — a linha se cria, se
-- edita e se APAGA (o DIVERGE dos livros imutáveis do império).
grant select, insert, update, delete on lineup.slots to authenticated;

grant execute on function lineup.can_access(uuid) to authenticated;

-- `lineup.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `lineup.slot_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo. Nenhuma coluna status. Nenhuma
-- máquina de estados. Nenhum nome de cliente. Nenhum objeto fora de `lineup`.
-- Nenhuma leitura de schema alheio (o evento por id solto). `consumes` VAZIO.
-- =============================================================================
