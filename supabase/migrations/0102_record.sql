-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0102_record.sql
-- Módulo — Prontuário. Schema `record`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §34, a Onda Vinte e Um (Fase 3
-- — o Vertical 🏥 Saúde). Nasce sob `vertical_key='health'`.
--
-- Taxonomia: Vertical 🏥 Saúde (§6) — capacidade *Prontuário*.
-- Spec/decisões: docs/canon/ONDA-VINTE-E-UM-DECISOES.md
--
-- ⚠️⚠️ DADO SENSÍVEL DE SAÚDE (LGPD Art. 5º, II). Além do padrão (RLS
-- enable+FORCE, zero grant anon, imutabilidade, carimbo do servidor), este
-- módulo tem uma camada a mais que todo EHR sério tem: TRILHA DE LEITURA.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TRILHA DE LEITURA — o conteúdo só é alcançável por um caminho que LOGA
-- -----------------------------------------------------------------------------
-- A trilha de ESCRITA (core.audit_log) responde "quem MUDOU o quê". Dado de
-- saúde exige "quem CONSULTOU o prontuário de quem, quando" (accountability
-- LGPD; é o que Epic/Cerner fazem). Por isso:
--
--   • `record.entries` NÃO concede SELECT ao cliente. Ler direto a tabela não
--     existe — não há porta.
--   • A ÚNICA porta de leitura é `record.read_patient()`, `security definer`,
--     que ANTES de devolver o conteúdo INSERE uma linha em `record.access_log`
--     (usuário → paciente → quando). Toda leitura vira registro. Não há como
--     ler o prontuário sem deixar rastro — a única forma de nunca vazar quem
--     leu é não ter leitura fora do log.
--   • `record.access_log` é IMUTÁVEL e append-only: ninguém insere à mão (só a
--     função de leitura escreve), ninguém edita, ninguém apaga.
--
-- -----------------------------------------------------------------------------
-- ⭐ A ENTRADA É FATO CONSUMADO (a física do genreading/occ)
-- -----------------------------------------------------------------------------
-- Cada entrada do prontuário é imutável em DUAS camadas: o cliente não tem
-- porta de UPDATE/DELETE, e o gatilho recusa a reescrita até para o dono do
-- banco. Corrigir é lançar OUTRA entrada (uma retificação), nunca reescrever —
-- o prontuário guarda a história, inclusive a do erro.
--
-- ANTI-VIÉS: o tipo da entrada (evolução, anamnese, conduta…) é TEXTO LIVRE —
-- nunca enum. Paciente por id solto ao `patient` (sem FK cruzada — Lei do Lego).
-- =============================================================================

create schema if not exists record;

comment on schema record is
  'Módulo Prontuário. Vertical health (Saúde). ⚠️ DADO SENSÍVEL. Cada entrada é FATO CONSUMADO imutável (a física do genreading), paciente por id solto ao patient. ⭐⭐ TRILHA DE LEITURA: entries não concede SELECT ao cliente; a única porta de leitura é record.read_patient() (security definer), que registra o acesso em record.access_log (imutável, append-only) antes de devolver. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function record.emit_event(
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
  if p_event_type not like 'record.%' then
    raise exception 'record.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;
  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'record',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;
  return v_event_id;
end;
$$;

comment on function record.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function record.can_write(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'record.entry.write');
$$;

create or replace function record.can_read(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'record.entry.read');
$$;

-- =============================================================================
-- 2. ENTRIES — a entrada do prontuário: FATO CONSUMADO, e SEM porta de leitura
-- -----------------------------------------------------------------------------
-- ⚠️ Não há grant de SELECT ao cliente: ler é só por record.read_patient(),
-- que loga. A tabela existe, mas a porta de leitura passa pelo registro.
-- =============================================================================

create table record.entries (
  id           uuid          primary key default gen_random_uuid(),
  tenant_id    uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ Paciente por ID SOLTO ao patient — SEM FK cruzada (Lei do Lego), NOT NULL
  -- (não há prontuário sem paciente). Nome carimbado pela TELA.
  patient_id   uuid          not null,
  patient_name text          not null default '',
  -- ⭐ O tipo da entrada — TEXTO LIVRE (evolução/anamnese/conduta), nunca enum.
  entry_type   text          not null default '',
  -- ⚠️ O conteúdo clínico — DADO SENSÍVEL. Não vazio.
  content      text          not null check (length(btrim(content)) > 0),
  -- ⭐ Os carimbos do FATO — sempre do servidor.
  recorded_at  timestamptz   not null default now(),
  recorded_by  uuid          references auth.users (id) on delete set null,
  created_at   timestamptz   not null default now(),
  constraint record_entries_id_tenant unique (id, tenant_id)
);

create index record_entries_by_patient_idx
  on record.entries (tenant_id, patient_id, recorded_at desc);

alter table record.entries enable row level security;
alter table record.entries force row level security;

-- ⛔ SEM policy de SELECT ao cliente: a leitura é só pela função que loga.
-- (Uma policy de select restritiva existiria à toa sem grant; a ausência de
-- grant é o cadeado.)

create policy record_entries_insert on record.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'record.entry.write'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a entrada é fato consumado.

create or replace function record.guard_entry_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.recorded_at := now();
  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

create trigger record_entries_stamp
  before insert on record.entries
  for each row execute function record.guard_entry_insert();

create or replace function record.guard_entry_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a entrada do prontuário é fato consumado: não se edita nem se apaga. Corrigir é registrar uma retificação.'
    using errcode = '42501';
end;
$$;

create trigger record_entries_immutable
  before update or delete on record.entries
  for each row execute function record.guard_entry_immutable();

-- =============================================================================
-- 3. ⭐⭐ ACCESS_LOG — a trilha de LEITURA: imutável, append-only
-- -----------------------------------------------------------------------------
-- Ninguém insere à mão (sem grant de INSERT): só a função de leitura escreve.
-- Ninguém edita nem apaga. Quem AUDITA (record.access.read) pode ler.
-- =============================================================================

create table record.access_log (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  patient_id  uuid        not null,
  accessed_by uuid        references auth.users (id) on delete set null,
  accessed_at timestamptz not null default now()
);

create index record_access_log_by_patient_idx
  on record.access_log (tenant_id, patient_id, accessed_at desc);

alter table record.access_log enable row level security;
alter table record.access_log force row level security;

-- Só quem tem a permissão de AUDITORIA lê a trilha de acesso (o próprio log é
-- sensível: diz quem olhou o quê).
create policy record_access_log_select on record.access_log
  for select to authenticated
  using (core.has_permission(tenant_id, 'record.access.read'));

-- ⛔ SEM policy/grant de INSERT/UPDATE/DELETE ao cliente: só a função de leitura
-- (security definer) escreve; ninguém edita nem apaga.

create or replace function record.guard_access_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a trilha de acesso é append-only: não se edita nem se apaga.'
    using errcode = '42501';
end;
$$;

create trigger record_access_log_immutable
  before update or delete on record.access_log
  for each row execute function record.guard_access_log_immutable();

-- =============================================================================
-- 4. ⭐⭐ read_patient — a ÚNICA porta de leitura, e ela LOGA antes de devolver
-- =============================================================================

create or replace function record.read_patient(p_tenant_id uuid, p_patient_id uuid)
returns setof record.entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- has_permission cruza a sessão com core.memberships: se o usuário não for
  -- membro do tenant, ou não tiver record.entry.read, isto já barra.
  if not core.has_permission(p_tenant_id, 'record.entry.read') then
    raise exception 'sem permissão para ler o prontuário' using errcode = '42501';
  end if;

  -- ⭐⭐ LOGA O ACESSO antes de devolver — toda leitura vira registro.
  insert into record.access_log (tenant_id, patient_id, accessed_by)
  values (p_tenant_id, p_patient_id, (select auth.uid()));

  return query
    select e.*
      from record.entries e
     where e.tenant_id = p_tenant_id
       and e.patient_id = p_patient_id
     order by e.recorded_at desc;
end;
$$;

comment on function record.read_patient(uuid, uuid) is
  'A ÚNICA porta de leitura do prontuário. Registra o acesso em record.access_log (usuário → paciente → quando) ANTES de devolver o conteúdo. Não há leitura sem log.';

-- =============================================================================
-- 5. OS FATOS — o envelope NÃO carrega o conteúdo clínico (dado sensível)
-- =============================================================================

create or replace function record.entry_payload(p record.entries)
returns jsonb language sql immutable set search_path = '' as $$
  -- ⚠️ Sem `content`: o conteúdo clínico NÃO passeia pelo correio. O fato diz
  -- QUE houve entrada, para QUAL paciente e de que TIPO — nunca o texto.
  select jsonb_build_object(
    'entryId',     p.id,
    'patientId',   p.patient_id,
    'patientName', p.patient_name,
    'entryType',   p.entry_type
  );
$$;

comment on function record.entry_payload(record.entries) is
  'O envelope de uma entrada — AUTOSSUFICIENTE e SEM o conteúdo clínico (dado sensível não passeia). Quem escuta não faz join.';

create or replace function record.on_entry_recorded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform record.emit_event(new.tenant_id, 'record.entry.recorded', record.entry_payload(new));
  return new;
end;
$$;

create trigger record_entries_emit_recorded
  after insert on record.entries
  for each row execute function record.on_entry_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022: o revoke vem DEPOIS de toda função; e função nasce aberta a
-- PUBLIC — por isso o revoke de funções vem aqui, no fim.
-- =============================================================================

revoke all on schema record                  from public, anon, authenticated;
revoke all on all tables    in schema record from public, anon, authenticated;
revoke all on all functions in schema record from public, anon, authenticated;

grant usage on schema record to authenticated;

-- ⛔ entries: SÓ INSERT (escrever a nota). NADA de SELECT — ler é pela função
-- que loga. Nada de update/delete (fato consumado).
grant insert on record.entries to authenticated;
-- access_log: SÓ SELECT (auditar), e a policy exige record.access.read. Nunca
-- INSERT direto (a função de leitura escreve como definer).
grant select on record.access_log to authenticated;

grant execute on function record.can_write(uuid) to authenticated;
grant execute on function record.can_read(uuid) to authenticated;
grant execute on function record.read_patient(uuid, uuid) to authenticated;

-- `record.emit_event`, `record.entry_payload` são encanamento. `anon` nada.

-- =============================================================================
-- FIM. Nenhuma porta de SELECT direto no prontuário (a leitura loga). Trilha de
-- acesso imutável. Entrada imutável (2 camadas). Conteúdo fora do envelope.
-- Tipo texto livre. Paciente por id solto. `consumes` VAZIO.
-- =============================================================================
