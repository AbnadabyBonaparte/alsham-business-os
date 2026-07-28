-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0007_ap.sql
-- Módulo 3: Contas a Pagar. Schema `ap`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0006` e o seed estão aplicados em produção (informado
-- pelo dono). Aplicar é ato do dono — ver docs/runbook/APLICAR.md §8.
--
-- ⚠️ ESTE ARQUIVO SOZINHO NÃO FECHA O TRIÂNGULO. A projeção no `recon` vem em
-- `0008_recon_ap_projection.sql`, e a separação é deliberada: **cada migration
-- tem um schema dono.** Misturar os dois num arquivo só faria a guarda de CI
-- "módulo não conhece módulo" ter de aprender exceção — e guarda com exceção é
-- guarda que um dia aceita tudo.
--
-- Taxonomia: Domain `finance` (§5) — capacidade *Contas a pagar*.
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `ap`, E NÃO `accounts-payable`
-- -----------------------------------------------------------------------------
-- O CORE-SPEC define o tipo de evento como `<moduleId>.<agregado>.<fato>`, e o
-- cinto de `emit_event` confere justamente esse prefixo. Com os eventos e as
-- permissões em `ap.*`, o `module_id` **tem** de ser `ap`: qualquer outra
-- escolha faria a porta de saída recusar os próprios eventos do módulo.
--
-- O nome legível ("Contas a Pagar") vive no catálogo; o pacote se chama
-- `@alsham/accounts-payable`. Só o identificador é curto, e é ele que o
-- contrato exige que seja o prefixo.
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE ESTE MÓDULO FECHA
-- -----------------------------------------------------------------------------
-- O Módulo 1 provou que um módulo não toca o Core indevidamente.
-- O Módulo 2 provou que um módulo REAGE ao fato de outro sem conhecê-lo.
-- Este prova a terceira ponta: **o Módulo 1 vira CONSUMIDOR.**
--
-- `recon.payables` nasceu na Etapa 2 com `source = 'event'` e
-- `source_module_id` — construída **esperando** um módulo que ainda não
-- existia. Nenhuma linha do `0002_recon.sql` muda para que isso funcione: o
-- contrato estava certo desde o começo, e é essa a prova.
--
-- -----------------------------------------------------------------------------
-- O TESTE ANTI-VIÉS, CAMPO A CAMPO
-- -----------------------------------------------------------------------------
-- Contas a Pagar é onde a tentação brasileira mora: boleto, PIX, código de
-- barras, banco homologado. Nada disso entrou, e o porquê está em cada tabela.
-- =============================================================================

create schema if not exists ap;

comment on schema ap is
  'Módulo Contas a Pagar. Domain finance da Taxonomia. Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- Terceira vez que este bloco aparece, e é o ponto: o padrão virou lei (§5.5).
-- =============================================================================

create or replace function ap.emit_event(
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
  if p_event_type not like 'ap.%' then
    raise exception 'ap.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ap',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ap.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function ap.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ap.payable.manage')
      or core.has_permission(p_tenant_id, 'ap.payable.cancel');
$$;

create or replace function ap.touch_updated_at()
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
-- 2. PAYABLES — o título a pagar
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado — e aqui a tentação é grande:
--
--   ✅ ENTRA `external_ref`: a referência do documento no sistema/nota de
--      origem. Texto opaco, escolhido pelo tenant. É também a chave de
--      idempotência de quem projetar este título em outro lugar.
--   ✅ ENTRA `amount_cents bigint` POSITIVO. Inteiro em centavos: universal e
--      sem erro de ponto flutuante. O sinal é de quem lê o extrato, não daqui.
--   ✅ ENTRA `currency` ISO 4217, **sem default** — moeda presumida é viés de
--      país, e este módulo nasce servindo qualquer um.
--   ✅ ENTRA `counterparty_tax_id` — nome NEUTRO de propósito. Chamar de
--      `cnpj` amarraria o produto ao Brasil. É "identificador fiscal da
--      contraparte", e cada país põe o seu. Mesma decisão do `recon`.
--   ✅ ENTRA `payment_method` como TEXTO LIVRE.
--
--   ❌ NÃO ENTRA boleto, PIX, código de barras, linha digitável, chave de
--      pagamento. São **instrumentos de pagamento de um país**, e alguns nem
--      existiam há dez anos. Um schema com coluna `codigo_de_barras` é um
--      schema que envelhece e que não serve o cliente de fora. A forma de
--      pagar é `payment_method`, texto — e a integração de pagamento é
--      Lei 3 (INTEGRAR, não construir).
--   ❌ NÃO ENTRA banco, agência, conta, lista de bancos homologados. A
--      capacidade *Bancos* é outra peça do Domain Financeiro.
--   ❌ NÃO ENTRA plano de contas, centro de custo, natureza de despesa,
--      rateio. São capacidades próprias (§5), de outros módulos.
--   ❌ NÃO ENTRA alçada de aprovação nem política de pagamento. Quem aprova é
--      *Aprovações financeiras* — capacidade do Módulo 1 —, e a POLÍTICA é
--      `settings` do tenant. A mesma lição que o recon pagou.
--   ❌ NÃO ENTRA parcelamento como estrutura. Parcela é um título com a sua
--      própria data e o seu próprio valor: modelar "parcela 3 de 12" aqui
--      duplicaria a linha e criaria dois lugares para a mesma verdade.
--
-- ⚠️ Cancelar é STATUS, nunca `delete`. Título apagado é conta paga sem
-- documento — e a policy de DELETE não existe, então nem por engano.
-- =============================================================================

create table ap.payables (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- A referência do documento no sistema de origem. Opaca para a plataforma.
  external_ref   text        not null check (length(btrim(external_ref)) > 0),
  due_date       date        not null,
  -- Sempre POSITIVO: é o valor devido.
  amount_cents   bigint      not null check (amount_cents > 0),
  settled_amount_cents bigint not null default 0 check (settled_amount_cents >= 0),
  -- ISO 4217. Sem default de propósito.
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  supplier_name  text,
  -- Identificador fiscal da contraparte. Neutro de país, como no recon.
  counterparty_tax_id text,
  description    text        not null default '',
  -- Como se pretende pagar. TEXTO LIVRE — ver ANTI-VIÉS acima.
  payment_method text,
  status         text        not null default 'open'
                 check (status in ('open', 'partially_settled', 'settled', 'cancelled')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  -- Não se paga mais do que se deve.
  constraint payables_no_overpay check (settled_amount_cents <= amount_cents),
  -- O estado e o valor liquidado contam a mesma história, ou um dos dois mente.
  constraint payables_status_coherent check (
    (status = 'open'              and settled_amount_cents = 0) or
    (status = 'partially_settled' and settled_amount_cents > 0
                                  and settled_amount_cents < amount_cents) or
    (status = 'settled'           and settled_amount_cents = amount_cents) or
    (status = 'cancelled')
  ),
  -- ⭐ A CHAVE DE IDEMPOTÊNCIA DO TRIÂNGULO.
  --
  -- O mesmo documento não entra duas vezes no tenant — e é este par que quem
  -- projetar o título em outro módulo vai usar para não duplicar. `recon` já
  -- tem o mesmo `unique (tenant_id, external_ref)` desde a Etapa 2, sem nunca
  -- ter sabido que este módulo existiria.
  constraint payables_unique_ref unique (tenant_id, external_ref)
);

create index payables_open_idx
  on ap.payables (tenant_id, due_date)
  where status in ('open', 'partially_settled');
create index payables_taxid_idx
  on ap.payables (tenant_id, counterparty_tax_id)
  where counterparty_tax_id is not null;

create trigger payables_touch
  before update on ap.payables
  for each row execute function ap.touch_updated_at();

alter table ap.payables enable row level security;
alter table ap.payables force row level security;

create policy payables_select on ap.payables
  for select to authenticated
  using (ap.can_access(tenant_id));

create policy payables_insert on ap.payables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ap.payable.manage'));

-- Editar exige `manage`. A separação real de quem CANCELA está no trigger de
-- §2.2 — policy de UPDATE não enxerga o `old` e não distingue "corrigiu a data"
-- de "matou o título". Mesma decisão do `marketing`.
create policy payables_update on ap.payables
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'ap.payable.manage')
    or core.has_permission(tenant_id, 'ap.payable.cancel')
  )
  with check (
    core.has_permission(tenant_id, 'ap.payable.manage')
    or core.has_permission(tenant_id, 'ap.payable.cancel')
  );

-- ⛔ Sem policy de DELETE, e é a linha mais importante desta tabela.
-- Cancelar é `status = 'cancelled'`. Título apagado é conta paga sem documento.

-- -----------------------------------------------------------------------------
-- 2.1 ⭐ AS TRANSIÇÕES PERMITIDAS — a mesma tabela que o domínio TypeScript
-- -----------------------------------------------------------------------------
-- Esta função é a **fonte única** do ciclo de vida do título, e existe escrita
-- assim — uma lista literal de pares — porque o pacote `@alsham/accounts-payable`
-- declara exatamente a mesma lista, e há um teste que LÊ ESTE ARQUIVO e compara.
-- Se as duas divergirem, o teste quebra.
--
-- Não é duplicação por descuido; é a Regra de Ouro levada a sério. Schema é
-- patrimônio, e regra que só existe no TypeScript não protege quem escreve SQL
-- à mão. Regra que só existe no SQL não protege a tela antes do round-trip. As
-- duas existem, e a terceira peça — o teste — garante que contem a mesma coisa.
--
-- O que a tabela diz, e por quê:
--
--   open → partially_settled | settled     pagou em parte, pagou tudo.
--   open → cancelled                       o documento não vale mais.
--   partially_settled → settled            terminou de pagar.
--   partially_settled → open               ESTORNO total do que foi pago.
--   partially_settled → cancelled          cancelar o saldo devedor.
--   settled → partially_settled | open     ESTORNO. Pagamento volta (devolução,
--                                          cheque sem fundo, chargeback).
--
--   ⛔ settled → cancelled NÃO EXISTE, e é decisão. Cancelar um título já pago
--      apagaria a fronteira entre "não devíamos isso" e "pagamos isso". Se o
--      pagamento tem de voltar, ele volta primeiro (estorno para `open`) e só
--      então o documento se cancela. Dois atos, dois registros.
--
--   ⛔ cancelled → nada. Terminal. Se voltarmos a dever, é documento NOVO, com
--      referência nova — não o mesmo título ressuscitado.
-- -----------------------------------------------------------------------------

create or replace function ap.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',              'partially_settled'),
    ('open',              'settled'),
    ('open',              'cancelled'),
    ('partially_settled', 'settled'),
    ('partially_settled', 'open'),
    ('partially_settled', 'cancelled'),
    ('settled',           'partially_settled'),
    ('settled',           'open')
  );
$$;

comment on function ap.allowed_transition(text, text) is
  'O ciclo de vida do título. Espelho exato de ALLOWED_TRANSITIONS em @alsham/accounts-payable — há teste que lê este arquivo e compara.';

-- -----------------------------------------------------------------------------
-- 2.2 O PORTEIRO DO ESTADO
-- Registrar um título e matá-lo são atos diferentes. O produto PERMITE que
-- sejam a mesma pessoa (as duas permissões no mesmo papel), mas não PRESUME.
-- -----------------------------------------------------------------------------

create or replace function ap.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not ap.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do título', old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'cancelled'
     and not core.has_permission(new.tenant_id, 'ap.payable.cancel') then
    raise exception 'cancelar título exige a permissão ap.payable.cancel'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger payables_guard_status
  before update of status on ap.payables
  for each row execute function ap.guard_status_transition();

-- =============================================================================
-- 3. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ **O PAYLOAD É AUTOSSUFICIENTE, E ISSO NÃO É ZELO — É A REGRA.**
--
-- Quem escuta **não pode fazer join**: o schema deste módulo é invisível para
-- ele, por policy e por lei. Se o payload não trouxer tudo o que o consumidor
-- precisa, o consumidor fica com um id que não sabe resolver — e a única saída
-- seria ler a tabela alheia, que é exatamente o que o Lego proíbe.
--
-- Por isso vão no envelope: referência, vencimento, valor, moeda, fornecedor,
-- identificador fiscal, descrição e estado. Tudo o que `recon.payables` precisa
-- para existir sem nunca ter visto `ap.payables`.
-- =============================================================================

create or replace function ap.payable_payload(p ap.payables)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'externalRef',         p.external_ref,
    'dueDate',             p.due_date,
    'amountCents',         p.amount_cents,
    'settledAmountCents',  p.settled_amount_cents,
    'currency',            p.currency,
    'supplierName',        p.supplier_name,
    'counterpartyTaxId',   p.counterparty_tax_id,
    'description',         p.description,
    'status',              p.status
  );
$$;

comment on function ap.payable_payload(ap.payables) is
  'O envelope de um título — AUTOSSUFICIENTE. Quem escuta não pode fazer join, então tudo o que ele precisa vai aqui.';

-- 3.1 `ap.payable.registered` — o título nasceu.
create or replace function ap.on_payable_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ap.emit_event(new.tenant_id, 'ap.payable.registered', ap.payable_payload(new));
  return new;
end;
$$;

create trigger payables_emit_registered
  after insert on ap.payables
  for each row execute function ap.on_payable_registered();

-- 3.2 `ap.payable.updated` — mudou algo que interessa a quem escuta.
--
-- ⚠️ Só o que MUDA O FATO. Corrigir a descrição não é fato para o mundo;
-- mudar valor, vencimento ou liquidação é. Emitir a cada `update` encheria a
-- caixa de saída de ruído — e o tenant paga por evento entregue.
create or replace function ap.on_payable_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    return new;   -- o cancelamento tem evento próprio (§3.3)
  end if;

  if new.amount_cents          is distinct from old.amount_cents
     or new.due_date           is distinct from old.due_date
     or new.settled_amount_cents is distinct from old.settled_amount_cents
     or new.status             is distinct from old.status then
    perform ap.emit_event(new.tenant_id, 'ap.payable.updated', ap.payable_payload(new));
  end if;

  return new;
end;
$$;

create trigger payables_emit_updated
  after update on ap.payables
  for each row execute function ap.on_payable_updated();

-- 3.3 `ap.payable.cancelled` — a ação destrutiva deste módulo.
create or replace function ap.on_payable_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  perform ap.emit_event(new.tenant_id, 'ap.payable.cancelled', ap.payable_payload(new));
  return new;
end;
$$;

create trigger payables_emit_cancelled
  after update of status on ap.payables
  for each row execute function ap.on_payable_cancelled();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- =============================================================================

revoke all on schema ap                from public, anon, authenticated;
revoke all on all tables    in schema ap from public, anon, authenticated;
revoke all on all functions in schema ap from public, anon, authenticated;

grant usage on schema ap to authenticated;

-- Sem DELETE. Nem por GRANT, nem por policy.
grant select, insert, update on ap.payables to authenticated;

grant execute on function ap.can_access(uuid) to authenticated;

-- `ap.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum objeto em core, recon ou marketing.
-- =============================================================================
