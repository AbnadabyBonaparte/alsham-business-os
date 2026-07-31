-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0090_erisk.sql
-- Módulo 75: Risco Corporativo. Schema `erisk`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- primeiro módulo da Onda Dezenove (Fase 3 — os 3 Domains pendentes). Nasce sob
-- `domain_key='grc'` (Governança, Riscos & Compliance).
--
-- Taxonomia: Domain 🏛 GRC — capacidades *Gestão de riscos* E *Matriz de
-- riscos* (§5). São UM módulo: a matriz é a LEITURA do registro (prob×impact),
-- não uma segunda tabela.
-- Spec: docs/canon/MODULO-ERISK-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO — erisk × risk (Módulo 60, PMO): O ESCOPO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- `risk` (Módulo 60, Domain pmo) JÁ EXISTE — e este NÃO o duplica. A pergunta
-- foi: risco de PROJETO e risco CORPORATIVO são a mesma coisa?
--
--   • O `risk` é escopado a um PROJETO: `project_id NOT NULL`. É o risco de
--     ENTREGA — "este projeto pode atrasar". Some quando o projeto acaba.
--   • O `erisk` é o risco ESTRATÉGICO/CORPORATIVO: NÃO tem projeto. É o risco
--     do NEGÓCIO — "um concorrente pode nos tirar o mercado", "a regulação pode
--     mudar". Vive enquanto a empresa vive, não enquanto um projeto vive.
--
-- ⭐ O QUE SE MANTÉM do `risk` (o MANTIDO assinado): a régua 1–5 (CHECK
-- argumentado), a severidade como LEITURA (nunca coluna), e a FÍSICA DO CICLO —
-- `mitigated` REABRE (`mitigated → open`, o mesmo risco), `closed` é TERMINAL.
-- Copiar a física do ciclo aqui é CERTO, e está escrito que é de propósito.
--
-- ⭐ O QUE DIVERGE (os campos do escopo corporativo, que o `risk` não tem):
--   • `category` TEXTO LIVRE (estratégico/operacional/financeiro/reputacional —
--     vocabulário de cada casa, nunca enum).
--   • `owner` TEXTO LIVRE + `owner_id` id solto OPCIONAL ao hr (o DONO do risco,
--     figura central da gestão de risco corporativa — o `risk` não tem dono).
--   • `treatment` — a ESTRATÉGIA DE TRATAMENTO (accept/mitigate/transfer/avoid,
--     os 4 T's da ISO 31000): CHECK argumentado, física do MÉTODO. Opcional (um
--     risco recém-registrado pode não ter a estratégia decidida — Lei 7: quem
--     decide, escreve).
--   • `control_id` id solto OPCIONAL ao `control` (o controle interno que
--     mitiga o risco) — nunca FK cruzada.
--
-- ANTI-VIÉS: descrição texto livre; sem matriz/heatmap em coluna (leitura); sem
-- pontuação automática/IA; sem simulação. `consumes` VAZIO.
-- =============================================================================

create schema if not exists erisk;

comment on schema erisk is
  'Módulo Risco Corporativo. Domain grc da Taxonomia. O risco ESTRATÉGICO do negócio (não o de projeto — o DIVERGE do risk, que é project-scoped). MANTIDO do risk: régua 1–5 CHECK, severidade é leitura, mitigated REABRE e closed é TERMINAL. DIVERGE: sem project_id; category/owner texto livre; treatment (accept/mitigate/transfer/avoid, os 4 T''s da ISO 31000, CHECK). Matriz de riscos = leitura do registro. control_id id solto opcional. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function erisk.emit_event(
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
  if p_event_type not like 'erisk.%' then
    raise exception 'erisk.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'erisk',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function erisk.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function erisk.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'erisk.entry.manage');
$$;

create or replace function erisk.touch_updated_at()
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
-- 2. ENTRIES — o registro de riscos corporativos
-- =============================================================================

create table erisk.entries (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Descrição em TEXTO LIVRE, obrigatória.
  description     text        not null check (length(btrim(description)) > 0),
  -- ⭐ DIVERGE do risk: categoria corporativa em TEXTO LIVRE (nunca enum).
  category        text        not null default '',
  -- ⭐ DIVERGE do risk: o DONO do risco (texto livre) + id solto opcional ao hr.
  owner           text        not null default '',
  owner_id        uuid,
  -- ⭐ A régua 1–5: MANTIDO do risk (física do método).
  probability     int         not null check (probability between 1 and 5),
  impact          int         not null check (impact between 1 and 5),
  -- ⭐ DIVERGE do risk: a estratégia de tratamento (os 4 T's, CHECK argumentado).
  -- OPCIONAL — um risco recém-registrado pode não ter a estratégia decidida.
  treatment       text        check (treatment is null or treatment in ('accept', 'mitigate', 'transfer', 'avoid')),
  -- Plano de tratamento: OPCIONAL (texto).
  treatment_plan  text        not null default '',
  -- ⭐ Vínculo OPCIONAL ao controle interno que mitiga (id solto ao control).
  control_id      uuid,
  status          text        not null default 'open'
                  check (status in ('open', 'mitigated', 'closed')),
  mitigated_at    timestamptz,
  mitigated_by    uuid        references auth.users (id) on delete set null,
  closed_at       timestamptz,
  closed_by       uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint erisk_entries_id_tenant unique (id, tenant_id),
  -- ⭐⭐ mitigated ⇔ carimbo (limpo ao reabrir). ⚠️ E o `closed` aceita o
  -- carimbo COMO HISTÓRIA: um risco mitigado que se ENCERRA (mitigated → closed,
  -- transição declarada) mantém o mitigated_at — foi mitigado, e o fechamento
  -- não apaga esse fato. Só o `open` (a reabertura) exige o carimbo limpo. Isto
  -- corrige, de propósito, a coerência estrita que o `risk` (Módulo 60) deixou
  -- latente — lá a transição mitigated→closed existe mas o teste a evita; aqui
  -- ela FUNCIONA e há teste que a percorre.
  constraint erisk_entries_mitigate_coherent check (
    (status = 'mitigated' and mitigated_at is not null)
    or (status = 'open' and mitigated_at is null)
    or (status = 'closed')
  ),
  constraint erisk_entries_close_coherent check (
    (status = 'closed' and closed_at is not null)
    or
    (status <> 'closed' and closed_at is null)
  )
);

create index erisk_entries_open_idx
  on erisk.entries (tenant_id, created_at desc)
  where status in ('open', 'mitigated');

create trigger erisk_entries_touch
  before update on erisk.entries
  for each row execute function erisk.touch_updated_at();

alter table erisk.entries enable row level security;
alter table erisk.entries force row level security;

create policy erisk_entries_select on erisk.entries
  for select to authenticated
  using (erisk.can_access(tenant_id));

create policy erisk_entries_insert on erisk.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'erisk.entry.manage'));

create policy erisk_entries_update on erisk.entries
  for update to authenticated
  using (erisk.can_access(tenant_id))
  with check (erisk.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Registro de risco se mantém — é história.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre OPEN, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function erisk.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'o risco nasce aberto — mitigar, reabrir e encerrar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger erisk_entries_stamp
  before insert on erisk.entries
  for each row execute function erisk.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/erisk
-- -----------------------------------------------------------------------------
-- ⭐⭐ MANTIDO do risk (assinado): mitigated REABRE, closed é TERMINAL.

create or replace function erisk.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',       'mitigated'),
    ('open',       'closed'),
    ('mitigated',  'closed'),
    ('mitigated',  'open')
  );
$$;

comment on function erisk.allowed_transition(text, text) is
  'Ciclo de vida do risco corporativo. Espelho de ALLOWED_TRANSITIONS em @alsham/erisk. MANTIDO do risk (assinado): mitigated REABRE (mitigated → open, o mesmo risco), closed é TERMINAL.';

create or replace function erisk.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not erisk.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do risco: o risco encerrado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'erisk.entry.manage') then
    raise exception 'mover o risco exige a permissão erisk.entry.manage'
      using errcode = '42501';
  end if;

  if new.status = 'mitigated' then
    new.mitigated_at := now();
    new.mitigated_by := (select auth.uid());
  end if;

  -- ⭐⭐ Reabrir LIMPA o carimbo de mitigação (a mitigação deixou de valer).
  if new.status = 'open' then
    new.mitigated_at := null;
    new.mitigated_by := null;
  end if;

  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger erisk_entries_guard_status
  before update of status on erisk.entries
  for each row execute function erisk.guard_status_transition();

-- ⭐ O conteúdo CONGELA quando o risco encerra.
create or replace function erisk.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed'
     and (new.description is distinct from old.description
          or new.category is distinct from old.category
          or new.owner is distinct from old.owner
          or new.owner_id is distinct from old.owner_id
          or new.probability is distinct from old.probability
          or new.impact is distinct from old.impact
          or new.treatment is distinct from old.treatment
          or new.treatment_plan is distinct from old.treatment_plan
          or new.control_id is distinct from old.control_id) then
    raise exception 'o risco já foi encerrado: descrição, régua, dono, tratamento e vínculos não mudam mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger erisk_entries_content_frozen
  before update on erisk.entries
  for each row execute function erisk.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function erisk.entry_payload(p_entry_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry erisk.entries;
begin
  select * into v_entry from erisk.entries
   where id = p_entry_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'entryId',       v_entry.id,
    'description',   v_entry.description,
    'category',      v_entry.category,
    'owner',         v_entry.owner,
    'ownerId',       v_entry.owner_id,
    'probability',   v_entry.probability,
    'impact',        v_entry.impact,
    'treatment',     v_entry.treatment,
    'controlId',     v_entry.control_id,
    'status',        v_entry.status,
    'mitigatedAt',   v_entry.mitigated_at,
    'closedAt',      v_entry.closed_at
  );
end;
$$;

comment on function erisk.entry_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do risco corporativo. Quem escuta não faz join.';

create or replace function erisk.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform erisk.emit_event(new.tenant_id, 'erisk.entry.registered', erisk.entry_payload(new.id, new.tenant_id));
  return new;
end;
$$;

create trigger erisk_entries_emit_registered
  after insert on erisk.entries
  for each row execute function erisk.on_entry_registered();

create or replace function erisk.on_entry_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    v_type := case new.status
                when 'mitigated' then 'erisk.entry.mitigated'
                when 'open'      then 'erisk.entry.reopened'
                when 'closed'    then 'erisk.entry.closed'
                else null
              end;
    if v_type is not null then
      perform erisk.emit_event(new.tenant_id, v_type, erisk.entry_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger erisk_entries_emit_changed
  after update of status on erisk.entries
  for each row execute function erisk.on_entry_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema erisk                  from public, anon, authenticated;
revoke all on all tables    in schema erisk from public, anon, authenticated;
revoke all on all functions in schema erisk from public, anon, authenticated;

grant usage on schema erisk to authenticated;

grant select, insert, update on erisk.entries to authenticated;

grant execute on function erisk.can_access(uuid) to authenticated;

-- `erisk.emit_event` e `erisk.entry_payload` NÃO são concedidas. `anon` nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum project_id (o DIVERGE do risk). Nenhum enum de
-- categoria. Nenhuma coluna de severidade (é leitura). Nenhum objeto fora de
-- `erisk`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
