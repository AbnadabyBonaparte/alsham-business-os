-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0043_cc.sql
-- Módulo 28: Centros de Custo & Rateio. Schema `cc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §20,
-- primeiro da Missão Sete (o Bloco Financeiro).
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Centros de custo* / *Rateio*.
-- Spec: docs/canon/MODULO-CC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ CENTRO DE CUSTO É DADO DO TENANT — a Lei das Etapas na estrutura
-- -----------------------------------------------------------------------------
-- `cc.centers`: nome LIVRE, ativa/arquivada. JAMAIS um plano de centros
-- semeado — "administrativo/comercial/produção" é o organograma de UMA casa,
-- e uma construtora rateia por obra, uma agência por cliente. ⭐ E
-- `archived → active` EXISTE (o argumento do crm/cash mantido): o centro
-- reorganizado é o MESMO centro, e partir a série histórica dele em dois
-- mentiria em todo relatório que soma o antes e o depois.
--
-- -----------------------------------------------------------------------------
-- ⭐ A REGRA DE RATEIO FECHA 100% — e isso é FÍSICA, não preferência
-- -----------------------------------------------------------------------------
-- A regra é DESENHO do tenant (quais centros, que percentuais). Mas uma
-- regra ATIVA cujos percentuais NÃO somam 100% distribui 83% de um custo e
-- perde 17% no nada — e um custo que evapora mente no número de TODO centro
-- e no total. Por isso: enquanto RASCUNHO a regra se desenha incompleta à
-- vontade; ATIVAR exige a soma exata de 10000 pontos-base (100,00%). É física
-- do domínio, com constraint por gatilho e o porquê escrito aqui.
--
-- -----------------------------------------------------------------------------
-- ⭐ EXECUTAR O RATEIO É ATO DE GENTE — sem cron fingido
-- -----------------------------------------------------------------------------
-- Não há relógio que rateia sozinho. A execução (`cc.execute_rateio()`) é
-- disparada por gente, gera lançamentos de rateio IMUTÁVEIS (um por centro),
-- com competência e ORIGEM por ID SOLTO + nome carimbado. Corrigir é EXECUTAR
-- DE NOVO com razão — as duas execuções ficam no livro; a de rateio não se
-- rasura (a física do cash/inv). O resto da divisão vai ao último centro:
-- cent nenhum se perde (a mesma física do 100%).
--
-- ⚠️ GENÉRICO POR LEI: zero vocabulário de shopping no schema. O Fundo de
-- Promoção da Vertical (Q6 · `fund`) vai se PENDURAR aqui pela origem (ID
-- solto + nome), como o `mnt` deixou a ponte para o `pat`. Nenhuma FK
-- cruzada nasce para um módulo que ainda não existe.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS / FORA (spec §5): rateio por relógio (cron fingido), integração
-- contábil (ofício do contador — Lei 3), custeio ABC (capacidade futura).
-- `consumes` VAZIO e honesto: quem executa é gente; ninguém é escutado.
-- =============================================================================

create schema if not exists cc;

comment on schema cc is
  'Módulo Centros de Custo & Rateio. Domain finance da Taxonomia. Centro é dado do tenant (volta do arquivo); a regra fecha 100% (física); a execução é ato de gente que gera lançamentos imutáveis com origem por id solto. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima oitava vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function cc.emit_event(
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
  if p_event_type not like 'cc.%' then
    raise exception 'cc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'cc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function cc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function cc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'cc.center.manage')
      or core.has_permission(p_tenant_id, 'cc.rule.design')
      or core.has_permission(p_tenant_id, 'cc.rateio.execute');
$$;

create or replace function cc.touch_updated_at()
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
-- 2. CENTERS — ⭐ o centro é DADO DO TENANT, e volta do arquivo
-- =============================================================================

create table cc.centers (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint cc_centers_id_tenant unique (id, tenant_id)
);

create unique index cc_centers_active_name
  on cc.centers (tenant_id, lower(btrim(name)))
  where status = 'active';

create trigger cc_centers_touch
  before update on cc.centers
  for each row execute function cc.touch_updated_at();

alter table cc.centers enable row level security;
alter table cc.centers force row level security;

create policy cc_centers_select on cc.centers
  for select to authenticated
  using (cc.can_access(tenant_id));

create policy cc_centers_insert on cc.centers
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'cc.center.manage'));

create policy cc_centers_update on cc.centers
  for update to authenticated
  using (core.has_permission(tenant_id, 'cc.center.manage'))
  with check (core.has_permission(tenant_id, 'cc.center.manage'));

-- ⛔ Sem DELETE: centro com história de rateio não se apaga — arquiva-se.

create or replace function cc.allowed_center_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function cc.allowed_center_transition(text, text) is
  'Ciclo de vida do centro. Espelho de CENTER_TRANSITIONS em @alsham/cost-centers. IDA E VOLTA: o centro reorganizado é o MESMO centro (o argumento do crm/cash).';

create or replace function cc.guard_center_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not cc.allowed_center_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do centro', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger cc_centers_guard_status
  before update on cc.centers
  for each row execute function cc.guard_center_transition();

create or replace function cc.stamp_center_insert()
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

create trigger cc_centers_stamp
  before insert on cc.centers
  for each row execute function cc.stamp_center_insert();

-- =============================================================================
-- 3. RULES + RULE_LINES — ⭐ o desenho do tenant; ATIVAR exige 100%
-- =============================================================================

create table cc.rules (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'draft'
             check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint cc_rules_id_tenant unique (id, tenant_id)
);

create trigger cc_rules_touch
  before update on cc.rules
  for each row execute function cc.touch_updated_at();

create table cc.rule_lines (
  id           uuid    primary key default gen_random_uuid(),
  tenant_id    uuid    not null references core.tenants (id) on delete cascade,
  rule_id      uuid    not null,
  center_id    uuid    not null,
  -- ⭐ Pontos-base: 10000 = 100,00%. Inteiro — percentual em ponto flutuante
  -- não fecha 100% por arredondamento, e o que não fecha, some.
  basis_points integer not null check (basis_points > 0 and basis_points <= 10000),
  constraint cc_rule_lines_rule_fk
    foreign key (rule_id, tenant_id)
    references cc.rules (id, tenant_id) on delete cascade,
  constraint cc_rule_lines_center_fk
    foreign key (center_id, tenant_id)
    references cc.centers (id, tenant_id) on delete restrict,
  -- Um centro aparece uma vez por regra.
  constraint cc_rule_lines_once unique (rule_id, center_id)
);

create index cc_rule_lines_by_rule on cc.rule_lines (tenant_id, rule_id);

alter table cc.rules enable row level security;
alter table cc.rules force row level security;
alter table cc.rule_lines enable row level security;
alter table cc.rule_lines force row level security;

create policy cc_rules_select on cc.rules
  for select to authenticated using (cc.can_access(tenant_id));
create policy cc_rules_insert on cc.rules
  for insert to authenticated with check (core.has_permission(tenant_id, 'cc.rule.design'));
create policy cc_rules_update on cc.rules
  for update to authenticated
  using (core.has_permission(tenant_id, 'cc.rule.design'))
  with check (core.has_permission(tenant_id, 'cc.rule.design'));

create policy cc_rule_lines_select on cc.rule_lines
  for select to authenticated using (cc.can_access(tenant_id));
create policy cc_rule_lines_write on cc.rule_lines
  for all to authenticated
  using (core.has_permission(tenant_id, 'cc.rule.design'))
  with check (core.has_permission(tenant_id, 'cc.rule.design'));

-- ⛔ Sem DELETE de regra: regra com execuções é história; arquiva-se.

create or replace function cc.allowed_rule_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',  'active'),
    ('active', 'archived'),
    ('draft',  'archived')
  );
$$;

comment on function cc.allowed_rule_transition(text, text) is
  'Ciclo de vida da regra. Espelho de RULE_TRANSITIONS em @alsham/cost-centers. Arquivada é terminal — a regra que muda é regra nova, para não reescrever a história das execuções que a usaram.';

-- ⭐ O PORTEIRO DA REGRA: ativar exige 100% e congela o desenho.
create or replace function cc.guard_rule_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum integer;
  v_lines integer;
begin
  if new.status = old.status then
    return new;
  end if;

  if not cc.allowed_rule_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da regra', old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'active' then
    select coalesce(sum(basis_points), 0), count(*)
      into v_sum, v_lines
      from cc.rule_lines
     where rule_id = new.id and tenant_id = new.tenant_id;

    if v_lines = 0 then
      raise exception 'regra sem centros não ateia: uma regra vazia não rateia nada'
        using errcode = '22023';
    end if;
    if v_sum <> 10000 then
      raise exception 'a regra soma % pontos-base — o rateio fecha 100%% (10000) ou perde custo no nada', v_sum
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger cc_rules_guard_status
  before update on cc.rules
  for each row execute function cc.guard_rule_transition();

-- ⭐ A regra ATIVA congela o desenho: mexer nas linhas de uma regra que já
-- rateou reescreveria o passado. Só o rascunho é plano.
create or replace function cc.guard_lines_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_rule   uuid;
begin
  v_rule := coalesce(new.rule_id, old.rule_id);
  select status into v_status from cc.rules where id = v_rule;
  if v_status is distinct from 'draft' then
    raise exception 'a regra ativa está congelada: as linhas só mudam no rascunho — regra nova para outro rateio'
      using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger cc_rule_lines_frozen
  before insert or update or delete on cc.rule_lines
  for each row execute function cc.guard_lines_frozen();

create or replace function cc.stamp_rule_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a regra nasce no rascunho: ativar é ato à parte, e exige 100%%'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger cc_rules_stamp
  before insert on cc.rules
  for each row execute function cc.stamp_rule_insert();

-- =============================================================================
-- 4. EXECUTIONS + ALLOCATIONS — ⭐ o livro de rateio, imutável
-- -----------------------------------------------------------------------------
-- Escrito SÓ por `cc.execute_rateio()`. O cliente LÊ; não insere.
-- =============================================================================

create table cc.executions (
  id            uuid        primary key default gen_random_uuid(),
  seq           bigint      generated always as identity,
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  rule_id       uuid        not null,
  rule_name     text        not null,
  -- ⭐ A ORIGEM — ID SOLTO + nome carimbado. Sem FK: o Fundo de Promoção
  -- (Q6·fund) e o Caixa (cash) penduram-se aqui sem este módulo conhecê-los.
  source_kind   text        not null check (length(btrim(source_kind)) > 0),
  source_ref    uuid,
  source_name   text        not null default '',
  total_cents   bigint      not null check (total_cents > 0),
  currency      char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  competence_on date        not null,
  note          text        not null default '',
  reason        text        not null default '',
  executed_at   timestamptz not null default now(),
  executed_by   uuid        references auth.users (id) on delete set null,
  constraint cc_executions_id_tenant unique (id, tenant_id),
  constraint cc_executions_rule_fk
    foreign key (rule_id, tenant_id)
    references cc.rules (id, tenant_id) on delete restrict
);

create index cc_executions_book_idx
  on cc.executions (tenant_id, competence_on desc, seq desc);

create table cc.allocations (
  id           uuid   primary key default gen_random_uuid(),
  tenant_id    uuid   not null references core.tenants (id) on delete cascade,
  execution_id uuid   not null,
  center_id    uuid   not null,
  -- Nome carimbado: a leitura sobrevive ao renome/arquivo do centro.
  center_name  text   not null,
  basis_points integer not null,
  amount_cents bigint not null,
  constraint cc_allocations_execution_fk
    foreign key (execution_id, tenant_id)
    references cc.executions (id, tenant_id) on delete restrict,
  constraint cc_allocations_center_fk
    foreign key (center_id, tenant_id)
    references cc.centers (id, tenant_id) on delete restrict
);

create index cc_allocations_by_execution on cc.allocations (tenant_id, execution_id);
create index cc_allocations_by_center on cc.allocations (tenant_id, center_id);

alter table cc.executions enable row level security;
alter table cc.executions force row level security;
alter table cc.allocations enable row level security;
alter table cc.allocations force row level security;

create policy cc_executions_select on cc.executions
  for select to authenticated using (cc.can_access(tenant_id));
create policy cc_allocations_select on cc.allocations
  for select to authenticated using (cc.can_access(tenant_id));

-- ⛔ Sem INSERT/UPDATE/DELETE de cliente no livro: quem escreve é a função.

create or replace function cc.guard_book_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro de rateio é fato consumado: não se edita nem se apaga. Corrigir é executar de novo, com razão.'
    using errcode = '42501';
end;
$$;

create trigger cc_executions_immutable
  before update or delete on cc.executions
  for each row execute function cc.guard_book_immutable();
create trigger cc_allocations_immutable
  before update or delete on cc.allocations
  for each row execute function cc.guard_book_immutable();

-- =============================================================================
-- 5. ⭐ EXECUTAR O RATEIO — o ato de gente, sem cron
-- -----------------------------------------------------------------------------
-- Distribui total_cents pela regra ativa. O RESTO da divisão vai ao último
-- centro (por seq de linha): nenhum centavo se perde — a mesma física do 100%.
-- =============================================================================

create or replace function cc.execution_payload(p cc.executions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'executionId',  p.id,
    'ruleId',       p.rule_id,
    'ruleName',     p.rule_name,
    'sourceKind',   p.source_kind,
    'sourceName',   p.source_name,
    'totalCents',   p.total_cents,
    'currency',     p.currency,
    'competenceOn', p.competence_on,
    'allocationCount', (select count(*) from cc.allocations a where a.execution_id = p.id)
  );
$$;

comment on function cc.execution_payload(cc.executions) is
  'O envelope de uma execução de rateio — AUTOSSUFICIENTE: regra e origem pelo NOME. Sem os valores por centro (payload leve). Quem escuta não faz join.';

create or replace function cc.execute_rateio(
  p_rule_id       uuid,
  p_source_kind   text,
  p_source_ref    uuid,
  p_source_name   text,
  p_total_cents   bigint,
  p_currency      char(3),
  p_competence_on date,
  p_note          text default '',
  p_reason        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule    cc.rules;
  v_exec_id uuid;
  v_line    record;
  v_acc     bigint := 0;
  v_amount  bigint;
  v_count   integer;
  v_i       integer := 0;
begin
  select * into v_rule from cc.rules where id = p_rule_id;
  if v_rule.id is null then
    raise exception 'regra não encontrada' using errcode = 'P0002';
  end if;

  if not cc.can_access(v_rule.tenant_id)
     or not core.has_permission(v_rule.tenant_id, 'cc.rateio.execute') then
    raise exception 'executar rateio exige a permissão cc.rateio.execute'
      using errcode = '42501';
  end if;

  if v_rule.status <> 'active' then
    raise exception 'só a regra ATIVA rateia: o rascunho não fecha 100%%, a arquivada saiu de uso'
      using errcode = '22023';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'o total a ratear é um valor positivo' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'a moeda é um código ISO' using errcode = '22023';
  end if;
  if p_source_kind is null or length(btrim(p_source_kind)) = 0 then
    raise exception 'a origem do rateio precisa de um tipo (de onde vem o valor)'
      using errcode = '22023';
  end if;

  insert into cc.executions (
    tenant_id, rule_id, rule_name, source_kind, source_ref, source_name,
    total_cents, currency, competence_on, note, reason, executed_by
  ) values (
    v_rule.tenant_id, v_rule.id, v_rule.name,
    btrim(p_source_kind), p_source_ref, coalesce(btrim(p_source_name), ''),
    p_total_cents, p_currency, p_competence_on,
    coalesce(p_note, ''), coalesce(p_reason, ''), (select auth.uid())
  )
  returning id into v_exec_id;

  select count(*) into v_count
    from cc.rule_lines where rule_id = v_rule.id and tenant_id = v_rule.tenant_id;

  for v_line in
    select rl.center_id, rl.basis_points, c.name as center_name
      from cc.rule_lines rl
      join cc.centers c on c.id = rl.center_id and c.tenant_id = rl.tenant_id
     where rl.rule_id = v_rule.id and rl.tenant_id = v_rule.tenant_id
     order by rl.basis_points desc, rl.center_id
  loop
    v_i := v_i + 1;
    if v_i = v_count then
      -- ⭐ O último leva o RESTO: nenhum centavo se perde no arredondamento.
      v_amount := p_total_cents - v_acc;
    else
      v_amount := (p_total_cents * v_line.basis_points) / 10000;
      v_acc := v_acc + v_amount;
    end if;

    insert into cc.allocations (
      tenant_id, execution_id, center_id, center_name, basis_points, amount_cents
    ) values (
      v_rule.tenant_id, v_exec_id, v_line.center_id, v_line.center_name,
      v_line.basis_points, v_amount
    );
  end loop;

  perform cc.emit_event(
    v_rule.tenant_id, 'cc.rateio.executed',
    cc.execution_payload((select e from cc.executions e where e.id = v_exec_id))
  );

  return v_exec_id;
end;
$$;

comment on function cc.execute_rateio(uuid, text, uuid, text, bigint, char, date, text, text) is
  'Executa a regra ATIVA sobre um total, gerando lançamentos imutáveis (um por centro). O resto da divisão vai ao último centro — cent nenhum se perde. Origem por id solto + nome. Corrigir é executar de novo com razão.';

-- =============================================================================
-- 6. AS VISÕES — consequência calculada, jamais coluna
-- =============================================================================

create view cc.by_center
  with (security_invoker = true)
as
select a.tenant_id,
       a.center_id,
       a.center_name,
       e.currency,
       sum(a.amount_cents)  as allocated_cents,
       count(*)             as allocation_count
  from cc.allocations a
  join cc.executions e on e.id = a.execution_id and e.tenant_id = a.tenant_id
 group by a.tenant_id, a.center_id, a.center_name, e.currency;

comment on view cc.by_center is
  'O rateado acumulado por centro e moeda — soma do livro. security_invoker: a RLS decide o que entra.';

-- =============================================================================
-- 7. OS FATOS
-- =============================================================================

create or replace function cc.center_payload(p cc.centers)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('centerId', p.id, 'name', p.name, 'status', p.status);
$$;

create or replace function cc.on_center_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cc.emit_event(new.tenant_id, 'cc.center.registered', cc.center_payload(new));
  return new;
end;
$$;

create trigger cc_centers_emit_registered
  after insert on cc.centers
  for each row execute function cc.on_center_registered();

create or replace function cc.on_center_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform cc.emit_event(new.tenant_id, 'cc.center.archived', cc.center_payload(new));
  end if;
  return new;
end;
$$;

create trigger cc_centers_emit_changed
  after update on cc.centers
  for each row execute function cc.on_center_changed();

create or replace function cc.on_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status <> 'active' then
    perform cc.emit_event(new.tenant_id, 'cc.rule.activated', jsonb_build_object(
      'ruleId', new.id, 'ruleName', new.name
    ));
  end if;
  return new;
end;
$$;

create trigger cc_rules_emit_changed
  after update on cc.rules
  for each row execute function cc.on_rule_changed();

-- =============================================================================
-- 8. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema cc                  from public, anon, authenticated;
revoke all on all tables    in schema cc from public, anon, authenticated;
revoke all on all functions in schema cc from public, anon, authenticated;

grant usage on schema cc to authenticated;

grant select, insert, update on cc.centers to authenticated;
grant select, insert, update on cc.rules   to authenticated;
grant select, insert, update, delete on cc.rule_lines to authenticated;

-- ⛔ SÓ SELECT no livro: quem escreve é cc.execute_rateio().
grant select on cc.executions  to authenticated;
grant select on cc.allocations to authenticated;
grant select on cc.by_center   to authenticated;

grant execute on function cc.can_access(uuid) to authenticated;
grant execute on function cc.execute_rateio(uuid, text, uuid, text, bigint, char, date, text, text) to authenticated;

-- `cc.emit_event` e os payloads NÃO são concedidos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT no livro. Nenhum cron. Nenhuma FK cruzada. Nenhum
-- vocabulário de vertical. Nenhum objeto fora de `cc`. Nenhuma leitura de
-- schema alheio.
-- =============================================================================
