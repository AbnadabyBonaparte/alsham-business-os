-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0103_prescription.sql
-- Módulo — Receitas. Schema `prescription`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §34, a Onda Vinte e Um (Fase 3
-- — o Vertical 🏥 Saúde). Nasce sob `vertical_key='health'`.
--
-- Taxonomia: Vertical 🏥 Saúde (§6) — capacidade *Receitas*.
-- Spec/decisões: docs/canon/ONDA-VINTE-E-UM-DECISOES.md · MODULO-PRESCRIPTION-SPEC.md
--
-- ⚠️⚠️ DADO SENSÍVEL DE SAÚDE (LGPD Art. 5º, II). Além do padrão (RLS
-- enable+FORCE, zero grant anon, imutabilidade, carimbo do servidor), este é um
-- dos TRÊS módulos clínicos com a camada a mais: TRILHA DE LEITURA.
--
-- -----------------------------------------------------------------------------
-- ⭐ EMITIR CONGELA — a física do `quote`/`chk`
-- -----------------------------------------------------------------------------
-- A receita nasce RASCUNHO: enquanto `draft`, o prescritor escreve e corrige os
-- itens (medicamento + posologia). EMITIR (`draft → issued`) CONGELA o
-- documento: nenhum item nasce, muda ou some depois; `issued` é TERMINAL. A
-- receita errada não se reescreve — emite-se OUTRA (a física do quote: o
-- documento congela no envio).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TRILHA DE LEITURA — o CONTEÚDO CLÍNICO (os itens) só por porta que LOGA
-- -----------------------------------------------------------------------------
-- O cabeçalho (paciente, prescritor, status, datas) é METADATA de agenda,
-- legível como uma consulta. O que é PHI é a LISTA DE MEDICAMENTOS — e ela é o
-- DIVERGE consciente do record (lá o conteúdo TODO fica atrás da porta; aqui só
-- o clínico): `prescription.items` NÃO concede SELECT ao cliente. A única porta
-- para os itens é `prescription.read_items()` (security definer), que INSERE em
-- `prescription.access_log` (usuário → paciente → receita → quando) ANTES de
-- devolver. Não há como ler a medicação sem deixar rastro.
--
-- ANTI-VIÉS: medicamento e posologia são TEXTO LIVRE. Paciente por ID SOLTO ao
-- patient (sem FK cruzada — Lei do Lego). Prescritor carimbado pelo servidor;
-- registro profissional TEXTO LIVRE.
-- =============================================================================

create schema if not exists prescription;

comment on schema prescription is
  'Módulo Receitas. Vertical health (Saúde). ⚠️ DADO SENSÍVEL. Cabeçalho (paciente id solto, prescritor carimbado, status) + itens (medicamento + posologia TEXTO LIVRE). Emitir CONGELA (draft → issued terminal — a física do quote). ⭐⭐ TRILHA DE LEITURA do CONTEÚDO: items não concede SELECT; a única porta é prescription.read_items() (security definer), que loga em prescription.access_log antes de devolver. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function prescription.emit_event(
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
  if p_event_type not like 'prescription.%' then
    raise exception 'prescription.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'prescription',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function prescription.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function prescription.can_write(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'prescription.prescription.write');
$$;

create or replace function prescription.can_read(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'prescription.prescription.read');
$$;

create or replace function prescription.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. PRESCRIPTIONS — o cabeçalho: METADATA legível, com o ciclo draft → issued
-- =============================================================================

create table prescription.prescriptions (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  patient_id           uuid        not null,
  patient_name         text        not null default '',
  -- Prescritor — carimbado pelo servidor na emissão; registro TEXTO LIVRE.
  prescriber_id        uuid        references auth.users (id) on delete set null,
  prescriber_name      text        not null default '',
  prescriber_registry  text        not null default '',
  notes                text        not null default '',
  status               text        not null default 'draft'
                       check (status in ('draft', 'issued')),
  issued_at            timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid        references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint prescription_prescriptions_id_tenant unique (id, tenant_id)
);

create index prescription_prescriptions_by_patient_idx
  on prescription.prescriptions (tenant_id, patient_id, created_at desc);

create trigger prescription_prescriptions_touch
  before update on prescription.prescriptions
  for each row execute function prescription.touch_updated_at();

alter table prescription.prescriptions enable row level security;
alter table prescription.prescriptions force row level security;

-- O cabeçalho é legível (a lista de receitas — metadata, como a agenda). O
-- CONTEÚDO clínico (os itens) é que fica atrás da porta que loga.
create policy prescription_prescriptions_select on prescription.prescriptions
  for select to authenticated
  using (core.has_permission(tenant_id, 'prescription.prescription.read')
      or core.has_permission(tenant_id, 'prescription.prescription.write'));

create policy prescription_prescriptions_insert on prescription.prescriptions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'prescription.prescription.write'));

create policy prescription_prescriptions_update on prescription.prescriptions
  for update to authenticated
  using (core.has_permission(tenant_id, 'prescription.prescription.write'))
  with check (core.has_permission(tenant_id, 'prescription.prescription.write'));

-- ⛔ Sem DELETE. Receita é documento; rascunho abandonado é história também.

create or replace function prescription.guard_prescription_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'a receita nasce rascunho — emitir é ato à parte' using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  new.issued_at  := null;
  return new;
end;
$$;

create trigger prescription_prescriptions_stamp
  before insert on prescription.prescriptions
  for each row execute function prescription.guard_prescription_insert();

-- Transições: draft → issued (terminal). Emitir CONGELA e carimba o prescritor.
create or replace function prescription.guard_prescription_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then
    -- Sem mudança de status: edição de cabeçalho. Só enquanto RASCUNHO.
    if old.status <> 'draft' then
      raise exception 'receita emitida não se edita: a correta é uma receita NOVA' using errcode = '42501';
    end if;
    return new;
  end if;

  if not (old.status = 'draft' and new.status = 'issued') then
    raise exception 'transição % → % não existe: a receita só vai de rascunho a emitida (terminal)',
      old.status, new.status using errcode = '22023';
  end if;

  -- Emitir exige ao menos um item — receita vazia não é documento.
  if not exists (
    select 1 from prescription.items i
     where i.prescription_id = new.id and i.tenant_id = new.tenant_id
  ) then
    raise exception 'receita sem item não se emite: adicione ao menos um medicamento' using errcode = '22023';
  end if;

  -- Carimbo do prescritor e da emissão — sempre do servidor.
  new.issued_at     := now();
  new.prescriber_id := (select auth.uid());
  return new;
end;
$$;

create trigger prescription_prescriptions_guard_transition
  before update on prescription.prescriptions
  for each row execute function prescription.guard_prescription_transition();

-- =============================================================================
-- 3. ITEMS — o CONTEÚDO CLÍNICO: sem SELECT ao cliente, e congela na emissão
-- -----------------------------------------------------------------------------
-- ⚠️ Não há grant de SELECT: ler os itens é só por prescription.read_items(),
-- que loga. Editar só enquanto o cabeçalho é rascunho.
-- =============================================================================

create table prescription.items (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  prescription_id uuid        not null,
  -- ⭐ Medicamento e posologia — TEXTO LIVRE. Medicamento não vazio.
  medication      text        not null check (length(btrim(medication)) > 0),
  dosage          text        not null default '',
  position        integer     not null default 0,
  created_at      timestamptz not null default now(),
  -- FK INTRA-schema ao cabeçalho (peça do próprio módulo — permitida).
  constraint prescription_items_prescription_fk
    foreign key (prescription_id, tenant_id)
    references prescription.prescriptions (id, tenant_id) on delete cascade
);

create index prescription_items_by_prescription_idx
  on prescription.items (tenant_id, prescription_id, position);

alter table prescription.items enable row level security;
alter table prescription.items force row level security;

-- ⛔ SEM policy de SELECT: a leitura dos itens é só pela função que loga.
create policy prescription_items_insert on prescription.items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'prescription.prescription.write'));

create policy prescription_items_update on prescription.items
  for update to authenticated
  using (core.has_permission(tenant_id, 'prescription.prescription.write'))
  with check (core.has_permission(tenant_id, 'prescription.prescription.write'));

create policy prescription_items_delete on prescription.items
  for delete to authenticated
  using (core.has_permission(tenant_id, 'prescription.prescription.write'));

-- O congelamento: item só nasce/muda/some enquanto o cabeçalho é RASCUNHO.
create or replace function prescription.guard_item_frozen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_pid    uuid;
  v_tenant uuid;
begin
  v_pid    := coalesce(new.prescription_id, old.prescription_id);
  v_tenant := coalesce(new.tenant_id, old.tenant_id);
  select status into v_status
    from prescription.prescriptions
   where id = v_pid and tenant_id = v_tenant;

  if v_status is null then
    return coalesce(new, old);  -- FK cuida da inexistência; nada a congelar
  end if;

  if v_status <> 'draft' then
    raise exception 'a receita foi emitida e está congelada: item não nasce, muda nem some. A correção é uma receita NOVA.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger prescription_items_guard_frozen
  before insert or update or delete on prescription.items
  for each row execute function prescription.guard_item_frozen();

-- =============================================================================
-- 4. ⭐⭐ ACCESS_LOG + read_items — a trilha de LEITURA do conteúdo clínico
-- =============================================================================

create table prescription.access_log (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  patient_id      uuid        not null,
  prescription_id uuid        not null,
  accessed_by     uuid        references auth.users (id) on delete set null,
  accessed_at     timestamptz not null default now()
);

create index prescription_access_log_by_patient_idx
  on prescription.access_log (tenant_id, patient_id, accessed_at desc);

alter table prescription.access_log enable row level security;
alter table prescription.access_log force row level security;

create policy prescription_access_log_select on prescription.access_log
  for select to authenticated
  using (core.has_permission(tenant_id, 'prescription.access.read'));

-- ⛔ SEM INSERT/UPDATE/DELETE ao cliente: só read_items escreve (definer).
create or replace function prescription.guard_access_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a trilha de acesso é append-only: não se edita nem se apaga.' using errcode = '42501';
end;
$$;

create trigger prescription_access_log_immutable
  before update or delete on prescription.access_log
  for each row execute function prescription.guard_access_log_immutable();

create or replace function prescription.read_items(p_tenant_id uuid, p_prescription_id uuid)
returns setof prescription.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
begin
  if not core.has_permission(p_tenant_id, 'prescription.prescription.read') then
    raise exception 'sem permissão para ler a receita' using errcode = '42501';
  end if;

  select patient_id into v_patient
    from prescription.prescriptions
   where id = p_prescription_id and tenant_id = p_tenant_id;

  if v_patient is null then
    raise exception 'receita não encontrada neste tenant' using errcode = 'no_data_found';
  end if;

  -- ⭐⭐ LOGA O ACESSO antes de devolver o conteúdo clínico.
  insert into prescription.access_log (tenant_id, patient_id, prescription_id, accessed_by)
  values (p_tenant_id, v_patient, p_prescription_id, (select auth.uid()));

  return query
    select i.* from prescription.items i
     where i.tenant_id = p_tenant_id and i.prescription_id = p_prescription_id
     order by i.position, i.created_at;
end;
$$;

comment on function prescription.read_items(uuid, uuid) is
  'A ÚNICA porta de leitura dos itens (medicamento + posologia — o conteúdo clínico). Registra o acesso em prescription.access_log ANTES de devolver. Não há leitura do conteúdo sem log.';

-- =============================================================================
-- 5. OS FATOS — o envelope NÃO carrega os medicamentos (dado sensível)
-- =============================================================================

create or replace function prescription.prescription_payload(p prescription.prescriptions)
returns jsonb language sql immutable set search_path = '' as $$
  -- Sem os itens: o fato diz QUE houve receita, para QUAL paciente e o status —
  -- nunca a medicação.
  select jsonb_build_object(
    'prescriptionId', p.id,
    'patientId',      p.patient_id,
    'patientName',    p.patient_name,
    'status',         p.status
  );
$$;

comment on function prescription.prescription_payload(prescription.prescriptions) is
  'O envelope de uma receita — AUTOSSUFICIENTE e SEM os medicamentos (dado sensível não passeia). Quem escuta não faz join.';

create or replace function prescription.on_prescription_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform prescription.emit_event(new.tenant_id, 'prescription.prescription.drafted', prescription.prescription_payload(new));
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'issued' then
    perform prescription.emit_event(new.tenant_id, 'prescription.prescription.issued', prescription.prescription_payload(new));
  end if;

  return new;
end;
$$;

create trigger prescription_prescriptions_emit
  after insert or update on prescription.prescriptions
  for each row execute function prescription.on_prescription_changed();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022: o revoke vem DEPOIS de toda função; função nasce aberta a
-- PUBLIC — revogar de novo antes de conceder.
-- =============================================================================

revoke all on schema prescription                  from public, anon, authenticated;
revoke all on all tables    in schema prescription from public, anon, authenticated;
revoke all on all functions in schema prescription from public, anon, authenticated;

grant usage on schema prescription to authenticated;

-- cabeçalho: leitura (metadata) + escrita do rascunho.
grant select, insert, update on prescription.prescriptions to authenticated;
-- itens: escrita do rascunho; NADA de SELECT (a leitura é pela função que loga).
grant insert, update, delete on prescription.items to authenticated;
-- access_log: só SELECT (auditar), gated por prescription.access.read.
grant select on prescription.access_log to authenticated;

grant execute on function prescription.can_write(uuid) to authenticated;
grant execute on function prescription.can_read(uuid) to authenticated;
grant execute on function prescription.read_items(uuid, uuid) to authenticated;

-- `prescription.emit_event`, `prescription.prescription_payload` são encanamento.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Emitir congela (draft → issued terminal). Itens sem SELECT direto (a
-- leitura loga). Trilha de acesso imutável. Medicamentos fora do envelope. Tipo
-- texto livre. Paciente por id solto. `consumes` VAZIO.
-- =============================================================================
