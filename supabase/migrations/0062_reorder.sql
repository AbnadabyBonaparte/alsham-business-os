-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0062_reorder.sql
-- Módulo 47: Estoque Mínimo (ponto de reabastecimento). Schema `reorder`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §23, o
-- quinto e ÚLTIMO módulo da Onda Dez (Fase 2 — completar o Domain Compras).
-- Fecha o `domain_key='procurement'`, ao lado de `po` e `vendor`.
--
-- Taxonomia: Domain 📦 Compras — capacidade *Estoque mínimo* (§5). A Store o
-- exibe na galeria "Domínios Universais", na seção Compras, ao lado do `po`
-- e do `vendor`.
-- Spec: docs/canon/MODULO-REORDER-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO-ESTRELA: ESTE MÓDULO NÃO LÊ O `inv` POR DENTRO
-- -----------------------------------------------------------------------------
-- *Estoque mínimo* é reposição — DECISÃO DE COMPRA, não de contagem. O próprio
-- `inv` (Módulo 8) declara esse homônimo como sendo de COMPRAS. Então este
-- módulo guarda SÓ A CONFIGURAÇÃO: o produto (texto livre) + a quantidade
-- mínima desejada, com um vínculo SOLTO (`inv_item_id` + nome carimbado) ao
-- item de estoque, quando houver um.
--
-- A comparação "estoque atual < mínimo" NÃO acontece aqui. Não existe view que
-- faça join entre `reorder` e o schema de estoque, não existe leitura de livro
-- de movimentos neste arquivo, não existe nem o prefixo desse schema. A
-- comparação vive na CAMADA DE APRESENTAÇÃO (um Server Action do portal, em
-- TypeScript), que recebe o saldo do estoque por fora e o confronta com a regra
-- pela função pura `needsReorder()` do pacote.
-- É a Lei do Lego levada ao limite: "módulo não conhece módulo" — o acoplamento
-- é ZERO, não é nem por evento; é só um id solto que a tela sabe resolver.
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` EXISTE — re-perguntado, e o DIVERGE do `hr` assinado
-- -----------------------------------------------------------------------------
-- Copiar o `vendor` "por consistência" seria erro; copiar sem pensar e divergir
-- sem escrever são o mesmo erro (CLAUDE.md). A pergunta foi refeita: a regra de
-- estoque mínimo é FATO CONSUMADO (física do `occ`, imutável) ou CONFIGURAÇÃO
-- que a empresa liga e desliga conforme a estação? É configuração: um produto
-- que saiu de linha e volta a ser reposto usa a MESMA regra — obrigá-la a
-- renascer partiria o histórico da parametrização. Então `archived → active`
-- EXISTE, como no `vendor`. O contraste reorder×hr é assinado em teste.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA produto/categoria TEXTO LIVRE + quantidade mínima (o ponto de
--      reabastecimento é número universal de qualquer estoque).
--   ❌ NÃO ENTRA cálculo de lote econômico, lead time do fornecedor, geração
--      automática de pedido de compra (é ATO DE GENTE — a sugestão surge na
--      tela; comprar é o `po`, por decisão manual), nem a leitura do saldo
--      (é do `inv`, na tela).
-- =============================================================================

create schema if not exists reorder;

comment on schema reorder is
  'Módulo Estoque Mínimo. Domain procurement (Compras) da Taxonomia. Guarda SÓ a configuração do ponto de reabastecimento: produto texto livre + quantidade mínima, com vínculo SOLTO (inv_item_id) ao item de estoque. NÃO lê o inv — a comparação estoque < mínimo é da camada de apresentação. active ↔ archived existe (a regra é configuração que volta — o DIVERGE do hr). consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima sétima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function reorder.emit_event(
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
  if p_event_type not like 'reorder.%' then
    raise exception 'reorder.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'reorder',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function reorder.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function reorder.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'reorder.rule.manage')
      or core.has_permission(p_tenant_id, 'reorder.rule.decide');
$$;

create or replace function reorder.touch_updated_at()
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
-- 2. RULES — as regras de estoque mínimo
-- -----------------------------------------------------------------------------
-- ⭐ `inv_item_id` é vínculo SOLTO: uuid nullable, SEM foreign key para o
-- estoque (não existe, e não pode existir — módulo não conhece módulo). O nome
-- do item é carimbado como texto livre pela tela, o que faz a regra sobreviver
-- ao arquivamento do item lá do outro lado.
-- =============================================================================

create table reorder.rules (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Produto/categoria TEXTO LIVRE — vocabulário de cada compra. OBRIGATÓRIO.
  product          text        not null check (length(btrim(product)) > 0),
  -- ⭐ Vínculo SOLTO ao item de estoque, quando houver. SEM FK cruzada.
  inv_item_id      uuid,
  -- O nome do item carimbado pela tela — texto livre, sobrevive ao estoque.
  inv_item_name    text        not null default '',
  -- ⭐ O ponto de reabastecimento. CHECK na coluna: nunca negativo.
  minimum_quantity numeric     not null check (minimum_quantity >= 0),
  status           text        not null default 'active'
                   check (status in ('active', 'archived')),
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint reorder_rules_id_tenant unique (id, tenant_id)
);

create index reorder_rules_roster_idx
  on reorder.rules (tenant_id, status, product);

create trigger reorder_rules_touch
  before update on reorder.rules
  for each row execute function reorder.touch_updated_at();

alter table reorder.rules enable row level security;
alter table reorder.rules force row level security;

create policy reorder_rules_select on reorder.rules
  for select to authenticated
  using (reorder.can_access(tenant_id));

create policy reorder_rules_insert on reorder.rules
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'reorder.rule.manage'));

-- ⚠️ USING = can_access (não rule.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do vendor).
create policy reorder_rules_update on reorder.rules
  for update to authenticated
  using (reorder.can_access(tenant_id))
  with check (reorder.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Regra que saiu de uso é configuração —
-- arquivar é status, e `archived → active` existe (a regra volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVA, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function reorder.guard_rule_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a regra nasce ativa — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger reorder_rules_stamp
  before insert on reorder.rules
  for each row execute function reorder.guard_rule_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/reorder
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (a regra volta — o DIVERGE do hr).

create or replace function reorder.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function reorder.allowed_transition(text, text) is
  'Ciclo de vida da regra. Espelho de ALLOWED_TRANSITIONS em @alsham/reorder. active ↔ archived: a regra é configuração que volta (o DIVERGE do hr, onde terminated é terminal).';

create or replace function reorder.guard_rule_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not reorder.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da regra', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem a regra no cadastro vivo).
  if not core.has_permission(new.tenant_id, 'reorder.rule.decide') then
    raise exception 'arquivar ou reativar uma regra exige a permissão reorder.rule.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger reorder_rules_guard_status
  before update of status on reorder.rules
  for each row execute function reorder.guard_rule_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function reorder.rule_payload(r reorder.rules)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ruleId',          r.id,
    'product',         r.product,
    'invItemId',       r.inv_item_id,
    'invItemName',     r.inv_item_name,
    'minimumQuantity', r.minimum_quantity,
    'status',          r.status
  );
$$;

comment on function reorder.rule_payload(reorder.rules) is
  'O envelope de uma regra — AUTOSSUFICIENTE. Quem escuta não faz join. NÃO carrega saldo de estoque: o saldo é do inv, e este módulo não o conhece.';

create or replace function reorder.on_rule_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform reorder.emit_event(new.tenant_id, 'reorder.rule.registered', reorder.rule_payload(new));
  return new;
end;
$$;

create trigger reorder_rules_emit_registered
  after insert on reorder.rules
  for each row execute function reorder.on_rule_registered();

create or replace function reorder.on_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform reorder.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'reorder.rule.archived'
           else 'reorder.rule.reopened' end,
      reorder.rule_payload(new)
    );
    return new;
  end if;

  if new.product is distinct from old.product
     or new.inv_item_id is distinct from old.inv_item_id
     or new.inv_item_name is distinct from old.inv_item_name
     or new.minimum_quantity is distinct from old.minimum_quantity then
    perform reorder.emit_event(new.tenant_id, 'reorder.rule.updated', reorder.rule_payload(new));
  end if;

  return new;
end;
$$;

create trigger reorder_rules_emit_changed
  after update on reorder.rules
  for each row execute function reorder.on_rule_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema reorder                  from public, anon, authenticated;
revoke all on all tables    in schema reorder from public, anon, authenticated;
revoke all on all functions in schema reorder from public, anon, authenticated;

grant usage on schema reorder to authenticated;

grant select, insert, update on reorder.rules to authenticated;

grant execute on function reorder.can_access(uuid) to authenticated;

-- `reorder.emit_event` NÃO é concedida. `reorder.rule_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma leitura do schema de estoque (grep confere).
-- Nenhum nome de cliente. Nenhum objeto fora de `reorder`. `consumes` VAZIO.
-- =============================================================================
