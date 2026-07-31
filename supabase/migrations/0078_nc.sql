-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0078_nc.sql
-- Módulo 63: Não Conformidades. Schema `nc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §27, o
-- PRIMEIRO módulo da Onda Quatorze (Fase 2). ⭐ ABRE o Domain 🧪 Qualidade,
-- território novo do mapa. Nasce sob `domain_key='quality'`.
--
-- Taxonomia: Domain 🧪 Qualidade — capacidade *Não conformidades* (§5).
-- Spec: docs/canon/MODULO-NC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA — a identidade do `occ` (Módulo 16), re-perguntada, e o DIVERGE
-- -----------------------------------------------------------------------------
-- Uma não conformidade é um FATO CONSTATADO: um desvio que foi observado numa
-- auditoria, numa reclamação de cliente, numa inspeção. Como a ocorrência do
-- `occ`, **O REGISTRO NASCE IMUTÁVEL** — reescrever o desvio depois de anotado
-- é reescrever a apuração, e é o que a Qualidade não pode permitir. O cliente
-- não tem NENHUMA porta de UPDATE; o fechamento entra pela FUNÇÃO (§4), e o
-- gatilho recusa a reescrita até para o dono do banco.
--
-- ⭐⭐ O DIVERGE do `occ`, ASSINADO — e é o que faz este módulo NÃO ser o `occ`
-- de novo (copiar sem pensar e divergir sem escrever são o mesmo erro):
--   • o `occ` encerra com um DESFECHO livre — o que aconteceu;
--   • a NC fecha com uma **NOTA DE VERIFICAÇÃO** — QUEM CONFERIU que a causa foi
--     corrigida. A Qualidade não fecha uma NC porque "resolveu"; fecha porque
--     ALGUÉM VERIFICOU que a correção pegou. Sem a nota de verificação, fechar é
--     arquivar sem conferir — e é justamente o pecado que a norma persegue.
--
-- ⭐ `open → closed` (terminal — a física do `occ`): o desvio foi constatado UMA
-- vez; reabrir é NC NOVA, referenciando a antiga por ID SOLTO (`previous_entry_id`)
-- se quiser rastrear recorrência. Não há "reabrir" — recorrência é registro novo.
--
-- ANTI-VIÉS: origem TEXTO LIVRE (auditoria interna, reclamação, inspeção — nunca
-- enum: a fonte de um laboratório não é a de uma construtora), descrição TEXTO
-- LIVRE obrigatória, causa raiz TEXTO LIVRE opcional. Vínculo OPCIONAL a uma ação
-- corretiva do `capa` (Módulo 65) por ID SOLTO — a NC pode existir sem CAPA ainda
-- aberta, e a CAPA que nasce depois aponta de volta pelo id solto dela.
-- ❌ NÃO ENTRA: anexo de evidência (Storage & Arquivos é do Core, NÃO CONSTRUÍDA),
-- 5-porquês/Ishikawa estruturado (é método — vira configuração do tenant), plano
-- de ação estruturado (é o `capa`), Indicadores de qualidade (é o `goal` — meta
-- com categoria "qualidade", já publicado; NÃO se duplica), Documentos/Procedimentos
-- (é o `pol` — documento versionado com ciência, já publicado; NÃO se duplica).
-- `consumes` VAZIO.
-- =============================================================================

create schema if not exists nc;

comment on schema nc is
  'Módulo Não Conformidades. Domain quality da Taxonomia. O registro do desvio constatado nasce imutável (a física do occ); o fechamento exige a NOTA DE VERIFICAÇÃO — quem conferiu que a causa foi corrigida (o DIVERGE do occ). open → closed terminal; recorrência é NC nova por id solto. Vínculo ao capa por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — sexagésima terceira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function nc.emit_event(
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
  if p_event_type not like 'nc.%' then
    raise exception 'nc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'nc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function nc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function nc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'nc.entry.register')
      or core.has_permission(p_tenant_id, 'nc.entry.close');
$$;

create or replace function nc.touch_updated_at()
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
-- 2. ENTRIES — ⭐ O LIVRO DA NÃO CONFORMIDADE (registro imutável)
-- -----------------------------------------------------------------------------
-- O REGISTRO nasce imutável. O cliente não tem porta de UPDATE (nem policy, nem
-- grant); o fechamento entra pela FUNÇÃO (§4), e o gatilho recusa a reescrita do
-- relato até para o dono do banco — só o ATO de fechar passa.
-- =============================================================================

create table nc.entries (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Origem TEXTO LIVRE: "auditoria interna", "reclamação de cliente",
  -- "inspeção de recebimento". Congelar num enum envelheceria o produto.
  origin            text        not null check (length(btrim(origin)) > 0),
  description       text        not null check (length(btrim(description)) > 0),
  -- Causa raiz TEXTO LIVRE, OPCIONAL: pode já ser conhecida no registro, ou não.
  root_cause        text,
  -- ⭐ Vínculo OPCIONAL ao capa (Módulo 65) por ID SOLTO — sem FK cross-schema.
  -- A NC pode existir sem CAPA; a CAPA que nasce depois aponta de volta pelo id
  -- solto dela (capa.actions.nc_entry_id).
  capa_action_id    uuid,
  -- ⭐ Recorrência: a NC que reabre é NOVA, e aponta a antiga por ID SOLTO.
  previous_entry_id uuid,
  -- Quando o desvio foi CONSTATADO. Aceita passado; recusa futuro (fato consumado).
  detected_at       timestamptz not null default now(),
  status            text        not null default 'open'
                    check (status in ('open', 'closed')),
  -- ⭐⭐ O DIVERGE do occ: o ATO de fechar carimba quem/quando E a NOTA DE
  -- VERIFICAÇÃO — quem conferiu que a causa foi corrigida.
  closed_at         timestamptz,
  closed_by         uuid        references auth.users (id) on delete set null,
  verification_note text        not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint nc_entries_id_tenant unique (id, tenant_id),
  constraint nc_entries_root_cause_not_blank check (
    root_cause is null or length(btrim(root_cause)) > 0
  ),
  constraint nc_entries_not_future check (detected_at <= now()),
  -- ⭐⭐ Fechada tem carimbo E nota de verificação; aberta não tem nenhum dos dois.
  constraint nc_entries_closure_coherent check (
    (status = 'closed' and closed_at is not null and length(btrim(verification_note)) > 0)
    or (status = 'open' and closed_at is null)
  )
);

create index nc_entries_book_idx
  on nc.entries (tenant_id, status, detected_at desc);

create trigger nc_entries_touch
  before update on nc.entries
  for each row execute function nc.touch_updated_at();

-- O autor carimbado pelo servidor no nascimento.
create or replace function nc.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'a não conformidade nasce aberta — fechar é ato à parte, com verificação'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger nc_entries_stamp
  before insert on nc.entries
  for each row execute function nc.guard_entry_insert();

alter table nc.entries enable row level security;
alter table nc.entries force row level security;

create policy nc_entries_select on nc.entries
  for select to authenticated
  using (nc.can_access(tenant_id));

create policy nc_entries_insert on nc.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'nc.entry.register'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o cliente não reescreve o
-- desvio constatado. O fechamento entra pela função (§4).

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/non-conformities
-- -----------------------------------------------------------------------------

create or replace function nc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open', 'closed')
  );
$$;

comment on function nc.allowed_transition(text, text) is
  'Ciclo de vida da NC: UM par. Espelho de ALLOWED_TRANSITIONS em @alsham/non-conformities. closed é TERMINAL — o desvio foi constatado uma vez; recorrência é NC nova por id solto.';

-- O gatilho que faz a física valer ATÉ PARA O DONO DO BANCO: só o ATO de fechar
-- passa (status open → closed com carimbo + nota). A reescrita do relato é
-- recusada — recorrência é registro NOVO.
create or replace function nc.guard_registro_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'NC fechada é história: nada nela se edita — nem a nota de verificação.'
      using errcode = '42501';
  end if;

  if new.origin            is distinct from old.origin
     or new.description       is distinct from old.description
     or new.root_cause        is distinct from old.root_cause
     or new.capa_action_id    is distinct from old.capa_action_id
     or new.previous_entry_id is distinct from old.previous_entry_id
     or new.detected_at       is distinct from old.detected_at
     or new.created_by        is distinct from old.created_by then
    raise exception 'o registro de uma não conformidade é fato constatado: não se reescreve. Recorrência é NC nova.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not nc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: NC fechada é terminal — recorrência é NC nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger nc_entries_immutable
  before update on nc.entries
  for each row execute function nc.guard_registro_immutable();

create or replace function nc.guard_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'não conformidade não se apaga: o livro da apuração é eterno.'
    using errcode = '42501';
end;
$$;

create trigger nc_entries_no_delete
  before delete on nc.entries
  for each row execute function nc.guard_no_delete();

-- =============================================================================
-- 3. PAYLOAD
-- =============================================================================

create or replace function nc.entry_payload(p nc.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',          p.id,
    'origin',           p.origin,
    'description',      p.description,
    'rootCause',        p.root_cause,
    'capaActionId',     p.capa_action_id,
    'previousEntryId',  p.previous_entry_id,
    'detectedAt',       p.detected_at,
    'status',           p.status,
    'closedAt',         p.closed_at,
    'verificationNote', p.verification_note
  );
$$;

comment on function nc.entry_payload(nc.entries) is
  'O envelope de uma NC — AUTOSSUFICIENTE. Quem escuta não faz join.';

-- =============================================================================
-- 4. O FECHAMENTO — o ato, pela função. ⭐⭐ EXIGE a nota de verificação.
-- =============================================================================

create or replace function nc.close_entry(
  p_entry_id          uuid,
  p_verification_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry nc.entries;
begin
  -- SECURITY DEFINER confere o vínculo POR DENTRO: o tenant vem da NC.
  select * into v_entry from nc.entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'não conformidade não encontrada' using errcode = 'P0002';
  end if;

  if not nc.can_access(v_entry.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_entry.tenant_id, 'nc.entry.close') then
    raise exception 'fechar a não conformidade exige a permissão nc.entry.close'
      using errcode = '42501';
  end if;

  if v_entry.status <> 'open' then
    raise exception 'a não conformidade já está fechada' using errcode = '22023';
  end if;

  -- ⭐⭐ O DIVERGE do occ: sem a NOTA DE VERIFICAÇÃO, não fecha. Fechar sem
  -- verificar é arquivar sem conferir.
  if p_verification_note is null or length(btrim(p_verification_note)) = 0 then
    raise exception 'fechar exige a nota de verificação: quem conferiu que a causa foi corrigida'
      using errcode = '22023';
  end if;

  update nc.entries
     set status            = 'closed',
         closed_at         = now(),
         closed_by         = (select auth.uid()),
         verification_note = btrim(p_verification_note)
   where id = v_entry.id;
end;
$$;

comment on function nc.close_entry(uuid, text) is
  'Fecha a NC: ato carimbado com a NOTA DE VERIFICAÇÃO, obrigatória (o DIVERGE do occ). Terminal — recorrência é NC nova.';

-- =============================================================================
-- 5. OS FATOS
-- =============================================================================

create or replace function nc.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nc.emit_event(new.tenant_id, 'nc.entry.registered', nc.entry_payload(new));
  return new;
end;
$$;

create trigger nc_entries_emit_registered
  after insert on nc.entries
  for each row execute function nc.on_entry_registered();

create or replace function nc.on_entry_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    perform nc.emit_event(new.tenant_id, 'nc.entry.closed', nc.entry_payload(new));
  end if;
  return new;
end;
$$;

create trigger nc_entries_emit_closed
  after update on nc.entries
  for each row execute function nc.on_entry_closed();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema nc                  from public, anon, authenticated;
revoke all on all tables    in schema nc from public, anon, authenticated;
revoke all on all functions in schema nc from public, anon, authenticated;

grant usage on schema nc to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro: reescrever não existe; fechar é a função.
grant select, insert on nc.entries to authenticated;

grant execute on function nc.can_access(uuid)          to authenticated;
grant execute on function nc.close_entry(uuid, text)   to authenticated;

-- `nc.emit_event` NÃO é concedida. `nc.entry_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. ⭐ ABRE o Domain Qualidade. Nenhum INSERT. Nenhum enum de origem. Nenhum
-- anexo. Nenhum objeto fora de `nc`. Nenhuma leitura de schema alheio (o vínculo
-- ao capa é id solto). `consumes` VAZIO.
-- =============================================================================
