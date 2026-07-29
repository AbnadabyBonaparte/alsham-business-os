-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0027_dun.sql
-- Módulo 12: Régua de Cobrança. Schema `dun`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §16,
-- depois do `0026_evt.sql`. ⚠️ Este módulo CONSOME fatos de títulos a
-- receber: o `apps/api` precisa ser REDEPLOYADO depois do merge, senão os
-- fatos chegam como `no-subscriber` e a régua fica vazia.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Cobrança*.
-- Spec: docs/canon/MODULO-DUN-SPEC.md
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE MÓDULO É — E O QUE ELE DELIBERADAMENTE NÃO É
-- -----------------------------------------------------------------------------
-- A régua diz O QUE FAZER com cada título vencido e REGISTRA QUE FOI FEITO.
-- ⛔ **Ela NÃO ENVIA NADA.** E-mail, mensagem, ligação automática são
-- integrações futuras DECLARADAS (spec §6): um módulo que enviasse sem
-- infraestrutura de envio seria promessa; um que fingisse enviar seria
-- mentira. Executar um passo é ATO REGISTRADO — quem, quando, por qual canal
-- (texto livre), com anotação — e o fato `dun.step.executed` carrega tudo o
-- que uma integração de envio precisaria escutar no dia em que existir.
--
-- ⚠️ **`dun` cobra O CLIENTE DO TENANT. `billing` cobra o tenant.** São duas
-- palavras "cobrança" com donos diferentes — esta linha existe para ninguém
-- confundir as duas de novo.
--
-- -----------------------------------------------------------------------------
-- ⭐ A LEI DAS ETAPAS, TERCEIRA APLICAÇÃO: A RÉGUA É DESENHO DO TENANT
-- -----------------------------------------------------------------------------
-- Passos ordenados, nome LIVRE, dias-após-vencimento e canal TEXTO LIVRE
-- ("e-mail", "ligação", "visita", "carta registrada"). Nunca enum. Re-perguntas:
--
-- MANTIDO do ops/deal: passo é linha de tabela; DELETE de passo permitido
--   (desenho é tentativa e erro); a trilha de execução carimba o NOME e o
--   CANAL do passo — sobrevive ao redesenho; trilha imutável em 3 camadas.
-- ⭐ DIVERGE: **UMA régua ativa por tenant.** O funil é múltiplo porque a
--   negociação ESCOLHE o funil ao nascer; o título vencido não escolhe nada —
--   ele CAI na régua. Réguas múltiplas exigiriam uma regra de atribuição
--   (qual título vai para qual régua) que ninguém desenhou: capacidade
--   futura declarada. Um índice único parcial faz a lei.
--
-- -----------------------------------------------------------------------------
-- ⭐ A PROJEÇÃO (PADRÃO E10): ESTE MÓDULO SÓ FAZ SENTIDO ESCUTANDO
-- -----------------------------------------------------------------------------
-- `dun.titles` é projeção local de títulos a receber, alimentada por FATOS
-- (`consumes` declarado COM handler — Lei 7 do jeito certo). A porta é
-- `dun.record_external_receivable()`: security definer, revogada de todos,
-- chamada só pela composição (service_role). A ORIGEM vem por parâmetro —
-- lida de `envelope.producedBy` no consumidor, NUNCA chumbada: um segundo
-- produtor do mesmo formato grava a origem DELE.
--
-- ⚠️ Não há entrada manual de título aqui ("mão humana ganha" não tem o que
-- ganhar: não existe import neste módulo). Baixa ou cancelamento NA ORIGEM
-- tira o título da régua sozinho — pelo mesmo fato que o trouxe.
-- =============================================================================

create schema if not exists dun;

comment on schema dun is
  'Módulo Régua de Cobrança. Domain finance da Taxonomia. Projeção de títulos alimentada por evento; a régua é desenho do tenant; executar passo é ato registrado. NÃO envia nada. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function dun.emit_event(
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
  if p_event_type not like 'dun.%' then
    raise exception 'dun.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'dun',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function dun.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function dun.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'dun.ruler.design')
      or core.has_permission(p_tenant_id, 'dun.step.execute');
$$;

create or replace function dun.touch_updated_at()
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
-- 2. RULERS + STEPS — a régua que o tenant desenha
-- =============================================================================

create table dun.rulers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint rulers_id_tenant unique (id, tenant_id)
);

-- ⭐ UMA régua ativa por tenant — a divergência declarada no cabeçalho.
create unique index rulers_one_active
  on dun.rulers (tenant_id)
  where status = 'active';

create trigger rulers_touch
  before update on dun.rulers
  for each row execute function dun.touch_updated_at();

alter table dun.rulers enable row level security;
alter table dun.rulers force row level security;

create policy rulers_select on dun.rulers
  for select to authenticated
  using (dun.can_access(tenant_id));

create policy rulers_insert on dun.rulers
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dun.ruler.design'));

create policy rulers_update on dun.rulers
  for update to authenticated
  using (core.has_permission(tenant_id, 'dun.ruler.design'))
  with check (core.has_permission(tenant_id, 'dun.ruler.design'));

-- ⛔ Sem policy de DELETE. Régua que já executou passo é história.

create table dun.steps (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  ruler_id       uuid        not null,
  position       integer     not null check (position >= 0),
  name           text        not null check (length(btrim(name)) > 0),
  -- Quantos dias APÓS o vencimento este passo se aplica.
  days_after_due integer     not null check (days_after_due >= 0),
  -- ⭐ TEXTO LIVRE: "e-mail", "ligação", "visita", "carta". Um enum aqui
  -- congelaria o instrumento de uma década — a lição do canal do crm.
  channel        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint steps_id_tenant unique (id, tenant_id),
  constraint steps_ruler_fk
    foreign key (ruler_id, tenant_id)
    references dun.rulers (id, tenant_id)
    on delete cascade,
  constraint steps_channel_not_blank check (channel is null or length(btrim(channel)) > 0),
  -- `deferrable`: reordenar troca posições. Mesma decisão do ops e do deal.
  constraint steps_position_unique unique (ruler_id, position)
    deferrable initially deferred
);

create index steps_ruler_idx on dun.steps (tenant_id, ruler_id, position);

create trigger steps_touch
  before update on dun.steps
  for each row execute function dun.touch_updated_at();

alter table dun.steps enable row level security;
alter table dun.steps force row level security;

create policy steps_select on dun.steps
  for select to authenticated
  using (dun.can_access(tenant_id));

create policy steps_insert on dun.steps
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dun.ruler.design'));

create policy steps_update on dun.steps
  for update to authenticated
  using (core.has_permission(tenant_id, 'dun.ruler.design'))
  with check (core.has_permission(tenant_id, 'dun.ruler.design'));

-- A ÚNICA porta de DELETE do módulo: desenhar é tentativa e erro. A
-- execução sobrevive pelo NOME e CANAL carimbados.
create policy steps_delete on dun.steps
  for delete to authenticated
  using (core.has_permission(tenant_id, 'dun.ruler.design'));

-- =============================================================================
-- 3. TITLES — ⭐ A PROJEÇÃO (padrão E10)
-- -----------------------------------------------------------------------------
-- Alimentada SÓ por `dun.record_external_receivable()` (§5). O cliente LÊ;
-- não escreve: não há policy nem grant de INSERT/UPDATE/DELETE.
-- =============================================================================

create table dun.titles (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ A ORIGEM — sempre de envelope.producedBy, via parâmetro. Nunca chumbada.
  source_module_id      text        not null check (length(btrim(source_module_id)) > 0),
  external_ref          text        not null,
  due_date              date        not null,
  amount_cents          bigint      not null check (amount_cents > 0),
  received_amount_cents bigint      not null default 0 check (received_amount_cents >= 0),
  currency              char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  payer_name            text,
  counterparty_tax_id   text,
  description           text        not null default '',
  status                text        not null
                        check (status in ('open', 'partially_received', 'received', 'cancelled')),
  -- Quando o título ENTROU na régua (vencido e em aberto) e quando SAIU
  -- (baixa, cancelamento ou vencimento renegociado). A tela lê a VIEW (§4);
  -- estes carimbos existem para os fatos entered/left não mentirem.
  entered_at            timestamptz,
  left_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint titles_unique_ref unique (tenant_id, external_ref),
  constraint titles_id_tenant unique (id, tenant_id)
);

create index titles_queue_idx
  on dun.titles (tenant_id, due_date)
  where status in ('open', 'partially_received');

create trigger titles_touch
  before update on dun.titles
  for each row execute function dun.touch_updated_at();

alter table dun.titles enable row level security;
alter table dun.titles force row level security;

create policy titles_select on dun.titles
  for select to authenticated
  using (dun.can_access(tenant_id));

-- ⛔ Nenhuma policy de escrita: quem escreve é a projeção (§5), service_role.

-- =============================================================================
-- 4. A FILA — consequência calculada, com a RLS de quem lê
-- =============================================================================

create view dun.queue
  with (security_invoker = true)
as
select t.*,
       (current_date - t.due_date) as days_overdue
  from dun.titles t
 where t.status in ('open', 'partially_received')
   and t.due_date < current_date;

comment on view dun.queue is
  'Os títulos NA RÉGUA agora: vencidos e em aberto. Consequência calculada — a elegibilidade por data não espera evento nenhum. security_invoker: a RLS de titles decide.';

-- =============================================================================
-- 5. ⭐ A PORTA DE PROJEÇÃO — espelho consciente da recon (0011 §3)
-- -----------------------------------------------------------------------------
-- Idempotente por (tenant_id, external_ref). A origem vem por argumento.
-- ⭐ E é AQUI que entered/left acontecem: o mesmo fato que traz o título
-- decide se ele entra ou sai da régua — baixa na origem tira sozinho.
--
-- ⚠️ A entrada por PURA passagem de tempo (título projetado em dia que vence
-- amanhã, sem nenhum evento novo) NÃO emite `dun.title.entered` — emitir
-- exigiria relógio/cron, que é capacidade futura declarada (spec §6). A
-- TELA não mente: a fila (§4) é calculada por data, sempre atual. E o
-- primeiro passo executado num título assim evidencia a entrada (§6).
-- =============================================================================

create or replace function dun.title_payload(p dun.titles)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'externalRef',         p.external_ref,
    'sourceModuleId',      p.source_module_id,
    'dueDate',             p.due_date,
    'amountCents',         p.amount_cents,
    'receivedAmountCents', p.received_amount_cents,
    'currency',            p.currency,
    'payerName',           p.payer_name,
    'counterpartyTaxId',   p.counterparty_tax_id,
    'status',              p.status,
    'enteredAt',           p.entered_at,
    'leftAt',              p.left_at
  );
$$;

comment on function dun.title_payload(dun.titles) is
  'O envelope de um título na régua — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function dun.record_external_receivable(
  p_tenant_id             uuid,
  p_source_module_id      text,
  p_external_ref          text,
  p_due_date              date,
  p_amount_cents          bigint,
  p_currency              char(3),
  p_status                text,
  p_received_amount_cents bigint default 0,
  p_payer_name            text   default null,
  p_counterparty_tax_id   text   default null,
  p_description           text   default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing dun.titles;
  v_row      dun.titles;
  v_touched  integer;
  v_eligible boolean;
  v_effect   text;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'dun.record_external_receivable: origem do título não informada'
      using errcode = '22023';
  end if;

  if p_status not in ('open', 'partially_received', 'received', 'cancelled') then
    raise exception 'dun.record_external_receivable: estado % não reconhecido', p_status
      using errcode = '22023';
  end if;

  v_eligible := p_status in ('open', 'partially_received') and p_due_date < current_date;

  select * into v_existing
    from dun.titles
   where tenant_id = p_tenant_id
     and external_ref = p_external_ref;

  if not found then
    insert into dun.titles (
      tenant_id, source_module_id, external_ref, due_date,
      amount_cents, received_amount_cents, currency,
      payer_name, counterparty_tax_id, description, status,
      entered_at
    )
    values (
      p_tenant_id, p_source_module_id, p_external_ref, p_due_date,
      p_amount_cents, coalesce(p_received_amount_cents, 0), p_currency,
      p_payer_name, p_counterparty_tax_id, coalesce(p_description, ''), p_status,
      case when v_eligible then now() else null end
    )
    returning * into v_row;

    if v_eligible then
      perform dun.emit_event(p_tenant_id, 'dun.title.entered', dun.title_payload(v_row));
    end if;
    return 'created';
  end if;

  update dun.titles t
     set source_module_id      = p_source_module_id,
         due_date              = p_due_date,
         amount_cents          = p_amount_cents,
         received_amount_cents = coalesce(p_received_amount_cents, 0),
         currency              = p_currency,
         payer_name            = p_payer_name,
         counterparty_tax_id   = p_counterparty_tax_id,
         description           = coalesce(p_description, ''),
         status                = p_status,
         updated_at            = now()
   where t.tenant_id    = p_tenant_id
     and t.external_ref = p_external_ref
     and (t.source_module_id, t.due_date, t.amount_cents, t.received_amount_cents,
          t.currency, t.payer_name, t.counterparty_tax_id, t.description, t.status)
         is distinct from
         (p_source_module_id, p_due_date, p_amount_cents, coalesce(p_received_amount_cents, 0),
          p_currency, p_payer_name, p_counterparty_tax_id, coalesce(p_description, ''), p_status);

  get diagnostics v_touched = row_count;
  v_effect := case when v_touched > 0 then 'updated' else 'unchanged' end;

  -- entered / left — decididos pelo MESMO fato que mexeu no título.
  select * into v_row from dun.titles
   where tenant_id = p_tenant_id and external_ref = p_external_ref;

  if v_eligible and (v_row.entered_at is null or v_row.left_at is not null) then
    update dun.titles set entered_at = now(), left_at = null, updated_at = now()
     where id = v_row.id
    returning * into v_row;
    perform dun.emit_event(p_tenant_id, 'dun.title.entered', dun.title_payload(v_row));
  elsif not v_eligible and v_row.entered_at is not null and v_row.left_at is null then
    update dun.titles set left_at = now(), updated_at = now()
     where id = v_row.id
    returning * into v_row;
    perform dun.emit_event(p_tenant_id, 'dun.title.left', dun.title_payload(v_row));
  end if;

  return v_effect;
end;
$$;

comment on function dun.record_external_receivable(uuid, text, text, date, bigint, char, text, bigint, text, text, text) is
  'Projeta na régua um título a receber vindo de OUTRO módulo. Idempotente por (tenant_id, external_ref). Procedência por argumento (envelope.producedBy). Decide entered/left — baixa na origem tira o título sozinho. Só service_role.';

-- =============================================================================
-- 6. STEP_EXECUTIONS — ⭐ O ATO, E ELE É IMUTÁVEL (três camadas)
-- =============================================================================

create table dun.step_executions (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  title_id       uuid        not null,
  -- Solto de propósito + carimbos: a execução sobrevive ao redesenho.
  step_id        uuid,
  step_name      text        not null,
  channel        text,
  days_after_due integer,
  note           text        not null default '',
  executed_at    timestamptz not null default now(),
  actor_user_id  uuid        references auth.users (id) on delete set null,
  constraint executions_title_fk
    foreign key (title_id, tenant_id)
    references dun.titles (id, tenant_id)
    on delete restrict
);

-- O MESMO passo não se executa duas vezes no MESMO título: o segundo "2º
-- aviso" seria o operador cobrando em dobro sem perceber.
create unique index executions_once_per_step
  on dun.step_executions (tenant_id, title_id, step_id)
  where step_id is not null;

create index executions_title_idx
  on dun.step_executions (tenant_id, title_id, executed_at desc);

alter table dun.step_executions enable row level security;
alter table dun.step_executions force row level security;

create policy executions_select on dun.step_executions
  for select to authenticated
  using (dun.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve é `dun.execute_step()` (§6.1), que
-- confere a permissão do ato ANTES.

create or replace function dun.guard_execution_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a execução de um passo é fato consumado: não se edita nem se apaga.'
    using errcode = '42501';
end;
$$;

create trigger executions_immutable
  before update or delete on dun.step_executions
  for each row execute function dun.guard_execution_immutable();

-- -----------------------------------------------------------------------------
-- 6.1 ⭐ EXECUTAR UM PASSO — o ato registrado
-- -----------------------------------------------------------------------------

create or replace function dun.execute_step(
  p_title_id uuid,
  p_step_id  uuid,
  p_note     text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title dun.titles;
  v_step  dun.steps;
  v_exec_id uuid;
begin
  select * into v_title from dun.titles where id = p_title_id;
  if v_title.id is null then
    raise exception 'título não encontrado' using errcode = 'P0002';
  end if;

  if not dun.can_access(v_title.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_title.tenant_id, 'dun.step.execute') then
    raise exception 'executar um passo da régua exige a permissão dun.step.execute'
      using errcode = '42501';
  end if;

  if v_title.status not in ('open', 'partially_received') or v_title.due_date >= current_date then
    raise exception 'o título % não está na régua: só se cobra o que está vencido e em aberto', v_title.external_ref
      using errcode = '22023';
  end if;

  select s.* into v_step
    from dun.steps s
    join dun.rulers r on r.id = s.ruler_id and r.tenant_id = s.tenant_id
   where s.id = p_step_id
     and s.tenant_id = v_title.tenant_id
     and r.status = 'active';

  if v_step.id is null then
    raise exception 'o passo não pertence à régua ATIVA deste tenant'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from dun.step_executions e
     where e.tenant_id = v_title.tenant_id
       and e.title_id = v_title.id
       and e.step_id = v_step.id
  ) then
    raise exception 'o passo "%" já foi executado para este título: cobrar em dobro não é cobrança, é engano', v_step.name
      using errcode = '22023';
  end if;

  -- ⭐ O primeiro ato num título que venceu SEM evento novo evidencia a
  -- entrada na régua (ver §5 sobre a passagem de tempo).
  if v_title.entered_at is null or v_title.left_at is not null then
    update dun.titles set entered_at = now(), left_at = null, updated_at = now()
     where id = v_title.id
    returning * into v_title;
    perform dun.emit_event(v_title.tenant_id, 'dun.title.entered', dun.title_payload(v_title));
  end if;

  insert into dun.step_executions (
    tenant_id, title_id, step_id, step_name, channel, days_after_due,
    note, actor_user_id
  ) values (
    v_title.tenant_id, v_title.id, v_step.id, v_step.name, v_step.channel,
    v_step.days_after_due, coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_exec_id;

  perform dun.emit_event(
    v_title.tenant_id,
    'dun.step.executed',
    dun.title_payload(v_title) || jsonb_build_object(
      'executionId', v_exec_id,
      'stepName',    v_step.name,
      'channel',     v_step.channel,
      'daysAfterDue', v_step.days_after_due,
      'daysOverdue', (current_date - v_title.due_date),
      'note',        coalesce(p_note, '')
    )
  );

  return v_exec_id;
end;
$$;

comment on function dun.execute_step(uuid, uuid, text) is
  'Executa um passo da régua ATIVA sobre um título VENCIDO e em aberto: registra quem, quando, por qual canal — e emite o fato. O módulo diz o que fazer e registra que foi feito; ele NÃO envia nada.';

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema dun                  from public, anon, authenticated;
revoke all on all tables    in schema dun from public, anon, authenticated;
revoke all on all functions in schema dun from public, anon, authenticated;

grant usage on schema dun to authenticated;

grant select, insert, update on dun.rulers to authenticated;

-- A ÚNICA com DELETE — a execução sobrevive pelos carimbos.
grant select, insert, update, delete on dun.steps to authenticated;

-- ⛔ SÓ SELECT: a projeção escreve; o cliente lê.
grant select on dun.titles to authenticated;
grant select on dun.queue  to authenticated;

-- ⛔ SÓ SELECT: o ato entra pela função, que confere a permissão antes.
grant select on dun.step_executions to authenticated;

grant execute on function dun.can_access(uuid)              to authenticated;
grant execute on function dun.execute_step(uuid, uuid, text) to authenticated;

-- `dun.emit_event` NÃO é concedida. `dun.record_external_receivable` NÃO é
-- concedida a NINGUÉM além do dono (service_role): dar essa caneta à tela
-- deixaria o cliente forjar um título "vindo de outro módulo" por dentro da
-- RLS. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum envio. Nenhum objeto fora de `dun`. Nenhuma
-- leitura de schema alheio — a projeção recebe TUDO por argumento, do
-- payload que o produtor montou autossuficiente exatamente para isso.
-- =============================================================================
