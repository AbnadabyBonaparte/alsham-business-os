-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0031_occ.sql
-- Módulo 16: Ocorrências. Schema `occ`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §17,
-- depois do `0030_care.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Ocorrências*.
-- Spec: docs/canon/MODULO-OCC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA DESTE MÓDULO — e por que ela DIVERGE do `care` DE PROPÓSITO
-- -----------------------------------------------------------------------------
-- O ticket do `care` é um PEDIDO que se resolve: editável enquanto vivo,
-- reabre do resolvido — porque o pedido é conversa em andamento.
--
-- A ocorrência é um FATO CONSUMADO que se registra e se trata: o vazamento
-- aconteceu, a queda aconteceu, o alarme disparou. **O REGISTRO NASCE
-- IMUTÁVEL** — editar o relato de um fato depois de registrado é reescrever
-- a história, e é exatamente o que uma apuração não pode permitir. Errou o
-- relato? A TRATATIVA registra a correção, em linha nova e eterna.
--
-- Dois módulos, duas físicas — e há teste de pacote que EXIGE o contraste
-- entre as duas migrations: quem "uniformizar" qualquer lado reprova.
--
-- ⭐ O ENCERRAMENTO É ATO E É TERMINAL: quem, quando e o DESFECHO ESCRITO
-- (obrigatório — encerrar sem desfecho é arquivar sem apurar). O fato
-- aconteceu UMA vez; o que acontecer de novo é ocorrência NOVA, com
-- referência à antiga na tratativa.
--
-- ⭐ A GRAVIDADE É DADO DO TENANT, com POSIÇÃO (0 = mais grave): "leve/
-- grave/gravíssima" é vocabulário de uma casa; a régua de gravidade de um
-- canteiro de obras não é a de uma escola.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `location` TEXTO LIVRE ("doca 3", "corredor B", "estacionamento").
--   ✅ ENTRA `involved` TEXTO LIVRE — nomes, placas, crachás, nas palavras
--      de quem registrou. Estruturar envolvidos é congelar o formulário de
--      um setor.
--   ✅ ENTRA `occurred_at` no PASSADO (o registro chega depois do fato) —
--      e NUNCA no futuro: fato consumado não mora no futuro.
--   ❌ NÃO ENTRA boletim para autoridade (documento/integração própria),
--      câmera/evidência anexa (*Storage & Arquivos* é do Core, NÃO
--      CONSTRUÍDA — a mesma ausência declarada do ops), plano de ação
--      estruturado (CAPA é do Domain 🧪 Qualidade), sinistro/seguro
--      (capacidade própria).
-- =============================================================================

create schema if not exists occ;

comment on schema occ is
  'Módulo Ocorrências. Domain operations da Taxonomia. O registro do fato consumado nasce imutável; a tratativa é cadeia de atos; o encerramento é ato terminal com desfecho. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function occ.emit_event(
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
  if p_event_type not like 'occ.%' then
    raise exception 'occ.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'occ',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function occ.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function occ.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'occ.occurrence.register')
      or core.has_permission(p_tenant_id, 'occ.occurrence.treat')
      or core.has_permission(p_tenant_id, 'occ.occurrence.close')
      or core.has_permission(p_tenant_id, 'occ.setup.manage');
$$;

create or replace function occ.touch_updated_at()
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
-- 2. SEVERITIES — a régua de gravidade que o tenant desenha
-- =============================================================================

create table occ.severities (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  -- ⭐ 0 = mais grave. Ordenar o livro é o ofício da gravidade.
  position   integer     not null check (position >= 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint severities_id_tenant unique (id, tenant_id),
  constraint severities_position_unique unique (tenant_id, position)
    deferrable initially deferred
);

create trigger severities_touch
  before update on occ.severities
  for each row execute function occ.touch_updated_at();

alter table occ.severities enable row level security;
alter table occ.severities force row level security;

create policy severities_select on occ.severities
  for select to authenticated using (occ.can_access(tenant_id));
create policy severities_insert on occ.severities
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'occ.setup.manage'));
create policy severities_update on occ.severities
  for update to authenticated
  using (core.has_permission(tenant_id, 'occ.setup.manage'))
  with check (core.has_permission(tenant_id, 'occ.setup.manage'));

-- ⛔ Sem DELETE: gravidade com livro é história; arquivar é status.

-- =============================================================================
-- 3. OCCURRENCES — ⭐ O LIVRO DO FATO CONSUMADO
-- -----------------------------------------------------------------------------
-- O REGISTRO nasce imutável. O cliente não tem NENHUMA porta de UPDATE
-- (nem policy, nem grant); o encerramento entra pela FUNÇÃO (§5), e até
-- para o dono do banco o gatilho só deixa passar o ATO de encerrar — nunca
-- a reescrita do relato.
-- =============================================================================

create table occ.occurrences (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  title        text        not null check (length(btrim(title)) > 0),
  description  text        not null check (length(btrim(description)) > 0),
  location     text,
  involved     text,
  severity_id  uuid,
  -- Quando o fato ACONTECEU. Aceita passado; recusa futuro: fato consumado
  -- não mora no futuro.
  occurred_at  timestamptz not null default now(),
  status       text        not null default 'open'
               check (status in ('open', 'closed')),
  -- ⭐ O ATO do encerramento: quem, quando e o DESFECHO ESCRITO.
  closed_at    timestamptz,
  closed_by    uuid        references auth.users (id) on delete set null,
  outcome      text        not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint occurrences_id_tenant unique (id, tenant_id),
  constraint occurrences_severity_fk
    foreign key (severity_id, tenant_id)
    references occ.severities (id, tenant_id) on delete restrict,
  constraint occurrences_location_not_blank check (
    location is null or length(btrim(location)) > 0
  ),
  constraint occurrences_involved_not_blank check (
    involved is null or length(btrim(involved)) > 0
  ),
  constraint occurrences_not_future check (occurred_at <= now()),
  -- Encerrada tem carimbo E desfecho; aberta não tem nenhum dos dois.
  constraint occurrences_closure_coherent check (
    (status = 'closed' and closed_at is not null and length(btrim(outcome)) > 0)
    or (status = 'open' and closed_at is null)
  )
);

create index occurrences_book_idx
  on occ.occurrences (tenant_id, status, occurred_at desc);

create trigger occurrences_touch
  before update on occ.occurrences
  for each row execute function occ.touch_updated_at();

alter table occ.occurrences enable row level security;
alter table occ.occurrences force row level security;

create policy occurrences_select on occ.occurrences
  for select to authenticated
  using (occ.can_access(tenant_id));

create policy occurrences_insert on occ.occurrences
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'occ.occurrence.register'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o cliente não reescreve
-- fato consumado. O encerramento entra pela função (§5).

-- -----------------------------------------------------------------------------
-- 3.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/occurrences
-- -----------------------------------------------------------------------------

create or replace function occ.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open', 'closed')
  );
$$;

comment on function occ.allowed_transition(text, text) is
  'Ciclo de vida da ocorrência: UM par. Espelho de ALLOWED_TRANSITIONS em @alsham/occurrences. closed é TERMINAL — o fato aconteceu uma vez; o que acontecer de novo é ocorrência nova.';

-- O gatilho que faz a física valer ATÉ PARA O DONO DO BANCO: só o ATO de
-- encerrar passa (status open → closed com carimbo, sem tocar no relato).
-- Qualquer edição de conteúdo é recusada — a correção vai na TRATATIVA.
create or replace function occ.guard_registro_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Encerrada é história inteira: nem o desfecho se reescreve depois.
  if old.status = 'closed' then
    raise exception 'ocorrência encerrada é história: nada nela se edita — nem o desfecho.'
      using errcode = '42501';
  end if;

  if new.title        is distinct from old.title
     or new.description is distinct from old.description
     or new.location    is distinct from old.location
     or new.involved    is distinct from old.involved
     or new.severity_id is distinct from old.severity_id
     or new.occurred_at is distinct from old.occurred_at
     or new.created_by  is distinct from old.created_by then
    raise exception 'o registro de uma ocorrência é fato consumado: não se reescreve. Corrigir o relato é registrar uma TRATATIVA.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not occ.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: ocorrência encerrada é história — o que acontecer de novo é ocorrência nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger occurrences_immutable
  before update on occ.occurrences
  for each row execute function occ.guard_registro_immutable();

create or replace function occ.guard_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ocorrência não se apaga: o livro do que aconteceu é eterno.'
    using errcode = '42501';
end;
$$;

create trigger occurrences_no_delete
  before delete on occ.occurrences
  for each row execute function occ.guard_no_delete();

-- =============================================================================
-- 4. TREATMENTS — ⭐ A TRATATIVA, CADEIA DE ATOS IMUTÁVEIS (três camadas)
-- =============================================================================

create table occ.treatments (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  occurrence_id uuid        not null,
  action_taken  text        not null check (length(btrim(action_taken)) > 0),
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  actor_user_id uuid        references auth.users (id) on delete set null,
  constraint treatments_occurrence_fk
    foreign key (occurrence_id, tenant_id)
    references occ.occurrences (id, tenant_id)
    on delete restrict
);

create index treatments_chain_idx
  on occ.treatments (tenant_id, occurrence_id, occurred_at);

alter table occ.treatments enable row level security;
alter table occ.treatments force row level security;

create policy treatments_select on occ.treatments
  for select to authenticated
  using (occ.can_access(tenant_id));

create policy treatments_insert on occ.treatments
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'occ.occurrence.treat'));

-- ⛔ Sem policy de UPDATE/DELETE — camada 1.

create or replace function occ.guard_treatment_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a tratativa é registro de fato consumado: não se edita nem se apaga. Registre outra.'
    using errcode = '42501';
end;
$$;

create trigger treatments_immutable
  before update or delete on occ.treatments
  for each row execute function occ.guard_treatment_immutable();

-- Ocorrência encerrada não recebe tratativa: o desfecho já foi escrito.
create or replace function occ.guard_occurrence_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from occ.occurrences
   where id = new.occurrence_id and tenant_id = new.tenant_id;

  if v_status is distinct from 'open' then
    raise exception 'ocorrência encerrada não recebe tratativa: o que acontecer de novo é ocorrência nova'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger treatments_guard_open
  before insert on occ.treatments
  for each row execute function occ.guard_occurrence_open();

-- =============================================================================
-- 5. O ENCERRAMENTO — o ato, pela função
-- =============================================================================

create or replace function occ.occurrence_payload(p occ.occurrences)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_severity text;
begin
  select name into v_severity from occ.severities where id = p.severity_id;

  return jsonb_build_object(
    'occurrenceId', p.id,
    'title',        p.title,
    'description',  p.description,
    'location',     p.location,
    'involved',     p.involved,
    'severityId',   p.severity_id,
    'severityName', v_severity,
    'occurredAt',   p.occurred_at,
    'status',       p.status,
    'closedAt',     p.closed_at,
    'outcome',      p.outcome
  );
end;
$$;

comment on function occ.occurrence_payload(occ.occurrences) is
  'O envelope de uma ocorrência — AUTOSSUFICIENTE, com a gravidade pelo NOME. Quem escuta não faz join.';

create or replace function occ.close_occurrence(
  p_occurrence_id uuid,
  p_outcome       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ occ.occurrences;
begin
  -- SECURITY DEFINER confere o vínculo POR DENTRO: o tenant vem da
  -- OCORRÊNCIA, nunca de parâmetro.
  select * into v_occ from occ.occurrences where id = p_occurrence_id;
  if v_occ.id is null then
    raise exception 'ocorrência não encontrada' using errcode = 'P0002';
  end if;

  if not occ.can_access(v_occ.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_occ.tenant_id, 'occ.occurrence.close') then
    raise exception 'encerrar a ocorrência exige a permissão occ.occurrence.close'
      using errcode = '42501';
  end if;

  if v_occ.status <> 'open' then
    raise exception 'a ocorrência já está encerrada' using errcode = '22023';
  end if;

  if p_outcome is null or length(btrim(p_outcome)) = 0 then
    raise exception 'encerrar exige o desfecho escrito: arquivar sem apurar é apagar com outro nome'
      using errcode = '22023';
  end if;

  update occ.occurrences
     set status = 'closed',
         closed_at = now(),
         closed_by = (select auth.uid()),
         outcome = btrim(p_outcome)
   where id = v_occ.id;
end;
$$;

comment on function occ.close_occurrence(uuid, text) is
  'Encerra a ocorrência: ato carimbado com o DESFECHO escrito, obrigatório. Terminal — o que acontecer de novo é ocorrência nova.';

-- =============================================================================
-- 6. OS FATOS
-- =============================================================================

create or replace function occ.on_occurrence_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform occ.emit_event(new.tenant_id, 'occ.occurrence.registered', occ.occurrence_payload(new));
  return new;
end;
$$;

create trigger occurrences_emit_registered
  after insert on occ.occurrences
  for each row execute function occ.on_occurrence_registered();

create or replace function occ.on_occurrence_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    perform occ.emit_event(new.tenant_id, 'occ.occurrence.closed', occ.occurrence_payload(new));
  end if;
  return new;
end;
$$;

create trigger occurrences_emit_closed
  after update on occ.occurrences
  for each row execute function occ.on_occurrence_closed();

create or replace function occ.on_treatment_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ occ.occurrences;
begin
  select * into v_occ from occ.occurrences where id = new.occurrence_id;

  perform occ.emit_event(
    new.tenant_id,
    'occ.occurrence.treated',
    occ.occurrence_payload(v_occ) || jsonb_build_object(
      'treatmentId', new.id,
      'actionTaken', new.action_taken,
      'occurredAt',  new.occurred_at
    )
  );
  return new;
end;
$$;

create trigger treatments_emit_recorded
  after insert on occ.treatments
  for each row execute function occ.on_treatment_recorded();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema occ                  from public, anon, authenticated;
revoke all on all tables    in schema occ from public, anon, authenticated;
revoke all on all functions in schema occ from public, anon, authenticated;

grant usage on schema occ to authenticated;

grant select, insert, update on occ.severities to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro: reescrever não existe; encerrar é a função.
grant select, insert on occ.occurrences to authenticated;

-- ⛔ SÓ SELECT e INSERT na tratativa — camada 2 da imutabilidade.
grant select, insert on occ.treatments to authenticated;

grant execute on function occ.can_access(uuid)              to authenticated;
grant execute on function occ.close_occurrence(uuid, text)  to authenticated;

-- `occ.emit_event` NÃO é concedida. `occ.occurrence_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de gravidade. Nenhum anexo. Nenhum plano
-- de ação estruturado. Nenhum objeto fora de `occ`. Nenhuma leitura de
-- schema alheio.
-- =============================================================================
