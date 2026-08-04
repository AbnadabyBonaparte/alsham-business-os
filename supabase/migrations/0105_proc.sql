-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0105_proc.sql
-- Módulo 88: Protocolo / processo administrativo. Schema `proc`.
-- Vertical 🏛 Governo (a porta da frente do Estado). Onda Governo, cartão 1/4.
-- =============================================================================
--
-- NÃO APLICADO. ARQUIVO — aplicar é ato do dono (runbook). Ao aplicar: expor o
-- schema `proc` na Data API. `consumes` VAZIO — sem redeploy do `apps/api`.
--
-- -----------------------------------------------------------------------------
-- DE ONDE ESTE MÓDULO VEM: A LEI DAS ETAPAS DO `ops`, RE-PERGUNTADA
-- -----------------------------------------------------------------------------
-- O `proc` reaproveita a física do Módulo 7 (`ops`, Esteira de Produção) —
-- **workflow desenhado pelo tenant + etapas como DADO DO TENANT + o item que
-- anda pela esteira + a trilha imutável + avançar/pular/devolver**. É o mesmo
-- movimento que o `kanban` fez com o `ops` (reusar a física num escopo
-- próprio); **NÃO é "instalar o `ops` de novo"**, e cada decisão foi
-- re-perguntada e escrita — inclusive as que se mantiveram (CLAUDE.md §5.4:
-- copiar sem pensar e divergir sem escrever são o mesmo erro).
--
-- ⭐ A LEI DAS ETAPAS, MANTIDA AO PÉ DA LETRA:
--   • NÃO existe `create type proc.stage as enum` — nem aqui, nem em nenhum
--     futuro. A etapa é linha de `proc.workflow_stages` com o nome que o órgão
--     escolheu ("protocolado → análise → parecer → decisão"; outro órgão chama
--     de outra coisa). Congelar isso num enum seria o processo de um município
--     virando a obrigação de todos.
--   • A permissão de PASSAR de uma etapa depende do DESENHO (`requires_approval`),
--     nunca do NOME da etapa. O produto não procura a palavra "aprovação".
--   • Pular é ATO REGISTRADO (quem, quando, por quê) na trilha imutável.
--   • A trilha CARIMBA o NOME da etapa e guarda o id solto, sem FK — é o que a
--     faz sobreviver ao redesenho do fluxo (CORE-SPEC §4).
--
-- -----------------------------------------------------------------------------
-- O QUE O `proc` ADICIONA — O DIVERGE, ASSINADO DECISÃO POR DECISÃO
-- -----------------------------------------------------------------------------
-- **1. ⭐ NÚMERO DE PROTOCOLO — a identidade PÚBLICA que o cidadão cita.**
--
-- No `ops`, a decisão foi NÃO ter número de OS: "formato de numeração é
-- convenção de cada casa" e uma sequência no schema escolheria a convenção de
-- um por todos. O `proc` DIVERGE, e o motivo é a razão de o módulo existir: o
-- processo administrativo é a porta da frente do Estado, e o cidadão SAI da
-- repartição com um número na mão para acompanhar. Sem número, não há
-- protocolo.
--
-- Mas o DIVERGE é só sobre a EXISTÊNCIA, nunca sobre o FORMATO: o `proc`
-- **não** cria `create sequence`, **não** impõe máscara. `protocol_number` é
-- TEXTO LIVRE, fornecido pelo tenant (cada órgão tem sua convenção —
-- "2026.0001", "PROT-123/26", "45.678.901/2026-12"), obrigatório e ÚNICO POR
-- TENANT. A casa numera; o produto só garante que dois processos do mesmo
-- órgão nunca compartilham o mesmo número. É a lição do `ops` (não impor
-- formato) mantida, com a existência exigida.
--
-- **2. ⭐ INTERESSADO — o processo público é SEMPRE o pedido de alguém.**
--
-- A OS do `ops` não tem requerente (a maior parte das ordens de manutenção é
-- para a própria empresa). Um processo administrativo é o oposto: existe
-- porque um cidadão, uma empresa ou um órgão REQUEREU algo. Por isso o `proc`
-- carrega o interessado — `interested_party_id` (ID SOLTO, sem FK cross-schema:
-- o vínculo ao cadastro é do `crm`, e amarrá-lo com chave estrangeira leria o
-- schema alheio, o que a guarda SCHEMA_DE do CI reprova) + `interested_party_name`
-- (TEXTO CARIMBADO). É o padrão id-solto-+-nome do `deal`.
--
-- **3. ⭐⭐ A DECISÃO FORMAL É TERMINAL — o ATO DE IMPÉRIO, o DIVERGE central.**
--
-- Aqui está a divergência mais forte. O `ops` termina em `done`/`cancelled`
-- NEUTROS, e `done → in_progress` EXISTE: uma entrega devolvida é o MESMO
-- trabalho, "trabalho tem identidade por serviço". O `proc` re-pergunta e
-- responde diferente: o processo público não termina "concluído", termina num
-- ATO DE IMPÉRIO do Estado — **`deferred` (deferido) · `denied` (indeferido) ·
-- `dismissed` (arquivado)** — e esse ato é DEFINITIVO.
--
-- Decidir exige a permissão `proc.process.decide` **E** um `decision_note` (o
-- DESPACHO — a razão, obrigatória: decisão administrativa sem motivação é nula;
-- Lei 9.784/99 art. 50). E os três desfechos são TERMINAIS: NÃO há
-- `deferred → in_progress`. Um processo decidido que "volta" é um RECURSO, ou
-- um NOVO protocolo — nunca a reabertura do ato consumado. Dinheiro tem
-- identidade por documento (o `ap`, `settled` terminal); trabalho tem
-- identidade por serviço (o `ops`, `done` reabre); **o ato de império tem
-- identidade por decisão: proferido, é definitivo.** Cancelar não existe: um
-- processo que "não vai ser feito" é ARQUIVADO (`dismissed`), com despacho.
--
-- O CONTRASTE vs o `ops` é PROVADO em teste (o pacote lê as duas migrations:
-- o `ops` tem `done → in_progress`, o `proc` NÃO tem nenhuma saída de terminal).
-- =============================================================================

create schema if not exists proc;

comment on schema proc is
  'Módulo Protocolo (processo administrativo). Vertical government da Taxonomia. Reaproveita a Lei das Etapas do Módulo 7 (esteira). Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- =============================================================================

create or replace function proc.emit_event(
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
  if p_event_type not like 'proc.%' then
    raise exception 'proc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'proc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function proc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function proc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'proc.workflow.manage')
      or core.has_permission(p_tenant_id, 'proc.process.manage')
      or core.has_permission(p_tenant_id, 'proc.process.decide');
$$;

create or replace function proc.touch_updated_at()
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
-- 2. WORKFLOWS — o rito que o órgão desenha
-- -----------------------------------------------------------------------------
-- Um tenant pode ter mais de um: o rito de um requerimento de alvará não é o
-- rito de uma ouvidoria interna. Não há rito "padrão" semeado — semear um seria
-- escolher o processo do órgão por ele.
--
-- ANTI-VIÉS:
--   ✅ ENTRA `name` livre.
--   ❌ NÃO ENTRA `kind`/`secretaria` com enum. Órgão é organograma de cliente.
-- =============================================================================

create table proc.workflows (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint workflows_id_tenant unique (id, tenant_id)
);

create unique index workflows_unique_active_name
  on proc.workflows (tenant_id, lower(name))
  where status = 'active';

create trigger workflows_touch
  before update on proc.workflows
  for each row execute function proc.touch_updated_at();

alter table proc.workflows enable row level security;
alter table proc.workflows force row level security;

create policy workflows_select on proc.workflows
  for select to authenticated
  using (proc.can_access(tenant_id));

create policy workflows_insert on proc.workflows
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'proc.workflow.manage'));

create policy workflows_update on proc.workflows
  for update to authenticated
  using (core.has_permission(tenant_id, 'proc.workflow.manage'))
  with check (core.has_permission(tenant_id, 'proc.workflow.manage'));

-- ⛔ Sem policy de DELETE. Rito que já correu processo é história; arquivar é
-- `status = 'archived'`.

-- =============================================================================
-- 2.1 ⭐ WORKFLOW_STAGES — A LEI DAS ETAPAS, EM TABELA
-- -----------------------------------------------------------------------------
--   `requires_approval` — passar desta etapa é DECISÃO, e exige
--     `proc.process.decide`. Sem ela, avançar basta `proc.process.manage`. Quem
--     diz o que é decisão é o tenant, nunca um nome mágico no código.
--   `skippable` — a etapa pode não se aplicar a este processo. Pular não apaga:
--     escreve na trilha quem pulou, quando e por quê.
--
-- ANTI-VIÉS: ❌ NÃO ENTRA `sla_days`, `role_responsavel`, `color`. Prazo é do
-- processo (`due_date`), não da etapa.
-- =============================================================================

create table proc.workflow_stages (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  workflow_id       uuid        not null,
  position          integer     not null check (position >= 0),
  name              text        not null check (length(btrim(name)) > 0),
  requires_approval boolean     not null default false,
  skippable         boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint stages_id_tenant unique (id, tenant_id),
  constraint stages_workflow_fk
    foreign key (workflow_id, tenant_id)
    references proc.workflows (id, tenant_id)
    on delete cascade,
  -- `deferrable initially deferred`: reordenar o rito é trocar duas posições,
  -- e a troca passa por um instante em que as duas são iguais. Conferida no fim
  -- da transação, a troca é natural e a garantia continua inteira.
  constraint stages_position_unique unique (workflow_id, position)
    deferrable initially deferred
);

create index stages_workflow_idx
  on proc.workflow_stages (tenant_id, workflow_id, position);

create trigger stages_touch
  before update on proc.workflow_stages
  for each row execute function proc.touch_updated_at();

alter table proc.workflow_stages enable row level security;
alter table proc.workflow_stages force row level security;

create policy stages_select on proc.workflow_stages
  for select to authenticated
  using (proc.can_access(tenant_id));

create policy stages_insert on proc.workflow_stages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'proc.workflow.manage'));

create policy stages_update on proc.workflow_stages
  for update to authenticated
  using (core.has_permission(tenant_id, 'proc.workflow.manage'))
  with check (core.has_permission(tenant_id, 'proc.workflow.manage'));

-- ⚠️ ÚNICA tabela do módulo com porta de DELETE: desenhar o rito é tentativa e
-- erro. O que a apagou NÃO leva história junto — a trilha guarda o id solto e o
-- NOME CARIMBADO (§4), justamente para sobreviver a este delete.
create policy stages_delete on proc.workflow_stages
  for delete to authenticated
  using (core.has_permission(tenant_id, 'proc.workflow.manage'));

-- =============================================================================
-- 3. PROCESSES — o processo administrativo (o protocolo)
-- -----------------------------------------------------------------------------
-- Nasce num rito do tenant, na primeira etapa dele, com o NÚMERO DE PROTOCOLO e
-- o INTERESSADO. Anda para a frente, ou volta por uma devolução explícita.
--
-- ⭐⭐ O CICLO DE VIDA DIVERGE DO `ops` DE PROPÓSITO: a decisão formal
-- (`deferred`/`denied`/`dismissed`) é TERMINAL. Ver o cabeçalho, decisão 3.
--
-- ANTI-VIÉS:
--   ✅ ENTRA `protocol_number` TEXTO LIVRE, obrigatório e único por tenant.
--   ✅ ENTRA `subject` (o objeto do processo) e `description` TEXTO LIVRE.
--   ✅ ENTRA `interested_party_id` (ID SOLTO) + `interested_party_name` carimbado.
--   ✅ ENTRA `assignee_user_id` OPCIONAL, amarrado a `core.memberships`.
--   ✅ ENTRA `due_date` OPCIONAL.
--   ✅ ENTRA `decision_note` — o despacho, escrito no ato da decisão.
--   ❌ NÃO ENTRA `create sequence`: o FORMATO do número é convenção da casa.
--   ❌ NÃO ENTRA sigilo/prioridade/órgão-enum. Cada um é capacidade própria.
-- =============================================================================

create table proc.processes (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references core.tenants (id) on delete cascade,
  workflow_id           uuid        not null,
  -- Onde o processo está AGORA. Nulo só quando já saiu do rito (decidido).
  current_stage_id      uuid,
  -- ⭐ A identidade PÚBLICA. TEXTO LIVRE (a casa numera), única por tenant.
  protocol_number       text        not null check (length(btrim(protocol_number)) > 0),
  -- ⭐ O interessado: id solto (sem FK cross-schema) + nome carimbado.
  interested_party_id   uuid,
  interested_party_name text        not null check (length(btrim(interested_party_name)) > 0),
  subject               text        not null check (length(btrim(subject)) > 0),
  description           text        not null default '',
  assignee_user_id      uuid,
  due_date              date,
  status                text        not null default 'open'
                        check (status in ('open', 'in_progress', 'deferred', 'denied', 'dismissed')),
  -- ⭐ O DESPACHO. Preenchido no ato da decisão formal; vazio enquanto o
  -- processo tramita. O registro imutável do despacho é a linha da trilha (§4).
  decision_note         text        not null default '',
  created_at            timestamptz not null default now(),
  created_by            uuid        references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now(),
  constraint processes_id_tenant unique (id, tenant_id),
  -- ⭐ O número de protocolo é ÚNICO POR TENANT. Dois processos do mesmo órgão
  -- nunca compartilham o número que o cidadão cita para acompanhar.
  constraint processes_protocol_unique unique (tenant_id, protocol_number),
  constraint processes_workflow_fk
    foreign key (workflow_id, tenant_id)
    references proc.workflows (id, tenant_id)
    on delete restrict,
  constraint processes_stage_fk
    foreign key (current_stage_id, tenant_id)
    references proc.workflow_stages (id, tenant_id)
    on delete restrict,
  -- O responsável é membro DESTE tenant. Isolamento na chave, não na policy.
  constraint processes_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  -- Coerência: processo vivo está numa etapa; processo decidido saiu do rito.
  constraint processes_stage_coherent check (
    (status in ('open', 'in_progress') and current_stage_id is not null) or
    (status in ('deferred', 'denied', 'dismissed'))
  )
);

create index processes_board_idx
  on proc.processes (tenant_id, workflow_id, current_stage_id)
  where status in ('open', 'in_progress');
create index processes_assignee_idx
  on proc.processes (tenant_id, assignee_user_id)
  where assignee_user_id is not null;

create trigger processes_touch
  before update on proc.processes
  for each row execute function proc.touch_updated_at();

alter table proc.processes enable row level security;
alter table proc.processes force row level security;

create policy processes_select on proc.processes
  for select to authenticated
  using (proc.can_access(tenant_id));

create policy processes_insert on proc.processes
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'proc.process.manage'));

-- Editar assunto, interessado, responsável e prazo exige `manage`; proferir a
-- decisão exige `decide`. Quem separa a EDIÇÃO da DECISÃO é o porteiro de §3.2
-- — a policy de UPDATE não enxerga o `old`.
create policy processes_update on proc.processes
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'proc.process.manage')
    or core.has_permission(tenant_id, 'proc.process.decide')
  )
  with check (
    core.has_permission(tenant_id, 'proc.process.manage')
    or core.has_permission(tenant_id, 'proc.process.decide')
  );

-- ⛔ Sem policy de DELETE. Arquivar (`dismissed`) é status, com despacho.

-- -----------------------------------------------------------------------------
-- 3.1 ⭐ AS TRANSIÇÕES PERMITIDAS — a mesma tabela que o domínio TypeScript
-- -----------------------------------------------------------------------------
-- Espelho exato de `ALLOWED_TRANSITIONS` em `@alsham/proc`, e há teste que LÊ
-- ESTE ARQUIVO e compara par a par. Mudar um lado só reprova.
--
-- ⭐⭐ NENHUMA saída de `deferred`/`denied`/`dismissed`: o ato de império é
-- definitivo. É o DIVERGE do `ops` (que tem `done → in_progress`), provado em
-- teste que lê as duas migrations.
-- -----------------------------------------------------------------------------

create or replace function proc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',        'in_progress'),
    ('open',        'deferred'),
    ('open',        'denied'),
    ('open',        'dismissed'),
    ('in_progress', 'deferred'),
    ('in_progress', 'denied'),
    ('in_progress', 'dismissed')
    -- ⭐⭐ E NADA MAIS. A ausência é a lei: nenhum terminal reabre. Um processo
    -- decidido que volta é RECURSO ou NOVO protocolo, jamais a reabertura do ato.
  );
$$;

comment on function proc.allowed_transition(text, text) is
  'O ciclo de vida do processo administrativo. Espelho exato de ALLOWED_TRANSITIONS em @alsham/proc. As três decisões formais são TERMINAIS — o DIVERGE do ops, cujo done reabre.';

-- -----------------------------------------------------------------------------
-- 3.2 O PORTEIRO DO ESTADO — a decisão formal exige `decide` E o despacho
-- -----------------------------------------------------------------------------

create or replace function proc.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not proc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do processo administrativo', old.status, new.status
      using errcode = '22023';
  end if;

  if new.status in ('deferred', 'denied', 'dismissed') then
    if not core.has_permission(new.tenant_id, 'proc.process.decide') then
      raise exception 'proferir a decisão formal de um processo exige a permissão proc.process.decide'
        using errcode = '42501';
    end if;
    -- ⭐ Decisão administrativa sem motivação é nula: o despacho é obrigatório.
    if length(btrim(coalesce(new.decision_note, ''))) = 0 then
      raise exception 'a decisão formal exige o despacho: decidir sem motivar é ato nulo'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger processes_guard_status
  before update of status on proc.processes
  for each row execute function proc.guard_status_transition();

-- =============================================================================
-- 4. MOVEMENTS — ⭐ A TRILHA, E ELA É IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada movimento do processo escreve UMA linha aqui. Imutável em três camadas:
--   1. sem policy de UPDATE nem de DELETE — a RLS nega por ausência;
--   2. sem GRANT de UPDATE nem de DELETE — a porta não existe;
--   3. um trigger que levanta erro nas duas — inclusive para o dono do banco.
--
-- ⭐ `from_stage_id`/`to_stage_id` são SOLTOS, sem FK, e ao lado deles vai o
-- NOME CARIMBADO. É a única coisa que faz a trilha sobreviver ao redesenho do
-- rito (a etapa é dado vivo do tenant: renomeia, reordena, some).
--
-- ⭐ `kind = 'skipped'` é a Lei das Etapas em linha de banco. `kind = 'decided'`
-- carimba o DESPACHO da decisão formal, imutável.
-- =============================================================================

create table proc.movements (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  process_id      uuid        not null,
  kind            text        not null check (kind in (
                    'registered',
                    'advanced',
                    'skipped',
                    'sent-back',
                    'decided'
                  )),
  from_stage_id   uuid,
  from_stage_name text,
  to_stage_id     uuid,
  to_stage_name   text,
  -- A razão do ato: por que pulou, o que refazer, o despacho da decisão.
  note            text        not null default '',
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid        references auth.users (id) on delete set null,
  constraint movements_process_fk
    foreign key (process_id, tenant_id)
    references proc.processes (id, tenant_id)
    on delete restrict
);

create index movements_timeline_idx
  on proc.movements (tenant_id, process_id, occurred_at desc);

alter table proc.movements enable row level security;
alter table proc.movements force row level security;

create policy movements_select on proc.movements
  for select to authenticated
  using (proc.can_access(tenant_id));

-- ⚠️ A trilha NÃO tem policy de INSERT para `authenticated`: ninguém escreve na
-- trilha à mão. Quem escreve são as funções de movimento de §6, que são
-- `security definer` e conferem a permissão do ato ANTES.

create or replace function proc.guard_trail_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha do processo é registro de fato consumado: não se edita nem se apaga. Registre outro movimento.'
    using errcode = '42501';
end;
$$;

create trigger movements_immutable
  before update or delete on proc.movements
  for each row execute function proc.guard_trail_immutable();

-- =============================================================================
-- 5. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE: carrega o NÚMERO DE PROTOCOLO, o NOME do
-- interessado, o NOME da etapa e o NOME do rito — nunca só o id. Quem escuta
-- não pode ler o schema deste módulo.
-- =============================================================================

create or replace function proc.process_payload(p proc.processes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'processId',           p.id,
    'protocolNumber',      p.protocol_number,
    'subject',             p.subject,
    'status',              p.status,
    'interestedPartyId',   p.interested_party_id,
    'interestedPartyName', p.interested_party_name,
    'workflowId',          p.workflow_id,
    'workflowName',        (select w.name from proc.workflows w where w.id = p.workflow_id),
    'stageId',             p.current_stage_id,
    'stageName',           (select s.name from proc.workflow_stages s where s.id = p.current_stage_id),
    'dueDate',             p.due_date,
    'assigneeId',          p.assignee_user_id
  );
$$;

comment on function proc.process_payload(proc.processes) is
  'O envelope de um processo — AUTOSSUFICIENTE. Leva o número de protocolo, o nome do interessado, do rito e da etapa, não só ids.';

-- -----------------------------------------------------------------------------
-- 5.1 `proc.process.registered` — e o processo nasce COM a primeira linha
-- -----------------------------------------------------------------------------

create or replace function proc.on_process_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  select name into v_stage_name
    from proc.workflow_stages where id = new.current_stage_id;

  insert into proc.movements (
    tenant_id, process_id, kind, to_stage_id, to_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id, 'registered', new.current_stage_id, v_stage_name, '', (select auth.uid())
  );

  perform proc.emit_event(new.tenant_id, 'proc.process.registered', proc.process_payload(new));
  return new;
end;
$$;

create trigger processes_emit_registered
  after insert on proc.processes
  for each row execute function proc.on_process_registered();

-- -----------------------------------------------------------------------------
-- 5.2 `proc.process.decided` — a decisão formal
-- -----------------------------------------------------------------------------
-- Um fato só para os três desfechos, com o desfecho no payload. A decisão é ato
-- consumado: a trilha nasce do gatilho (por UPDATE comum + porteiro de §3.2),
-- e carimba o DESPACHO, imutável.

create or replace function proc.on_process_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('deferred', 'denied', 'dismissed') then
    return new;
  end if;

  select name into v_stage_name
    from proc.workflow_stages where id = new.current_stage_id;

  insert into proc.movements (
    tenant_id, process_id, kind, from_stage_id, from_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id, 'decided',
    new.current_stage_id, v_stage_name, btrim(new.decision_note), (select auth.uid())
  );

  perform proc.emit_event(
    new.tenant_id,
    'proc.process.decided',
    proc.process_payload(new) || jsonb_build_object(
      'decision', new.status,
      'note',     btrim(new.decision_note)
    )
  );

  return new;
end;
$$;

create trigger processes_emit_decided
  after update of status on proc.processes
  for each row execute function proc.on_process_decided();

-- -----------------------------------------------------------------------------
-- 5.3 Os fatos de movimento — emitidos a partir da TRILHA
-- -----------------------------------------------------------------------------

create or replace function proc.on_trail_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_process proc.processes;
  v_type    text;
begin
  v_type := case new.kind
              when 'advanced'  then 'proc.stage.advanced'
              when 'skipped'   then 'proc.stage.skipped'
              when 'sent-back' then 'proc.process.sent-back'
              else null
            end;

  if v_type is null then
    return new;   -- `registered` e `decided` têm gatilho próprio.
  end if;

  select * into v_process from proc.processes where id = new.process_id;

  perform proc.emit_event(
    new.tenant_id,
    v_type,
    proc.process_payload(v_process) || jsonb_build_object(
      'movementId',  new.id,
      'occurredAt',  new.occurred_at,
      'fromStageId', new.from_stage_id,
      'fromStage',   new.from_stage_name,
      'toStageId',   new.to_stage_id,
      'toStage',     new.to_stage_name,
      'note',        new.note
    )
  );
  return new;
end;
$$;

create trigger movements_emit
  after insert on proc.movements
  for each row execute function proc.on_trail_movement();

-- =============================================================================
-- 6. OS MOVIMENTOS — as três funções que movem o processo pelo rito
-- -----------------------------------------------------------------------------
-- `security definer` porque escrevem na trilha, que não tem porta de INSERT
-- para `authenticated`. A PRIMEIRA coisa que cada uma faz é conferir a
-- permissão no tenant DO PROCESSO — nunca num parâmetro recebido.
-- =============================================================================

create or replace function proc.advance_process(
  p_process_id uuid,
  p_note       text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_process  proc.processes;
  v_atual    proc.workflow_stages;
  v_proxima  proc.workflow_stages;
  v_event_id uuid;
begin
  select * into v_process from proc.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'processo não encontrado' using errcode = 'P0002';
  end if;

  if not proc.can_access(v_process.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if v_process.status not in ('open', 'in_progress') then
    raise exception 'processo % não está em tramitação (status %)', p_process_id, v_process.status
      using errcode = '22023';
  end if;

  select * into v_atual from proc.workflow_stages where id = v_process.current_stage_id;

  -- ⭐ A permissão depende do DESENHO DO TENANT, não de um nome mágico.
  if v_atual.requires_approval then
    if not core.has_permission(v_process.tenant_id, 'proc.process.decide') then
      raise exception 'a etapa "%" exige aprovação: passar dela requer a permissão proc.process.decide', v_atual.name
        using errcode = '42501';
    end if;
  elsif not core.has_permission(v_process.tenant_id, 'proc.process.manage') then
    raise exception 'mover o processo exige a permissão proc.process.manage'
      using errcode = '42501';
  end if;

  select * into v_proxima
    from proc.workflow_stages
   where workflow_id = v_process.workflow_id
     and position    > v_atual.position
   order by position
   limit 1;

  if v_proxima.id is null then
    raise exception 'a etapa "%" é a última do rito: daqui o processo se decide, não avança', v_atual.name
      using errcode = '22023';
  end if;

  insert into proc.movements (
    tenant_id, process_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_process.tenant_id, v_process.id, 'advanced',
    v_atual.id, v_atual.name, v_proxima.id, v_proxima.name,
    coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_event_id;

  update proc.processes
     set current_stage_id = v_proxima.id,
         status           = 'in_progress'
   where id = v_process.id;

  return v_event_id;
end;
$$;

comment on function proc.advance_process(uuid, text) is
  'Move o processo para a próxima etapa do rito do tenant. Exige proc.process.decide quando a etapa atual pede aprovação; proc.process.manage nas demais.';

-- -----------------------------------------------------------------------------
-- ⭐ PULAR — o ato registrado
-- -----------------------------------------------------------------------------

create or replace function proc.skip_stage(
  p_process_id uuid,
  p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_process  proc.processes;
  v_atual    proc.workflow_stages;
  v_proxima  proc.workflow_stages;
  v_event_id uuid;
begin
  select * into v_process from proc.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'processo não encontrado' using errcode = 'P0002';
  end if;

  if not proc.can_access(v_process.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_process.tenant_id, 'proc.process.decide') then
    raise exception 'pular uma etapa é decisão: exige a permissão proc.process.decide'
      using errcode = '42501';
  end if;

  if v_process.status not in ('open', 'in_progress') then
    raise exception 'processo % não está em tramitação (status %)', p_process_id, v_process.status
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'pular uma etapa exige a razão: sem ela a trilha registra a omissão e esconde o motivo'
      using errcode = '22023';
  end if;

  select * into v_atual from proc.workflow_stages where id = v_process.current_stage_id;

  if not v_atual.skippable then
    raise exception 'a etapa "%" não foi desenhada como pulável neste rito', v_atual.name
      using errcode = '22023';
  end if;

  select * into v_proxima
    from proc.workflow_stages
   where workflow_id = v_process.workflow_id
     and position    > v_atual.position
   order by position
   limit 1;

  if v_proxima.id is null then
    raise exception 'a etapa "%" é a última do rito: não há para onde pular', v_atual.name
      using errcode = '22023';
  end if;

  insert into proc.movements (
    tenant_id, process_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_process.tenant_id, v_process.id, 'skipped',
    v_atual.id, v_atual.name, v_proxima.id, v_proxima.name,
    btrim(p_reason), (select auth.uid())
  )
  returning id into v_event_id;

  update proc.processes
     set current_stage_id = v_proxima.id,
         status           = 'in_progress'
   where id = v_process.id;

  return v_event_id;
end;
$$;

comment on function proc.skip_stage(uuid, text) is
  'Pula uma etapa PULÁVEL, registrando quem, quando e por quê. Pular nunca apaga a etapa da história do processo.';

-- -----------------------------------------------------------------------------
-- ⭐ DEVOLVER — voltar a uma etapa anterior, com a instrução do que refazer
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE do `ops`: lá, devolver uma OS CONCLUÍDA a REABRE (`done →
-- in_progress`). Aqui, um processo DECIDIDO NÃO se devolve — o ato de império é
-- definitivo; reabri-lo é recurso ou novo protocolo. Só tramita quem ainda
-- tramita.

create or replace function proc.send_back_process(
  p_process_id  uuid,
  p_to_stage_id uuid,
  p_instruction text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_process  proc.processes;
  v_atual    proc.workflow_stages;
  v_destino  proc.workflow_stages;
  v_event_id uuid;
begin
  select * into v_process from proc.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'processo não encontrado' using errcode = 'P0002';
  end if;

  if not proc.can_access(v_process.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_process.tenant_id, 'proc.process.decide') then
    raise exception 'devolver um processo é decisão: exige a permissão proc.process.decide'
      using errcode = '42501';
  end if;

  -- ⭐⭐ O DIVERGE do `ops`: processo decidido é definitivo.
  if v_process.status in ('deferred', 'denied', 'dismissed') then
    raise exception 'processo decidido não se devolve: o ato de império é definitivo — reabrir é recurso ou novo protocolo'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_instruction, ''))) = 0 then
    raise exception 'devolver exige a instrução do que refazer: devolver sem dizer o que mudar trava quem recebe'
      using errcode = '22023';
  end if;

  select * into v_destino
    from proc.workflow_stages
   where id = p_to_stage_id and workflow_id = v_process.workflow_id;

  if v_destino.id is null then
    raise exception 'a etapa de destino não pertence ao rito deste processo'
      using errcode = '22023';
  end if;

  select * into v_atual from proc.workflow_stages where id = v_process.current_stage_id;

  if v_destino.position >= v_atual.position then
    raise exception 'devolver é voltar: a etapa "%" não é anterior a "%"', v_destino.name, v_atual.name
      using errcode = '22023';
  end if;

  insert into proc.movements (
    tenant_id, process_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_process.tenant_id, v_process.id, 'sent-back',
    v_atual.id, v_atual.name, v_destino.id, v_destino.name,
    btrim(p_instruction), (select auth.uid())
  )
  returning id into v_event_id;

  update proc.processes
     set current_stage_id = v_destino.id,
         status           = 'in_progress'
   where id = v_process.id;

  return v_event_id;
end;
$$;

comment on function proc.send_back_process(uuid, uuid, text) is
  'Devolve o processo para uma etapa anterior com a instrução do que refazer. Processo já decidido NÃO se devolve — o DIVERGE do Módulo 7 (esteira), cujo devolver reabre.';

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Toda função nasce ABERTA a PUBLIC. Revogar DEPOIS de todas as funções
-- criadas, e conceder execute só ao que a aplicação chama (lição do 0022).
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema proc                 from public, anon, authenticated;
revoke all on all tables    in schema proc from public, anon, authenticated;
revoke all on all functions in schema proc from public, anon, authenticated;

grant usage on schema proc to authenticated;

grant select, insert, update on proc.workflows to authenticated;

-- A ÚNICA com DELETE. Ver §2.1: desenhar o rito é tentativa e erro, e a trilha
-- sobrevive ao delete porque carimba o nome.
grant select, insert, update, delete on proc.workflow_stages to authenticated;

grant select, insert, update on proc.processes to authenticated;

-- ⛔ SÓ SELECT. Nem INSERT: a trilha se escreve pelas funções de §6, que
-- conferem a permissão do ato. Camada 2 da imutabilidade.
grant select on proc.movements to authenticated;

grant execute on function proc.can_access(uuid)                          to authenticated;
grant execute on function proc.advance_process(uuid, text)               to authenticated;
grant execute on function proc.skip_stage(uuid, text)                    to authenticated;
grant execute on function proc.send_back_process(uuid, uuid, text)       to authenticated;

-- `proc.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum rito semeado — semear um seria
-- escolher o processo do órgão por ele. Nenhum objeto fora de `proc`. Nenhuma
-- leitura de schema alheio (o interessado é ID SOLTO, sem FK cross-schema).
-- =============================================================================
