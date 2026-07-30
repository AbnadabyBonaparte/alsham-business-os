-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0034_chk.sql
-- Módulo 19: Checklists. Schema `chk`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §18,
-- depois do `0033_pat.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Checklist*.
-- Spec: docs/canon/MODULO-CHK-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ EXECUTAR CONGELA O MODELO — e o COMO está escrito: CÓPIA, pelo gatilho
-- -----------------------------------------------------------------------------
-- O modelo é DESENHO DO TENANT (a Lei das Etapas na inspeção): nome livre,
-- itens ordenados, edita-se à vontade. Mas a EXECUÇÃO é a jurisprudência do
-- quote re-perguntada: o documento congela no ENVIO; a inspeção congela na
-- ABERTURA — o que o inspetor tinha na prancheta é o que ele respondeu, e
-- editar o modelo depois NÃO pode reescrever inspeções passadas. O congelo
-- é por CÓPIA: no ato de abrir a execução, o gatilho carimba o nome do
-- modelo e copia os itens ATIVOS para `chk.run_items` — sem FK para o item
-- de origem, para que o redesenho do modelo (até apagar itens do desenho)
-- nunca alcance a história. Há cenário de teste que edita o modelo depois
-- da abertura e confere que a execução não mudou.
--
-- -----------------------------------------------------------------------------
-- ⭐ A RESPOSTA DADA NÃO SE RASURA — a física do occ, item a item
-- -----------------------------------------------------------------------------
-- Responder um item é ATO: ok / não-ok / não-se-aplica + nota, carimbado
-- quem/quando pelo SERVIDOR, uma vez só. O que o inspetor viu no momento é
-- fato consumado — rasurar resposta é rasurar inspeção. Errou? Abandona a
-- execução COM RAZÃO e executa de novo: a inspeção refeita é outra
-- inspeção, e as duas ficam no livro.
--
-- ⭐ `ok`/`not_ok`/`not_applicable` PODE SER CHECK — física da inspeção,
-- não vocabulário de casa (o precedente do mnt): toda inspeção do mundo
-- responde "conforme", "não conforme" ou "não se aplica" — a escola, o
-- laboratório e a frota usam os três com o mesmo sentido, e não há quarto
-- caso. Quem discordar refuta AQUI, por escrito.
--
-- -----------------------------------------------------------------------------
-- ⭐ CONCLUIR EXIGE TUDO RESPONDIDO — checklist pela metade é decoração
-- -----------------------------------------------------------------------------
-- `in_progress → completed` só passa com ZERO itens sem resposta (o
-- gatilho conta). `in_progress → abandoned` exige a razão escrita. Os dois
-- fins são TERMINAIS: a execução é DOCUMENTO de inspeção (o argumento do
-- quote) — quem volta amanhã abre execução nova.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA modelo com itens TEXTO LIVRE e posição — a ronda do shopping,
--      o checklist de van escolar e a abertura de loja moram na mesma
--      tabela, sem uma linha diferente.
--   ✅ ENTRA `subject` TEXTO LIVRE na execução ("loja 3", "van 12") — o
--      alvo da inspeção é vocabulário de casa.
--   ❌ NÃO ENTRA agendamento automático de ronda (cron é futuro declarado —
--      sem relógio fingido: quem abre a execução é gente), foto/anexo de
--      evidência (Storage & Arquivos é capacidade do Core, NÃO CONSTRUÍDA —
--      o padrão do ops), assinatura digital (capacidade do Core), pontuação/
--      score de inspeção (régua de auditoria é do Domain Qualidade).
-- =============================================================================

create schema if not exists chk;

comment on schema chk is
  'Módulo Checklists. Domain operations da Taxonomia. O tenant desenha modelos; executar CONGELA o modelo por cópia (gatilho); cada resposta é ato imutável carimbado; concluir exige tudo respondido. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima nona vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function chk.emit_event(
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
  if p_event_type not like 'chk.%' then
    raise exception 'chk.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'chk',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function chk.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function chk.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'chk.run.execute')
      or core.has_permission(p_tenant_id, 'chk.setup.manage');
$$;

create or replace function chk.touch_updated_at()
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
-- 2. TEMPLATES — o desenho do tenant (edita-se à vontade; a história, nunca)
-- =============================================================================

create table chk.templates (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint chk_templates_id_tenant unique (id, tenant_id)
);

create trigger chk_templates_touch
  before update on chk.templates
  for each row execute function chk.touch_updated_at();

alter table chk.templates enable row level security;
alter table chk.templates force row level security;

create policy chk_templates_select on chk.templates
  for select to authenticated using (chk.can_access(tenant_id));
create policy chk_templates_insert on chk.templates
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'chk.setup.manage'));
create policy chk_templates_update on chk.templates
  for update to authenticated
  using (core.has_permission(tenant_id, 'chk.setup.manage'))
  with check (core.has_permission(tenant_id, 'chk.setup.manage'));

-- ⛔ Sem DELETE: modelo com execuções é história; arquivar é status.

create table chk.template_items (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  template_id uuid        not null,
  position    integer     not null check (position >= 0),
  item_text   text        not null check (length(btrim(item_text)) > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_template_items_id_tenant unique (id, tenant_id),
  constraint chk_template_items_template_fk
    foreign key (template_id, tenant_id)
    references chk.templates (id, tenant_id) on delete restrict,
  constraint chk_template_items_position_unique unique (template_id, position)
    deferrable initially deferred
);

create trigger chk_template_items_touch
  before update on chk.template_items
  for each row execute function chk.touch_updated_at();

alter table chk.template_items enable row level security;
alter table chk.template_items force row level security;

create policy chk_template_items_select on chk.template_items
  for select to authenticated using (chk.can_access(tenant_id));
create policy chk_template_items_insert on chk.template_items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'chk.setup.manage'));
create policy chk_template_items_update on chk.template_items
  for update to authenticated
  using (core.has_permission(tenant_id, 'chk.setup.manage'))
  with check (core.has_permission(tenant_id, 'chk.setup.manage'));

-- =============================================================================
-- 3. RUNS — a execução: o modelo congelado daquele momento
-- =============================================================================

create table chk.runs (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  template_id    uuid        not null,
  -- ⭐ O nome do modelo CARIMBADO na abertura — sobrevive ao redesenho.
  template_name  text        not null default '',
  -- O alvo da inspeção, em texto livre: "loja 3", "van 12", "cozinha".
  subject        text        not null default '',
  status         text        not null default 'in_progress'
                 check (status in ('in_progress', 'completed', 'abandoned')),
  started_at     timestamptz not null default now(),
  started_by     uuid        references auth.users (id) on delete set null,
  -- O ATO da conclusão: quem e quando — do servidor. Terminal.
  completed_at   timestamptz,
  completed_by   uuid        references auth.users (id) on delete set null,
  abandon_reason text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_runs_id_tenant unique (id, tenant_id),
  constraint chk_runs_template_fk
    foreign key (template_id, tenant_id)
    references chk.templates (id, tenant_id) on delete restrict,
  -- Concluída tem carimbo; abandonada tem razão; viva não tem nenhum.
  constraint chk_runs_end_coherent check (
    (status = 'completed' and completed_at is not null and abandon_reason = '')
    or (status = 'abandoned' and completed_at is null
        and length(btrim(abandon_reason)) > 0)
    or (status = 'in_progress' and completed_at is null and abandon_reason = '')
  )
);

create index chk_runs_book_idx
  on chk.runs (tenant_id, status, started_at desc);

create trigger chk_runs_touch
  before update on chk.runs
  for each row execute function chk.touch_updated_at();

alter table chk.runs enable row level security;
alter table chk.runs force row level security;

create policy chk_runs_select on chk.runs
  for select to authenticated
  using (chk.can_access(tenant_id));

create policy chk_runs_insert on chk.runs
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'chk.run.execute'));

create policy chk_runs_update on chk.runs
  for update to authenticated
  using (core.has_permission(tenant_id, 'chk.run.execute'))
  with check (core.has_permission(tenant_id, 'chk.run.execute'));

-- ⛔ Sem policy / grant de DELETE. Inspeção feita é história.

-- =============================================================================
-- 4. RUN_ITEMS — a prancheta congelada; cada resposta é ato
-- -----------------------------------------------------------------------------
-- ⚠️ O cliente NÃO insere aqui: quem escreve a prancheta é o gatilho da
-- abertura. O cliente só RESPONDE (update guardado: uma vez, carimbado).
-- =============================================================================

create table chk.run_items (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  run_id      uuid        not null,
  position    integer     not null check (position >= 0),
  -- ⭐ O texto do item CARIMBADO na cópia — sem FK para o item de origem.
  item_text   text        not null check (length(btrim(item_text)) > 0),
  -- ⭐ Física da inspeção (ver cabeçalho): conforme, não conforme, não se
  -- aplica. NULL = ainda sem resposta.
  answer      text        check (answer is null
                                 or answer in ('ok', 'not_ok', 'not_applicable')),
  note        text        not null default '',
  answered_at timestamptz,
  answered_by uuid        references auth.users (id) on delete set null,
  constraint chk_run_items_id_tenant unique (id, tenant_id),
  constraint chk_run_items_run_fk
    foreign key (run_id, tenant_id)
    references chk.runs (id, tenant_id) on delete restrict,
  -- Resposta e carimbo andam juntos.
  constraint chk_run_items_answer_coherent check (
    (answer is null and answered_at is null)
    or (answer is not null and answered_at is not null)
  )
);

create index chk_run_items_idx
  on chk.run_items (tenant_id, run_id, position);

alter table chk.run_items enable row level security;
alter table chk.run_items force row level security;

create policy chk_run_items_select on chk.run_items
  for select to authenticated
  using (chk.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve a prancheta é o gatilho da abertura.

create policy chk_run_items_update on chk.run_items
  for update to authenticated
  using (core.has_permission(tenant_id, 'chk.run.execute'))
  with check (core.has_permission(tenant_id, 'chk.run.execute'));

-- -----------------------------------------------------------------------------
-- 4.1 ⭐ O CONGELO — a cópia no ato da abertura, pelo gatilho
-- -----------------------------------------------------------------------------

create or replace function chk.snapshot_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text;
  v_count integer;
begin
  select name into v_name
    from chk.templates
   where id = new.template_id and tenant_id = new.tenant_id
     and status = 'active';

  if v_name is null then
    raise exception 'o modelo não existe neste tenant, ou está arquivado'
      using errcode = '22023';
  end if;

  new.template_name := v_name;
  new.started_at    := now();
  new.started_by    := (select auth.uid());

  select count(*) into v_count
    from chk.template_items
   where template_id = new.template_id and tenant_id = new.tenant_id
     and status = 'active';

  if v_count = 0 then
    raise exception 'o modelo não tem itens ativos: prancheta vazia não é inspeção'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger chk_runs_snapshot
  before insert on chk.runs
  for each row execute function chk.snapshot_template();

create or replace function chk.copy_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⭐ A CÓPIA: o item vive na execução por valor, nunca por referência.
  insert into chk.run_items (tenant_id, run_id, position, item_text)
  select new.tenant_id, new.id, ti.position, ti.item_text
    from chk.template_items ti
   where ti.template_id = new.template_id and ti.tenant_id = new.tenant_id
     and ti.status = 'active';

  perform chk.emit_event(new.tenant_id, 'chk.run.started', chk.run_payload(new));
  return new;
end;
$$;

-- (o gatilho fica adiante, depois de chk.run_payload existir)

-- -----------------------------------------------------------------------------
-- 4.2 ⭐ A RESPOSTA — uma vez, carimbada, com a execução viva
-- -----------------------------------------------------------------------------

create or replace function chk.guard_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_status text;
begin
  -- A prancheta congelada não muda de texto nem de lugar.
  if new.item_text is distinct from old.item_text
     or new.position is distinct from old.position
     or new.run_id is distinct from old.run_id then
    raise exception 'a prancheta é congelada na abertura: item não se reescreve'
      using errcode = '22023';
  end if;

  if old.answer is not null then
    raise exception 'resposta dada não se rasura: corrigir é abandonar a execução com razão e executar de novo'
      using errcode = '22023';
  end if;

  if new.answer is null then
    return new;   -- só nota, sem resposta — inofensivo.
  end if;

  select status into v_run_status
    from chk.runs
   where id = new.run_id and tenant_id = new.tenant_id;

  if v_run_status <> 'in_progress' then
    raise exception 'a execução já terminou: quem volta amanhã abre execução nova'
      using errcode = '22023';
  end if;

  new.answered_at := now();
  new.answered_by := (select auth.uid());

  return new;
end;
$$;

create trigger chk_run_items_guard_answer
  before update on chk.run_items
  for each row execute function chk.guard_answer();

create or replace function chk.guard_run_items_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a prancheta é registro de fato consumado: não se apaga.'
    using errcode = '42501';
end;
$$;

create trigger chk_run_items_immutable
  before delete on chk.run_items
  for each row execute function chk.guard_run_items_delete();

-- -----------------------------------------------------------------------------
-- 4.3 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/checklists
-- -----------------------------------------------------------------------------

create or replace function chk.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('in_progress', 'completed'),
    ('in_progress', 'abandoned')
  );
$$;

comment on function chk.allowed_transition(text, text) is
  'Ciclo de vida da execução. Espelho de ALLOWED_TRANSITIONS em @alsham/checklists. DOIS pares, ambos terminais: a execução é DOCUMENTO de inspeção (o argumento do quote) — quem volta amanhã abre execução nova.';

create or replace function chk.guard_run_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendentes integer;
begin
  if new.status = old.status then
    -- Execução terminada congela o conteúdo.
    if old.status <> 'in_progress'
       and (new.subject is distinct from old.subject
            or new.template_name is distinct from old.template_name
            or new.abandon_reason is distinct from old.abandon_reason) then
      raise exception 'execução terminada não se edita: a inspeção refeita é outra inspeção'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not chk.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o fim da execução é terminal — quem volta abre execução nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'completed' then
    select count(*) into v_pendentes
      from chk.run_items
     where run_id = new.id and tenant_id = new.tenant_id
       and answer is null;

    if v_pendentes > 0 then
      raise exception 'faltam % item(ns) sem resposta: checklist pela metade é decoração', v_pendentes
        using errcode = '22023';
    end if;

    new.completed_at := now();
    new.completed_by := (select auth.uid());
  end if;

  if new.status = 'abandoned' and length(btrim(new.abandon_reason)) = 0 then
    raise exception 'abandonar exige a razão escrita: a inspeção interrompida também é história'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger chk_runs_guard_status
  before update on chk.runs
  for each row execute function chk.guard_run_transition();

-- =============================================================================
-- 5. OS FATOS — payload autossuficiente (modelo pelo NOME, contagens dentro)
-- =============================================================================

create or replace function chk.run_payload(p chk.runs)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total  integer;
  v_ok     integer;
  v_not_ok integer;
  v_na     integer;
begin
  select count(*),
         count(*) filter (where answer = 'ok'),
         count(*) filter (where answer = 'not_ok'),
         count(*) filter (where answer = 'not_applicable')
    into v_total, v_ok, v_not_ok, v_na
    from chk.run_items
   where run_id = p.id and tenant_id = p.tenant_id;

  return jsonb_build_object(
    'runId',         p.id,
    'templateId',    p.template_id,
    'templateName',  p.template_name,
    'subject',       p.subject,
    'status',        p.status,
    'startedAt',     p.started_at,
    'completedAt',   p.completed_at,
    'abandonReason', p.abandon_reason,
    'itemCount',     v_total,
    'okCount',       v_ok,
    'notOkCount',    v_not_ok,
    'naCount',       v_na
  );
end;
$$;

comment on function chk.run_payload(chk.runs) is
  'O envelope de uma execução — AUTOSSUFICIENTE, com o modelo pelo NOME carimbado e as contagens dentro. Quem escuta não faz join.';

create trigger chk_runs_emit_started
  after insert on chk.runs
  for each row execute function chk.copy_items();

create or replace function chk.on_run_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform chk.emit_event(
      new.tenant_id,
      case when new.status = 'completed' then 'chk.run.completed'
           else 'chk.run.abandoned' end,
      chk.run_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger chk_runs_emit_changed
  after update on chk.runs
  for each row execute function chk.on_run_changed();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema chk                  from public, anon, authenticated;
revoke all on all tables    in schema chk from public, anon, authenticated;
revoke all on all functions in schema chk from public, anon, authenticated;

grant usage on schema chk to authenticated;

grant select, insert, update on chk.templates      to authenticated;
grant select, insert, update on chk.template_items to authenticated;
grant select, insert, update on chk.runs           to authenticated;

-- ⭐ SÓ SELECT+UPDATE: a prancheta é escrita pelo gatilho; o cliente responde.
grant select, update on chk.run_items to authenticated;

grant execute on function chk.can_access(uuid) to authenticated;

-- `chk.emit_event` NÃO é concedida. `chk.run_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum cron de ronda. Nenhuma foto. Nenhum score.
-- Nenhum objeto fora de `chk`. Nenhuma leitura de schema alheio.
-- =============================================================================
