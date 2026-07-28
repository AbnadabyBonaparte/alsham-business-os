-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0010_ar.sql
-- Módulo 5: Contas a Receber. Schema `ar`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0009` e o seed estão aplicados em produção (informado
-- pelo dono). Aplicar é ato do dono — ver docs/runbook/APLICAR.md §10.
--
-- -----------------------------------------------------------------------------
-- AS DECISÕES DE CANON, ANTES DA PRIMEIRA TABELA
-- -----------------------------------------------------------------------------
-- **1. O `module_id` é `ar`.** Quinta vez que esta decisão aparece e já é
-- padrão: o CORE-SPEC define o evento como `<moduleId>.<agregado>.<fato>`, e o
-- cinto de `emit_event()` confere o prefixo. Com eventos e permissões em
-- `ar.*`, qualquer outro id faria a porta de saída recusar os próprios eventos.
--
-- **2. O `domain_key` é `finance`** — Taxonomia §5, "💰 Financeiro (19)", que
-- lista *Contas a pagar · **Contas a receber** · PIX · Boletos · …*. É o mesmo
-- Domain do Módulo 1 e do Módulo 3, e é assim que tem de ser: Domain é
-- classificação da Taxonomia, não fronteira de módulo.
--
-- =============================================================================
-- ⭐ ESTE ARQUIVO É UM ESPELHO CONSCIENTE DO `0007_ap.sql`
-- =============================================================================
--
-- Copiar sem pensar e divergir sem escrever são o mesmo erro. Então cada
-- decisão do Módulo 3 foi RE-PERGUNTADA aqui, e a resposta está escrita:
--
--   ✅ MANTIDO  `external_ref` único por tenant .... o documento não entra duas
--               vezes, e é a chave de idempotência de quem projetar. Vale igual.
--   ✅ MANTIDO  `amount_cents` inteiro e POSITIVO . o valor é o direito de
--               crédito. O sinal é de quem lê o extrato, não daqui.
--   ✅ MANTIDO  `currency` sem default ............ moeda presumida é viés de país.
--   ✅ MANTIDO  identificador fiscal NEUTRO ....... `counterparty_tax_id`, o
--               mesmo nome do `recon` e do `ap`. Quem paga não muda o país.
--   ✅ MANTIDO  cancelar é STATUS, nunca `delete` .. título apagado é dinheiro
--               que sumiu do registro. Sem GRANT e sem policy de DELETE.
--   ✅ MANTIDO  `cancelled` é TERMINAL ............ se voltarem a dever, é
--               documento novo, com referência nova.
--   ✅ MANTIDO  permissão própria para cancelar ... registrar e matar são atos
--               diferentes. O produto PERMITE que sejam a mesma pessoa.
--   ✅ MANTIDO  vencimento no passado NÃO é erro .. quem migra tem gaveta cheia.
--   ✅ MANTIDO  forma de recebimento TEXTO LIVRE .. ver o ANTI-VIÉS.
--   ✅ MANTIDO  `received → cancelled` NÃO EXISTE .. e aqui a pergunta foi feita
--               de novo, porque era a mais fácil de errar. No `ap`, cancelar um
--               título pago apagaria a fronteira entre "não devíamos" e
--               "pagamos". Aqui apagaria a fronteira entre "não tínhamos a
--               receber" e "**recebemos o dinheiro**" — e o segundo é mais
--               grave, porque o dinheiro entrou na conta. Se o recebimento tem
--               de voltar (devolução, estorno, chargeback), ele volta primeiro
--               e só então o documento se cancela. Dois atos, dois registros.
--
--   ⛔ DIVERGE  **RECEBER A MAIOR É PERMITIDO.** Ver §2.1. É a única divergência
--               de regra deste arquivo, e a razão está escrita lá.
--
-- -----------------------------------------------------------------------------
-- LEI 4 — O QUE SE MINEROU
-- -----------------------------------------------------------------------------
-- O Balanço Supabase registra `invoices` na pedreira do `alsham-core`
-- (Comercial+CX). Minerou-se a IDEIA, com uma distinção que precisa estar
-- escrita: **"invoice" não é "título a receber".** A nota fiscal é o documento;
-- o título é o direito de crédito. Uma nota parcelada gera vários títulos, e um
-- título pode existir sem nota nenhuma (adiantamento, acordo, reembolso).
--
-- Modelar `invoices` aqui amarraria o módulo ao documento fiscal de um país —
-- que é justamente o que a Lei 3 manda INTEGRAR, não construir.
--
-- ⚠️ **NÃO VERIFICADO:** este repositório não leu o schema real do
-- `alsham-core`. A mineração partiu do que o Balanço registra.
-- =============================================================================

create schema if not exists ar;

comment on schema ar is
  'Módulo Contas a Receber. Domain finance da Taxonomia. Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- =============================================================================

create or replace function ar.emit_event(
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
  if p_event_type not like 'ar.%' then
    raise exception 'ar.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ar',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ar.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function ar.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ar.receivable.manage')
      or core.has_permission(p_tenant_id, 'ar.receivable.cancel');
$$;

create or replace function ar.touch_updated_at()
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
-- 2. RECEIVABLES — o título a receber
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS — as mesmas recusas do Módulo 3, porque a tentação é a mesma
-- vestida do outro lado:
--
--   ❌ NÃO ENTRA boleto, PIX, carnê, código de barras, linha digitável, link de
--      pagamento. São **instrumentos de cobrança de um país**, e alguns nem
--      existiam há dez anos. Um schema com coluna `carne` é um schema que
--      envelhece e que não serve o cliente de fora. A forma de receber é
--      `settlement_method`, texto — e a integração de cobrança é Lei 3.
--   ❌ NÃO ENTRA banco, agência, conta, adquirente, bandeira de cartão.
--   ❌ NÃO ENTRA juros, multa, correção, desconto por antecipação, régua de
--      cobrança. **Política de cobrança é o processo de UMA empresa**, e a
--      capacidade *Cobrança* é outra peça do Domain Financeiro. O que entra é
--      quanto se tem a receber e quanto entrou.
--   ❌ NÃO ENTRA nota fiscal, série, natureza de operação, CFOP. Ver a nota de
--      Lei 4 no cabeçalho: título não é nota.
--   ❌ NÃO ENTRA parcelamento como estrutura. Parcela é um título com a sua
--      própria data e o seu próprio valor — mesma decisão do `ap`.
--   ❌ NÃO ENTRA score de crédito, limite, análise de risco do pagador.
--
--   ✅ ENTRA `payer_name` — quem deve. Nome diferente do `ap` (`supplier_name`)
--      porque o papel é outro; o TIPO é o mesmo.
--   ✅ ENTRA `counterparty_tax_id` — o MESMO nome do `recon` e do `ap`, e de
--      propósito: é o identificador fiscal de quem está do outro lado, e ele
--      não muda de natureza por estarmos recebendo em vez de pagando.
-- =============================================================================

create table ar.receivables (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- A referência do documento no sistema de origem. Opaca para a plataforma.
  external_ref   text        not null check (length(btrim(external_ref)) > 0),
  due_date       date        not null,
  -- Sempre POSITIVO: é o valor a receber.
  amount_cents   bigint      not null check (amount_cents > 0),
  received_amount_cents bigint not null default 0 check (received_amount_cents >= 0),
  -- ISO 4217. Sem default de propósito.
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  -- Quem deve. Opcional: há crédito a receber sem contraparte nomeada.
  payer_name     text,
  -- Identificador fiscal da contraparte. Mesmo nome do recon e do ap.
  counterparty_tax_id text,
  description    text        not null default '',
  -- Como se espera receber. TEXTO LIVRE — ver o ANTI-VIÉS acima.
  settlement_method text,
  status         text        not null default 'open'
                 check (status in ('open', 'partially_received', 'received', 'cancelled')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),

  -- ⭐⭐ A DIVERGÊNCIA — ver §2.1. NÃO há constraint de "não receber a maior".
  --
  -- O estado e o valor recebido contam a mesma história, ou um dos dois mente.
  -- Repare que `received` aceita `>=`, e não `=` como o `ap`.
  constraint receivables_status_coherent check (
    (status = 'open'               and received_amount_cents = 0) or
    (status = 'partially_received' and received_amount_cents > 0
                                   and received_amount_cents < amount_cents) or
    (status = 'received'           and received_amount_cents >= amount_cents) or
    (status = 'cancelled')
  ),

  -- A chave de idempotência, igual à do `ap`: o mesmo documento não entra duas
  -- vezes no tenant.
  constraint receivables_unique_ref unique (tenant_id, external_ref)
);

-- -----------------------------------------------------------------------------
-- 2.1 ⭐⭐ A DIVERGÊNCIA: RECEBER A MAIOR É PERMITIDO
-- -----------------------------------------------------------------------------
-- O `0007_ap.sql` tem, textualmente:
--
--     -- Não se paga mais do que se deve.
--     constraint payables_no_overpay check (settled_amount_cents <= amount_cents)
--
-- **Aqui essa constraint NÃO existe, e a ausência é a decisão mais importante
-- deste arquivo.**
--
-- Pagar a mais do que se deve é erro de quem paga, e o sistema que paga pode e
-- deve recusar. **Receber a mais não é erro de ninguém que esteja aqui dentro** —
-- é o que o pagador fez, e o dinheiro já está na conta. Acontece o tempo todo,
-- por motivos banais:
--
--   · o pagador arredondou para cima;
--   · pagou com juros ou multa por atraso, que este módulo não modela
--     (política de cobrança é outra capacidade — ver o ANTI-VIÉS);
--   · quitou dois documentos numa transferência só, contra uma referência só;
--   · pagou em moeda com conversão e sobrou.
--
-- Se o banco recusasse, o operador teria de **mentir sobre o que entrou** —
-- registrar menos do que recebeu para caber na constraint. Um sistema que
-- obriga o operador a mentir para funcionar é pior do que um sistema que aceita
-- a verdade e a mostra.
--
-- Consequências assumidas, e as três estão cobertas:
--
--   1. `received_amount_cents` pode passar de `amount_cents`, e o estado
--      continua `received` — está no `check` acima, com `>=`;
--   2. o saldo a receber vira NEGATIVO nesse caso, e o domínio devolve **zero**
--      em vez de número negativo (`outstandingCents`), porque "a receber" não
--      fica devendo — o excedente é crédito do pagador, e tratá-lo é a
--      capacidade *Cobrança*, **NÃO CONSTRUÍDA**;
--   3. quem escuta o evento recebe os dois números e decide sozinho.
--
-- ⚠️ **Isto NÃO é "o ap está errado".** Lá a constraint está certa pelo mesmo
-- motivo que aqui ela está ausente: nos dois casos o schema recusa o que o
-- sistema controla e aceita o que o mundo impõe.
-- =============================================================================

create index receivables_open_idx
  on ar.receivables (tenant_id, due_date)
  where status in ('open', 'partially_received');
create index receivables_taxid_idx
  on ar.receivables (tenant_id, counterparty_tax_id)
  where counterparty_tax_id is not null;

create trigger receivables_touch
  before update on ar.receivables
  for each row execute function ar.touch_updated_at();

alter table ar.receivables enable row level security;
alter table ar.receivables force row level security;

create policy receivables_select on ar.receivables
  for select to authenticated
  using (ar.can_access(tenant_id));

create policy receivables_insert on ar.receivables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ar.receivable.manage'));

-- Editar exige `manage`. A separação real de quem CANCELA está no trigger de
-- §2.3 — policy de UPDATE não enxerga o `old` e não distingue "corrigiu a data"
-- de "matou o título". Mesma decisão do `ap` e do `crm`.
create policy receivables_update on ar.receivables
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'ar.receivable.manage')
    or core.has_permission(tenant_id, 'ar.receivable.cancel')
  )
  with check (
    core.has_permission(tenant_id, 'ar.receivable.manage')
    or core.has_permission(tenant_id, 'ar.receivable.cancel')
  );

-- ⛔ Sem policy de DELETE. Cancelar é `status = 'cancelled'`.

-- -----------------------------------------------------------------------------
-- 2.2 ⭐ AS TRANSIÇÕES PERMITIDAS — espelho exato do `ap`, e re-perguntado
-- -----------------------------------------------------------------------------
-- Espelho de `ALLOWED_TRANSITIONS` em `@alsham/accounts-receivable`, e há um
-- teste que LÊ ESTE ARQUIVO e compara par a par.
--
-- A tabela é a mesma do `ap`, com os nomes trocados — e isso foi CONFERIDO, não
-- copiado:
--
--   open → partially_received | received     recebeu em parte, recebeu tudo.
--   open → cancelled                         o documento não vale mais.
--   partially_received → received            terminou de receber.
--   partially_received → open                ESTORNO total do que entrou.
--   partially_received → cancelled           cancelar o saldo a receber.
--   received → partially_received | open     ESTORNO. O dinheiro volta
--                                            (devolução, chargeback, cheque
--                                            devolvido, estorno de cartão).
--
--   ⛔ `received → cancelled` NÃO EXISTE. Ver o quadro no cabeçalho: cancelar
--      um título recebido apagaria a fronteira entre "não tínhamos a receber" e
--      "recebemos o dinheiro". Estorna primeiro; cancela depois.
--   ⛔ `cancelled` é TERMINAL.
-- -----------------------------------------------------------------------------

create or replace function ar.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',               'partially_received'),
    ('open',               'received'),
    ('open',               'cancelled'),
    ('partially_received', 'received'),
    ('partially_received', 'open'),
    ('partially_received', 'cancelled'),
    ('received',           'partially_received'),
    ('received',           'open')
  );
$$;

comment on function ar.allowed_transition(text, text) is
  'O ciclo de vida do título a receber. Espelho exato de ALLOWED_TRANSITIONS em @alsham/accounts-receivable — há teste que lê este arquivo e compara.';

-- -----------------------------------------------------------------------------
-- 2.3 O PORTEIRO DO ESTADO
-- -----------------------------------------------------------------------------

create or replace function ar.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not ar.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do título', old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'cancelled'
     and not core.has_permission(new.tenant_id, 'ar.receivable.cancel') then
    raise exception 'cancelar título a receber exige a permissão ar.receivable.cancel'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger receivables_guard_status
  before update of status on ar.receivables
  for each row execute function ar.guard_status_transition();

-- =============================================================================
-- 3. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE. Quem escuta não pode fazer join: o schema
-- deste módulo é invisível para ele, por policy e por lei.
-- =============================================================================

create or replace function ar.receivable_payload(p ar.receivables)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'externalRef',          p.external_ref,
    'dueDate',              p.due_date,
    'amountCents',          p.amount_cents,
    'receivedAmountCents',  p.received_amount_cents,
    'currency',             p.currency,
    'payerName',            p.payer_name,
    'counterpartyTaxId',    p.counterparty_tax_id,
    'description',          p.description,
    'status',               p.status
  );
$$;

comment on function ar.receivable_payload(ar.receivables) is
  'O envelope de um título a receber — AUTOSSUFICIENTE. Quem escuta não pode fazer join, então tudo o que ele precisa vai aqui.';

-- 3.1 `ar.receivable.registered`
create or replace function ar.on_receivable_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ar.emit_event(new.tenant_id, 'ar.receivable.registered', ar.receivable_payload(new));
  return new;
end;
$$;

create trigger receivables_emit_registered
  after insert on ar.receivables
  for each row execute function ar.on_receivable_registered();

-- 3.2 `ar.receivable.updated` — só o que MUDA O FATO.
--
-- ⚠️ Corrigir a descrição não é fato para o mundo; mudar valor, vencimento ou
-- recebimento é. Emitir a cada `update` encheria a caixa de saída de ruído — e
-- o tenant paga por evento entregue.
create or replace function ar.on_receivable_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    return new;   -- o cancelamento tem evento próprio (§3.3)
  end if;

  if new.amount_cents            is distinct from old.amount_cents
     or new.due_date             is distinct from old.due_date
     or new.received_amount_cents is distinct from old.received_amount_cents
     or new.status               is distinct from old.status then
    perform ar.emit_event(new.tenant_id, 'ar.receivable.updated', ar.receivable_payload(new));
  end if;

  return new;
end;
$$;

create trigger receivables_emit_updated
  after update on ar.receivables
  for each row execute function ar.on_receivable_updated();

-- 3.3 `ar.receivable.cancelled` — a ação destrutiva deste módulo.
create or replace function ar.on_receivable_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  perform ar.emit_event(new.tenant_id, 'ar.receivable.cancelled', ar.receivable_payload(new));
  return new;
end;
$$;

create trigger receivables_emit_cancelled
  after update of status on ar.receivables
  for each row execute function ar.on_receivable_cancelled();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- =============================================================================

revoke all on schema ar                from public, anon, authenticated;
revoke all on all tables    in schema ar from public, anon, authenticated;
revoke all on all functions in schema ar from public, anon, authenticated;

grant usage on schema ar to authenticated;

-- Sem DELETE. Nem por GRANT, nem por policy.
grant select, insert, update on ar.receivables to authenticated;

grant execute on function ar.can_access(uuid) to authenticated;

-- `ar.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum objeto em core, recon, marketing,
-- ap ou crm. Nenhuma leitura de schema alheio.
-- =============================================================================
