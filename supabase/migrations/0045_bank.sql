-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0045_bank.sql
-- Módulo 30: Contas Bancárias. Schema `bank`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §20,
-- depois do `0044_bud.sql`.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Bancos / Contas bancárias*.
-- Spec: docs/canon/MODULO-BANK-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ SOL ÚNICO: A CONCILIAÇÃO JÁ EXISTE — este módulo NÃO a refaz
-- -----------------------------------------------------------------------------
-- A mesa de conciliação, o parser de OFX/CSV e o casamento extrato×título são
-- do `recon` (Módulo 1, migrations `0011`–`0014`), PROVADOS e no ar. Refazê-los
-- aqui seria uma segunda fonte de verdade para o mesmo fato — o pecado que o
-- Sol Único proíbe. **Este módulo é o CADASTRO das contas e o LIVRO de
-- movimentos por conta** — a capacidade *Bancos* que o `cash` explicitamente
-- deixou de fora (o cabeçalho do `0029` diz: "Multi-conta ESTRUTURADA … é
-- capacidade própria — *Bancos*"). Concilia-se no `recon`; cadastra-se e
-- movimenta-se a conta aqui.
--
-- -----------------------------------------------------------------------------
-- ⭐ A CONTA É DADO DO TENANT — e volta do arquivo (o argumento do crm/cash)
-- -----------------------------------------------------------------------------
-- `bank.accounts`: apelido LIVRE, banco/agência/número em texto (o banco de um
-- país e de uma década não vira enum). `archived → active` EXISTE: a conta
-- reativada é a MESMA conta, e partir o extrato em duas mentiria em todo saldo
-- que soma o antes e o depois. Cada conta tem UMA moeda — dinheiro e moeda
-- andam juntos.
--
-- -----------------------------------------------------------------------------
-- ⭐ O SALDO NEGATIVO É PERMITIDO — o DIVERGE consciente, assinado
-- -----------------------------------------------------------------------------
-- O saldo é a SOMA do livro (view, nunca coluna). Não há constraint que o
-- proíba de ficar negativo, e isso é DECISÃO, não descuido: cheque especial e
-- conta garantida são produtos bancários REAIS — uma conta pode, legitimamente,
-- estar negativa. Recusar o lançamento que deixa o saldo abaixo de zero
-- obrigaria o operador a MENTIR sobre o que o banco mostra. É a física do `inv`
-- (saldo negativo permitido, o overpay do `ar` re-perguntado para o estoque),
-- agora re-perguntada para o DINHEIRO NA CONTA. Há teste que assina o contraste.
--
-- -----------------------------------------------------------------------------
-- ⭐ A TRANSFERÊNCIA É ATÔMICA — dois lançamentos, uma transação, um só id
-- -----------------------------------------------------------------------------
-- Transferir entre contas é uma SAÍDA numa e uma ENTRADA na outra, ligadas por
-- um `transfer_id`, gravadas na MESMA transação por `bank.transfer()`. Nunca
-- meia-transferência: ou as duas pernas entram, ou nenhuma. O livro continua
-- imutável — corrigir é transferir de volta, não editar.
--
-- ⭐ **Vínculo com o mundo por ID SOLTO + nome carimbado, nunca FK cruzada:**
-- `counterparty_name` é texto; `external_ref` é o id solto do documento de
-- origem. Casar por FK com um módulo alheio quebraria a Lei do Lego.
--
-- `consumes` **VAZIO** e honesto (Lei 7): lançar por consumo de `cash`/`ap`/
-- `ar` cairia na DUPLA CONTAGEM que o `cash §5` declarou sem regra de
-- exclusividade de fonte. Caminho declarado na spec §5.
-- =============================================================================

create schema if not exists bank;

comment on schema bank is
  'Módulo Contas Bancárias. Domain finance da Taxonomia. Cadastro de contas (dado do tenant, volta do arquivo) e livro de movimentos por conta, imutável; saldo calculado; transferência atômica. NÃO refaz a conciliação (é do recon). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function bank.emit_event(
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
  if p_event_type not like 'bank.%' then
    raise exception 'bank.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'bank',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function bank.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function bank.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'bank.account.manage')
      or core.has_permission(p_tenant_id, 'bank.movement.register')
      or core.has_permission(p_tenant_id, 'bank.movement.adjust');
$$;

create or replace function bank.touch_updated_at()
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
-- 2. ACCOUNTS — as contas que o tenant cadastra; voltam do arquivo
-- =============================================================================

create table bank.accounts (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  name           text        not null check (length(btrim(name)) > 0),
  bank_name      text        not null default '',
  branch         text        not null default '',
  account_number text        not null default '',
  -- ⭐ Cada conta tem UMA moeda — dinheiro e moeda andam juntos.
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint bank_accounts_id_tenant unique (id, tenant_id)
);

-- Duas contas ATIVAS com o mesmo apelido só geram engano (btrim: espaço não é nome).
create unique index bank_accounts_unique_active_name
  on bank.accounts (tenant_id, lower(btrim(name)))
  where status = 'active';

create trigger bank_accounts_touch
  before update on bank.accounts
  for each row execute function bank.touch_updated_at();

alter table bank.accounts enable row level security;
alter table bank.accounts force row level security;

create policy bank_accounts_select on bank.accounts
  for select to authenticated
  using (bank.can_access(tenant_id));

create policy bank_accounts_insert on bank.accounts
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'bank.account.manage'));

create policy bank_accounts_update on bank.accounts
  for update to authenticated
  using (core.has_permission(tenant_id, 'bank.account.manage'))
  with check (core.has_permission(tenant_id, 'bank.account.manage'));

-- ⛔ Sem DELETE. Conta com livro é história; arquivar é status, e volta.

create or replace function bank.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function bank.allowed_transition(text, text) is
  'Ciclo de vida da conta. Espelho de ALLOWED_TRANSITIONS em @alsham/bank-accounts — há teste que lê este arquivo e compara.';

create or replace function bank.guard_account_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- A moeda de uma conta com livro não muda — reclassificaria o passado.
    if new.currency is distinct from old.currency then
      raise exception 'a moeda da conta não muda: a conta em outra moeda é conta nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not bank.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da conta', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger bank_accounts_guard_status
  before update on bank.accounts
  for each row execute function bank.guard_account_transition();

-- =============================================================================
-- 3. MOVEMENTS — ⭐ O LIVRO POR CONTA, E ELE É IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- O sinal é do TIPO (o desenho do inv/cash). A transferência liga duas pernas
-- por `transfer_id`. Vínculo com o mundo por id solto + nome carimbado.
-- =============================================================================

create table bank.movements (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  account_id          uuid        not null,
  kind                text        not null check (kind in ('in', 'out', 'adjustment')),
  amount_cents        bigint      not null,
  signed_amount_cents bigint      generated always as (
                        case when kind = 'out' then -amount_cents else amount_cents end
                      ) stored,
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  description         text        not null default '',
  reason              text        not null default '',
  -- ⭐ Vínculo por id solto + nome carimbado — nunca FK cruzada.
  counterparty_name   text        not null default '',
  external_ref        text,
  -- ⭐ Liga as duas pernas de uma transferência; nulo em lançamento avulso.
  transfer_id         uuid,
  occurred_on         date        not null default current_date,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  constraint bank_movements_account_fk
    foreign key (account_id, tenant_id)
    references bank.accounts (id, tenant_id) on delete restrict,
  constraint bank_movements_amount_signal check (
    (kind in ('in', 'out') and amount_cents > 0) or
    (kind = 'adjustment'   and amount_cents <> 0)
  ),
  -- Ajuste sem razão é a linha muda que esconde o desvio (a lição do inv/cash).
  constraint bank_movements_adjustment_reason check (
    kind <> 'adjustment' or length(btrim(reason)) > 0
  ),
  -- ⭐ O futuro é recusado — dinheiro que "vai mover" é previsão (Orçamento),
  -- não extrato. O DIVERGE do inv mantido com o cash (irmãos de dinheiro).
  constraint bank_movements_not_future check (occurred_on <= current_date)
);

create index bank_movements_ledger_idx
  on bank.movements (tenant_id, account_id, occurred_on desc, created_at desc);
create index bank_movements_transfer_idx
  on bank.movements (tenant_id, transfer_id)
  where transfer_id is not null;

alter table bank.movements enable row level security;
alter table bank.movements force row level security;

create policy bank_movements_select on bank.movements
  for select to authenticated
  using (bank.can_access(tenant_id));

-- ⭐ A permissão depende do TIPO (o desenho do inv/cash): lançar entrada/saída
-- é operação; AJUSTAR reescreve a conta — quem lança não é quem confere.
create policy bank_movements_insert on bank.movements
  for insert to authenticated
  with check (
    (kind in ('in', 'out') and core.has_permission(tenant_id, 'bank.movement.register'))
    or
    (kind = 'adjustment'   and core.has_permission(tenant_id, 'bank.movement.adjust'))
  );

-- ⛔ Sem policy de UPDATE e sem policy de DELETE — camada 1 da imutabilidade.

create or replace function bank.guard_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro da conta é registro de fato consumado: não se edita nem se apaga. Corrigir é lançar um AJUSTE com a razão; desfazer transferência é transferir de volta.'
    using errcode = '42501';
end;
$$;

create trigger bank_movements_immutable
  before update or delete on bank.movements
  for each row execute function bank.guard_ledger_immutable();

-- A conta arquivada não recebe lançamento; a moeda do lançamento é a da conta.
create or replace function bank.guard_movement_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_currency char(3);
begin
  select status, currency into v_status, v_currency
    from bank.accounts
   where id = new.account_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'conta % não existe neste tenant', new.account_id using errcode = '23503';
  end if;
  if v_status <> 'active' then
    raise exception 'conta arquivada não recebe lançamento: reative-a primeiro'
      using errcode = '22023';
  end if;
  if new.currency <> v_currency then
    raise exception 'a moeda do lançamento (%) não é a da conta (%)', new.currency, v_currency
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger bank_movements_guard_account
  before insert on bank.movements
  for each row execute function bank.guard_movement_account();

-- =============================================================================
-- 4. O SALDO — CONSEQUÊNCIA CALCULADA POR CONTA, JAMAIS COLUNA
-- -----------------------------------------------------------------------------
-- ⚠️ security_invoker: sem ela a view somaria o saldo de todos os tenants.
-- ⭐ Nenhum filtro de sinal: o saldo PODE ser negativo (cheque especial), e a
-- view não mente sobre isso.
-- =============================================================================

create view bank.balances
  with (security_invoker = true)
as
select m.tenant_id,
       m.account_id,
       a.name                                                        as account_name,
       m.currency,
       sum(m.signed_amount_cents)                                    as balance_cents,
       sum(case when m.signed_amount_cents > 0 then m.signed_amount_cents else 0 end) as inflow_cents,
       sum(case when m.signed_amount_cents < 0 then -m.signed_amount_cents else 0 end) as outflow_cents,
       count(*)                                                      as movement_count,
       max(m.occurred_on)                                            as last_movement_on
  from bank.movements m
  join bank.accounts a on a.id = m.account_id and a.tenant_id = m.tenant_id
 group by m.tenant_id, m.account_id, a.name, m.currency;

comment on view bank.balances is
  'O saldo por conta = soma do livro. Calculado, nunca coluna. PODE ser negativo (cheque especial). security_invoker: a RLS decide o que entra na soma.';

-- =============================================================================
-- 5. ⭐ A TRANSFERÊNCIA — atômica, duas pernas, um transfer_id
-- -----------------------------------------------------------------------------
-- Uma saída na origem e uma entrada no destino, na MESMA transação. Checa a
-- permissão de lançar, as duas contas do mesmo tenant, ativas e na mesma moeda.
-- =============================================================================

create or replace function bank.transfer(
  p_from_account uuid,
  p_to_account   uuid,
  p_amount_cents bigint,
  p_occurred_on  date,
  p_description  text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_from_status text; v_from_currency char(3);
  v_to_tenant uuid; v_to_status text; v_to_currency char(3);
  v_transfer uuid := gen_random_uuid();
begin
  if p_from_account = p_to_account then
    raise exception 'transferência exige contas diferentes' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'o valor da transferência é positivo' using errcode = '22023';
  end if;
  if p_occurred_on is null or p_occurred_on > current_date then
    raise exception 'transferência não é agendamento: a data não é futura' using errcode = '22023';
  end if;

  select tenant_id, status, currency into v_tenant, v_from_status, v_from_currency
    from bank.accounts where id = p_from_account;
  select tenant_id, status, currency into v_to_tenant, v_to_status, v_to_currency
    from bank.accounts where id = p_to_account;

  if v_tenant is null or v_to_tenant is null then
    raise exception 'conta de origem ou destino não existe' using errcode = '23503';
  end if;
  if v_tenant <> v_to_tenant then
    raise exception 'as duas contas têm de ser do mesmo tenant' using errcode = '42501';
  end if;
  if not core.has_permission(v_tenant, 'bank.movement.register') then
    raise exception 'transferir exige a permissão bank.movement.register' using errcode = '42501';
  end if;
  if v_from_status <> 'active' or v_to_status <> 'active' then
    raise exception 'transferência exige as duas contas ativas' using errcode = '22023';
  end if;
  if v_from_currency <> v_to_currency then
    raise exception 'transferência entre moedas diferentes exige câmbio — não construído' using errcode = '22023';
  end if;

  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency, description, transfer_id, occurred_on, created_by)
  values (v_tenant, p_from_account, 'out', p_amount_cents, v_from_currency, p_description, v_transfer, p_occurred_on, (select auth.uid()));
  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency, description, transfer_id, occurred_on, created_by)
  values (v_tenant, p_to_account, 'in', p_amount_cents, v_to_currency, p_description, v_transfer, p_occurred_on, (select auth.uid()));

  perform bank.emit_event(v_tenant, 'bank.transfer.executed', jsonb_build_object(
    'transferId',  v_transfer,
    'fromAccount', p_from_account,
    'toAccount',   p_to_account,
    'amountCents', p_amount_cents,
    'currency',    v_from_currency,
    'occurredOn',  p_occurred_on,
    'description', p_description
  ));

  return v_transfer;
end;
$$;

comment on function bank.transfer(uuid, uuid, bigint, date, text) is
  'Transfere entre duas contas do mesmo tenant: uma saída e uma entrada, mesma transação, mesmo transfer_id. Checa permissão, contas ativas e mesma moeda.';

-- =============================================================================
-- 6. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function bank.account_payload(p bank.accounts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'accountId',     p.id,
    'name',          p.name,
    'bankName',      p.bank_name,
    'branch',        p.branch,
    'accountNumber', p.account_number,
    'currency',      p.currency,
    'status',        p.status
  );
$$;

create or replace function bank.movement_payload(p bank.movements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'movementId',        p.id,
    'accountId',         p.account_id,
    'kind',              p.kind,
    'amountCents',       p.amount_cents,
    'signedAmountCents', p.signed_amount_cents,
    'currency',          p.currency,
    'description',       p.description,
    'reason',            p.reason,
    'counterpartyName',  p.counterparty_name,
    'externalRef',       p.external_ref,
    'transferId',        p.transfer_id,
    'occurredOn',        p.occurred_on
  );
$$;

create or replace function bank.on_account_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform bank.emit_event(new.tenant_id, 'bank.account.registered', bank.account_payload(new));
  return new;
end;
$$;

create trigger bank_accounts_emit_registered
  after insert on bank.accounts
  for each row execute function bank.on_account_registered();

create or replace function bank.on_account_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform bank.emit_event(new.tenant_id, 'bank.account.archived', bank.account_payload(new));
  end if;
  return new;
end;
$$;

create trigger bank_accounts_emit_changed
  after update on bank.accounts
  for each row execute function bank.on_account_changed();

create or replace function bank.on_movement_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform bank.emit_event(new.tenant_id, 'bank.movement.registered', bank.movement_payload(new));
  return new;
end;
$$;

create trigger bank_movements_emit_registered
  after insert on bank.movements
  for each row execute function bank.on_movement_registered();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema bank                  from public, anon, authenticated;
revoke all on all tables    in schema bank from public, anon, authenticated;
revoke all on all functions in schema bank from public, anon, authenticated;

grant usage on schema bank to authenticated;

grant select, insert, update on bank.accounts to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro. Editar e apagar não existem — camada 2.
grant select, insert on bank.movements to authenticated;

grant select on bank.balances to authenticated;

grant execute on function bank.can_access(uuid) to authenticated;
-- ⭐ A transferência é operação de tela — concedida; ela checa a permissão dentro.
grant execute on function bank.transfer(uuid, uuid, bigint, date, text) to authenticated;

-- `bank.emit_event` e os payloads são encanamento dos gatilhos, não API de
-- tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de saldo. Nenhuma FK cruzada. Nenhuma conciliação
-- refeita. Nenhum objeto fora de `bank`. Nenhuma leitura de schema alheio.
-- O saldo é calculado e pode ser negativo; a transferência é atômica.
-- =============================================================================
