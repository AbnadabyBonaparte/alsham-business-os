-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0002_recon.sql
-- Módulo 1: Conciliação & Aprovações. Schema `recon`.
-- =============================================================================
--
-- ESTE ARQUIVO NÃO FOI APLICADO. Nenhum projeto Supabase criado, nenhuma
-- migration executada, nenhum segredo. Aplicar é ato do dono.
--
-- Taxonomia: Domain `finance` (Financeiro, §5) — capacidades *Conciliação
-- bancária* e *Aprovações financeiras*. Roadmap: Fase 3, Smart Reconciliation™.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO EXISTE PARA PROVAR
-- -----------------------------------------------------------------------------
-- Este é o primeiro módulo de produto sobre o Core. Ele prova o Lego ou
-- desmente. Quatro regras que ele não quebra:
--
--   1. NÃO cria nada no schema `core`. Todo objeto nasce em `recon`.
--   2. NÃO conhece outro módulo. A única porta para fora é
--      `recon.emit_event()`, que escreve na caixa de saída do Core.
--   3. NÃO lê tabela de outro módulo. `recon.payables` é PROJEÇÃO LOCAL,
--      alimentada por importação ou por evento — nunca por join.
--   4. Depende SÓ do Core: chama `core.has_permission()` e escreve em
--      `core.event_outbox`. O Core não é um módulo; é a única dependência
--      que o contrato permite (ModuleManifest.requiresCore).
--
-- -----------------------------------------------------------------------------
-- ORIGEM MINERADA (Lei do Reaproveitamento)
-- -----------------------------------------------------------------------------
--   lógica de conciliação        <- Smart Reconciliation™, Roadmap Fase 3
--                                   (sugestão automática de baixa + divergências)
--   fila com estados + tentativas<- pipeline de jobs do kraken-v2   (PROVADO)
--   trilha de decisão            <- core.audit_log, minerado do peritus (PROVADO)
--   entrega de evento            <- core.event_outbox, minerado da
--                                   casa-bonaparte + forensic          (PROVADO)
--
--   ⚠️ Estado honesto (Balanço de Tecnologia §2): *conciliação, DRE e
--   tesouraria* estão marcados **NÃO TEMOS**. Esta é a primeira peça do
--   Business OS que NÃO é montagem — é obra nova. O que se reaproveita aqui
--   é o padrão (fila, trilha, evento), não a regra de negócio.
--
-- -----------------------------------------------------------------------------
-- O TESTE ANTI-VIÉS, APLICADO CAMPO A CAMPO
-- -----------------------------------------------------------------------------
-- Pergunta de cada coluna: "outra empresa do mesmo setor usaria isso
-- exatamente como está?" O que reprovou NÃO virou coluna — virou chave em
-- `core.tenant_modules.settings`. A lista do que ficou de fora, e por quê,
-- está marcada com ANTI-VIÉS ao longo do arquivo.
--
-- =============================================================================

create schema if not exists recon;

comment on schema recon is
  'Módulo Conciliação & Aprovações. Domain finance da Taxonomia. Não cria objeto em core; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- -----------------------------------------------------------------------------
-- Todo evento deste módulo sai por aqui, e só por aqui. Uma porta só é o que
-- torna auditável a afirmação "o módulo não fala com ninguém direto".
--
-- Escreve na MESMA transação do dado que o evento descreve — é isso que
-- impede o modo de falha clássico (o dado gravou e o evento não saiu).
-- =============================================================================

create or replace function recon.emit_event(
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
  -- Cinto de segurança: o módulo não pode emitir evento em nome de outro.
  if p_event_type not like 'recon.%' then
    raise exception 'recon.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'recon',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function recon.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado. O Core entrega e escreve a trilha em core.audit_log.';

-- -----------------------------------------------------------------------------
-- Acesso ao módulo: quem tem QUALQUER uma das três permissões do manifesto.
-- Membro do tenant sem permissão `recon.*` NÃO lê dado financeiro — leitura
-- aqui é privilégio, não default de membro.
-- -----------------------------------------------------------------------------

create or replace function recon.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'recon.statement.import')
      or core.has_permission(p_tenant_id, 'recon.match.manage')
      or core.has_permission(p_tenant_id, 'recon.approval.decide');
$$;

create or replace function recon.touch_updated_at()
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
-- 2. BANK_STATEMENTS — o extrato importado
-- Minerado de: Smart Reconciliation™ (Roadmap Fase 3).
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado:
--   ✅ ENTRA `source_format` restrito a formatos ABERTOS (ofx, csv, camt053,
--      manual). Padrão aberto é universal.
--   ❌ NÃO ENTRA o layout de colunas do CSV de um banco específico. Isso é
--      `settings.import.csvMapping` — cada empresa usa o banco que usa.
--   ❌ NÃO ENTRA nome de banco, nem lista de bancos suportados. Uma tabela
--      `bancos_homologados` seria o sistema de UM cliente.
--   ✅ ENTRA `account_ref` como texto opaco: a referência que o tenant dá à
--      própria conta. A capacidade *Bancos* é outra peça do Domain Financeiro
--      — este módulo não a possui e não a inventa.
-- =============================================================================

create table recon.bank_statements (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- Referência opaca à conta, definida pelo tenant. Não é FK: a capacidade
  -- "Bancos" pertence a outro módulo, e módulo não referencia módulo.
  account_ref    text        not null,
  source_format  text        not null
                 check (source_format in ('ofx', 'csv', 'camt053', 'manual')),
  original_filename text,
  -- Impede reimportar o mesmo extrato duas vezes. Idempotência de importação.
  content_hash   text        not null,
  period_start   date        not null,
  period_end     date        not null,
  opening_balance_cents bigint,
  closing_balance_cents bigint,
  -- ISO 4217. Sem default de propósito: moeda presumida é viés de país.
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  status         text        not null default 'imported'
                 check (status in ('imported', 'reconciling', 'closed', 'discarded')),
  imported_at    timestamptz not null default now(),
  imported_by    uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint bank_statements_period_ok check (period_end >= period_start),
  constraint bank_statements_no_reimport unique (tenant_id, account_ref, content_hash),
  -- Alvo da FK composta das filhas: garante que linha e extrato nunca
  -- pertençam a tenants diferentes.
  constraint bank_statements_id_tenant unique (id, tenant_id)
);

create index bank_statements_tenant_idx
  on recon.bank_statements (tenant_id, period_end desc);
create index bank_statements_open_idx
  on recon.bank_statements (tenant_id) where status in ('imported', 'reconciling');

create trigger bank_statements_touch
  before update on recon.bank_statements
  for each row execute function recon.touch_updated_at();

alter table recon.bank_statements enable row level security;
alter table recon.bank_statements force row level security;

create policy bank_statements_select on recon.bank_statements
  for select to authenticated
  using (recon.can_access(tenant_id));

create policy bank_statements_insert on recon.bank_statements
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.statement.import'));

create policy bank_statements_update on recon.bank_statements
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.statement.import'))
  with check (core.has_permission(tenant_id, 'recon.statement.import'));

-- Sem policy de DELETE: descartar é `status = 'discarded'`, não apagar linha.
-- Extrato apagado é conciliação sem prova.

-- =============================================================================
-- 3. STATEMENT_LINES — as linhas do extrato
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado:
--   ✅ `amount_cents bigint` com sinal: negativo = saída. Inteiro em centavos
--      é universal e não tem erro de ponto flutuante.
--   ✅ `counterparty_tax_id` — nome NEUTRO de propósito. Chamar de `cnpj`
--      amarraria o produto ao Brasil; o campo é "identificador fiscal da
--      contraparte", e cada país põe o seu.
--   ❌ NÃO ENTRA validação de formato de CPF/CNPJ no schema. Regra fiscal de
--      país é `settings`, e a validação séria é da camada de integração
--      (Lei 3: fiscal se INTEGRA, não se constrói).
--   ❌ NÃO ENTRA centro de custo / rateio. São capacidades próprias do Domain
--      Financeiro (§5), de outro módulo. Não se anexa aqui por conveniência.
-- =============================================================================

create table recon.statement_lines (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null,
  statement_id   uuid        not null,
  line_no        integer     not null check (line_no > 0),
  posted_at      date        not null,
  value_date     date,
  -- Negativo = saída (débito). Positivo = entrada (crédito).
  amount_cents   bigint      not null,
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  description    text        not null default '',
  counterparty_name   text,
  -- Identificador fiscal da contraparte. Neutro de país de propósito.
  counterparty_tax_id text,
  -- Id da linha no sistema de origem (FITID do OFX, por exemplo).
  external_id    text,
  balance_after_cents bigint,
  status         text        not null default 'unmatched'
                 check (status in ('unmatched', 'suggested', 'matched', 'ignored')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint statement_lines_unique_no unique (statement_id, line_no),
  -- FK COMPOSTA: linha e extrato no mesmo tenant, garantido pelo banco e não
  -- pela boa vontade de quem grava.
  constraint statement_lines_statement_fk
    foreign key (statement_id, tenant_id)
    references recon.bank_statements (id, tenant_id) on delete cascade,
  constraint statement_lines_id_tenant unique (id, tenant_id)
);

create index statement_lines_open_idx
  on recon.statement_lines (tenant_id, posted_at)
  where status in ('unmatched', 'suggested');
create index statement_lines_amount_idx
  on recon.statement_lines (tenant_id, amount_cents);
create index statement_lines_taxid_idx
  on recon.statement_lines (tenant_id, counterparty_tax_id)
  where counterparty_tax_id is not null;

create trigger statement_lines_touch
  before update on recon.statement_lines
  for each row execute function recon.touch_updated_at();

alter table recon.statement_lines enable row level security;
alter table recon.statement_lines force row level security;

create policy statement_lines_select on recon.statement_lines
  for select to authenticated
  using (recon.can_access(tenant_id));

create policy statement_lines_insert on recon.statement_lines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.statement.import'));

create policy statement_lines_update on recon.statement_lines
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.match.manage'))
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

-- =============================================================================
-- 4. PAYABLES — contas a pagar a conciliar
-- -----------------------------------------------------------------------------
-- ⚠️ DECISÃO DE ARQUITETURA QUE O REVISOR PRECISA CONFERIR.
--
-- "Contas a pagar" é uma capacidade PRÓPRIA do Domain Financeiro (§5), de um
-- futuro módulo AP. Se este módulo fosse o dono dela, ele deixaria de ser o
-- módulo de conciliação e viraria meio ERP — e o módulo AP nasceria brigando
-- com ele.
--
-- Por isso esta tabela é uma **PROJEÇÃO LOCAL**, não a fonte da verdade:
--   · `source = 'imported'` — não há módulo AP instalado; o tenant importa.
--   · `source = 'event'`    — um módulo AP existe e emitiu o fato; este
--                             módulo guardou a própria cópia.
--
-- Em nenhum dos dois casos este módulo lê a tabela de outro. É exatamente o
-- padrão que o CORE-SPEC descreve: o acoplamento é com o TIPO DO EVENTO, que
-- é contrato público, nunca com o código de quem o emitiu.
--
-- ANTI-VIÉS aplicado:
--   ❌ NÃO ENTRA plano de contas, natureza de despesa, centro de custo. São
--      capacidades de outros módulos e, na parte configurável, `settings`.
--   ✅ `external_ref` guarda o identificador no sistema de origem — é o que
--      permite ao humano achar o documento lá, sem este módulo saber o que
--      "lá" significa.
-- =============================================================================

create table recon.payables (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  source         text        not null default 'imported'
                 check (source in ('imported', 'event')),
  -- Quando `source='event'`: quem emitiu. NULL quando importado.
  source_module_id text,
  -- O identificador do título no sistema de origem.
  external_ref   text        not null,
  due_date       date        not null,
  -- Sempre POSITIVO: é o valor devido. O sinal é da linha do extrato.
  amount_cents   bigint      not null check (amount_cents > 0),
  settled_amount_cents bigint not null default 0 check (settled_amount_cents >= 0),
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  supplier_name  text,
  supplier_tax_id text,
  description    text        not null default '',
  status         text        not null default 'open'
                 check (status in ('open', 'partially_settled', 'settled', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint payables_no_overpay check (settled_amount_cents <= amount_cents),
  constraint payables_source_coherent check (
    (source = 'imported' and source_module_id is null) or
    (source = 'event'    and source_module_id is not null)
  ),
  constraint payables_unique_ref unique (tenant_id, external_ref),
  constraint payables_id_tenant unique (id, tenant_id)
);

create index payables_open_idx
  on recon.payables (tenant_id, due_date)
  where status in ('open', 'partially_settled');
create index payables_amount_idx
  on recon.payables (tenant_id, amount_cents);
create index payables_taxid_idx
  on recon.payables (tenant_id, supplier_tax_id)
  where supplier_tax_id is not null;

create trigger payables_touch
  before update on recon.payables
  for each row execute function recon.touch_updated_at();

alter table recon.payables enable row level security;
alter table recon.payables force row level security;

create policy payables_select on recon.payables
  for select to authenticated
  using (recon.can_access(tenant_id));

create policy payables_insert on recon.payables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.statement.import'));

create policy payables_update on recon.payables
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.match.manage'))
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

-- =============================================================================
-- 5. RECONCILIATION_MATCHES — o casamento linha ↔ pagamento
-- Minerado de: Smart Reconciliation™ — "sugestão automática de baixa".
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado — ESTE É O CAMPO DE BATALHA DO MÓDULO:
--   ✅ ENTRA `score` (0..1) e `origin` (auto|manual): a MEDIDA da confiança e
--      a PROCEDÊNCIA do casamento são universais.
--   ❌ NÃO ENTRA o LIMIAR de score para aceitar automaticamente. Uma empresa
--      aceita 0.95, outra exige 0.99, outra não aceita nada sem humano. Isso
--      é `settings.matching.minScore` — política do tenant, não do produto.
--   ❌ NÃO ENTRA tolerância de valor nem de data. Mesma razão:
--      `settings.matching.amountToleranceCents` e `.dateToleranceDays`.
--   ❌ NÃO ENTRA regra de negócio de cliente ("fornecedor X sempre paga com
--      3 dias de atraso"). Se virasse coluna, o produto seria o sistema de
--      uma empresa só.
--   ✅ ENTRA `strategy` como TEXTO: o nome da regra que casou. Guardar QUAL
--      regra funcionou é universal e é o que permite a IA da Fase 3 aprender
--      padrões depois — sem que o schema saiba quais regras existem.
--
-- Cardinalidade: uma linha pode quitar vários títulos e um título pode ser
-- quitado por várias linhas (baixa parcial). Por isso o par é único, mas nem
-- linha nem título são exclusivos.
-- =============================================================================

create table recon.reconciliation_matches (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null,
  statement_line_id uuid        not null,
  payable_id        uuid        not null,
  matched_amount_cents bigint   not null check (matched_amount_cents > 0),
  -- Confiança de 0 a 1. NULL quando origin='manual': humano não tem score,
  -- humano tem responsabilidade.
  score             numeric(5,4) check (score >= 0 and score <= 1),
  origin            text        not null check (origin in ('auto', 'manual')),
  -- O nome da regra que produziu o casamento. Livre de propósito.
  strategy          text,
  status            text        not null default 'suggested'
                    check (status in ('suggested', 'confirmed', 'rejected')),
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint matches_unique_pair unique (statement_line_id, payable_id),
  constraint matches_auto_has_score check (
    (origin = 'auto'   and score is not null) or
    (origin = 'manual' and strategy is null)
  ),
  constraint matches_decided_coherent check (
    (status = 'suggested' and decided_at is null) or
    (status in ('confirmed', 'rejected') and decided_at is not null)
  ),
  constraint matches_line_fk
    foreign key (statement_line_id, tenant_id)
    references recon.statement_lines (id, tenant_id) on delete cascade,
  constraint matches_payable_fk
    foreign key (payable_id, tenant_id)
    references recon.payables (id, tenant_id) on delete cascade,
  constraint matches_id_tenant unique (id, tenant_id)
);

create index matches_pending_idx
  on recon.reconciliation_matches (tenant_id, score desc)
  where status = 'suggested';
create index matches_line_idx    on recon.reconciliation_matches (statement_line_id);
create index matches_payable_idx on recon.reconciliation_matches (payable_id);

create trigger matches_touch
  before update on recon.reconciliation_matches
  for each row execute function recon.touch_updated_at();

alter table recon.reconciliation_matches enable row level security;
alter table recon.reconciliation_matches force row level security;

create policy matches_select on recon.reconciliation_matches
  for select to authenticated
  using (recon.can_access(tenant_id));

create policy matches_insert on recon.reconciliation_matches
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

create policy matches_update on recon.reconciliation_matches
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.match.manage'))
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

create policy matches_delete on recon.reconciliation_matches
  for delete to authenticated
  using (core.has_permission(tenant_id, 'recon.match.manage'));

-- =============================================================================
-- 6. APPROVAL_QUEUE — a fila que substitui a mesa do diretor
-- Minerado de: pipeline de jobs com estados do kraken-v2 (PROVADO) +
-- capacidade *Aprovações financeiras* (Taxonomia §5).
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado — A DECISÃO MAIS IMPORTANTE DO MÓDULO:
--
--   ✅ ENTRA o REGISTRO DA DECISÃO: o que se pediu, quem vistou, quando, com
--      que observação. Toda empresa que aprova alguma coisa precisa disso.
--   ❌ NÃO ENTRA a POLÍTICA DE APROVAÇÃO. "Acima de X, dois diretores";
--      "quem lança não aprova"; "compras aprova até Y". Isso muda de empresa
--      para empresa e é `settings.approval.*`. Se virasse tabela, teríamos
--      construído o organograma de UM cliente dentro do produto.
--   ❌ NÃO ENTRA alçada por valor, nem hierarquia de aprovador, nem cadeia de
--      múltiplas etapas. Pelo mesmo motivo — e porque etapa múltipla é uma
--      capacidade a mais, que se acrescenta quando um segundo cliente pedir
--      igual (aí vira produto).
--   ✅ ENTRA `amount_cents` no item: o valor é o fato, não a regra.
--
-- A fila não decide nada. Ela guarda o que foi decidido, e por quem.
-- =============================================================================

create table recon.approval_queue (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- O que está sendo aprovado. Restrito ao que ESTE módulo produz.
  subject_type  text        not null
                check (subject_type in ('reconciliation-match', 'statement-closure')),
  subject_id    uuid        not null,
  title         text        not null,
  amount_cents  bigint,
  currency      char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  status        text        not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  requested_at  timestamptz not null default now(),
  requested_by  uuid        references auth.users (id) on delete set null,
  decided_at    timestamptz,
  decided_by    uuid        references auth.users (id) on delete set null,
  decision_note text,
  updated_at    timestamptz not null default now(),
  -- Um item por assunto: não se pede a mesma aprovação duas vezes.
  constraint approval_unique_subject unique (tenant_id, subject_type, subject_id),
  -- Decidido exige decisor e carimbo. Pendente não pode ter nenhum dos dois.
  constraint approval_decision_coherent check (
    (status = 'pending'
      and decided_at is null and decided_by is null) or
    (status in ('approved', 'rejected')
      and decided_at is not null and decided_by is not null)
  )
);

create index approval_pending_idx
  on recon.approval_queue (tenant_id, requested_at)
  where status = 'pending';
create index approval_subject_idx
  on recon.approval_queue (tenant_id, subject_type, subject_id);

create trigger approval_queue_touch
  before update on recon.approval_queue
  for each row execute function recon.touch_updated_at();

alter table recon.approval_queue enable row level security;
alter table recon.approval_queue force row level security;

create policy approval_select on recon.approval_queue
  for select to authenticated
  using (recon.can_access(tenant_id));

-- Pedir aprovação é ato de quem gere os casamentos.
create policy approval_insert on recon.approval_queue
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

-- Decidir é permissão à parte. Quem concilia não necessariamente visa.
create policy approval_update on recon.approval_queue
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.approval.decide'))
  with check (core.has_permission(tenant_id, 'recon.approval.decide'));

-- Sem policy de DELETE: item de fila decidido é prova. Não se apaga.

-- =============================================================================
-- 7. OS EVENTOS — aprovação e ação destrutiva SEMPRE saem pela porta
-- -----------------------------------------------------------------------------
-- Cada trigger abaixo emite em `core.event_outbox`. O Core entrega e escreve
-- a trilha em `core.audit_log` — o módulo NÃO escreve auditoria direto. É a
-- mesma regra do CORE-SPEC: ator nenhum escreve a própria auditoria.
--
-- Os três tipos emitidos estão declarados no ModuleManifest. Nada sai daqui
-- que não esteja no manifesto.
-- =============================================================================

-- 7.1 `recon.approval.decided` — o visto do humano.
create or replace function recon.on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status or old.status <> 'pending' then
    return new;
  end if;

  perform recon.emit_event(
    new.tenant_id,
    'recon.approval.decided',
    jsonb_build_object(
      'approvalId',   new.id,
      'subjectType',  new.subject_type,
      'subjectId',    new.subject_id,
      'decision',     new.status,
      'amountCents',  new.amount_cents,
      'currency',     new.currency,
      'decidedBy',    new.decided_by,
      'decidedAt',    new.decided_at,
      'note',         new.decision_note
    )
  );
  return new;
end;
$$;

create trigger approval_queue_emit_decided
  after update of status on recon.approval_queue
  for each row execute function recon.on_approval_decided();

-- 7.2 `recon.statement.discarded` — a ação destrutiva deste módulo.
-- Descartar não apaga linha, mas invalida uma conciliação inteira. Some da
-- operação, nunca da trilha.
create or replace function recon.on_statement_discarded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'discarded' or old.status = 'discarded' then
    return new;
  end if;

  perform recon.emit_event(
    new.tenant_id,
    'recon.statement.discarded',
    jsonb_build_object(
      'statementId',   new.id,
      'accountRef',    new.account_ref,
      'periodStart',   new.period_start,
      'periodEnd',     new.period_end,
      'previousStatus', old.status
    )
  );
  return new;
end;
$$;

create trigger bank_statements_emit_discarded
  after update of status on recon.bank_statements
  for each row execute function recon.on_statement_discarded();

-- 7.3 `recon.reconciliation.completed` — o extrato fechado.
create or replace function recon.on_statement_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total     integer;
  v_matched   integer;
  v_amount    bigint;
begin
  if new.status <> 'closed' or old.status = 'closed' then
    return new;
  end if;

  select count(*), count(*) filter (where l.status = 'matched')
    into v_total, v_matched
    from recon.statement_lines l
   where l.statement_id = new.id;

  select coalesce(sum(m.matched_amount_cents), 0)
    into v_amount
    from recon.reconciliation_matches m
    join recon.statement_lines l on l.id = m.statement_line_id
   where l.statement_id = new.id
     and m.status = 'confirmed';

  perform recon.emit_event(
    new.tenant_id,
    'recon.reconciliation.completed',
    jsonb_build_object(
      'statementId',        new.id,
      'accountRef',         new.account_ref,
      'periodStart',        new.period_start,
      'periodEnd',          new.period_end,
      'currency',           new.currency,
      'totalLines',         v_total,
      'matchedLines',       v_matched,
      -- A divergência é o número que interessa ao humano: o que sobrou.
      'unmatchedLines',     v_total - v_matched,
      'matchedAmountCents', v_amount
    )
  );
  return new;
end;
$$;

create trigger bank_statements_emit_completed
  after update of status on recon.bank_statements
  for each row execute function recon.on_statement_closed();

-- =============================================================================
-- 8. FECHAMENTO DE PRIVILÉGIOS
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema recon                from public, anon, authenticated;
revoke all on all tables    in schema recon from public, anon, authenticated;
revoke all on all functions in schema recon from public, anon, authenticated;

grant usage on schema recon to authenticated;

grant select, insert, update         on recon.bank_statements        to authenticated;
grant select, insert, update         on recon.statement_lines        to authenticated;
grant select, insert, update         on recon.payables               to authenticated;
grant select, insert, update, delete on recon.reconciliation_matches to authenticated;
grant select, insert, update         on recon.approval_queue         to authenticated;

grant execute on function recon.can_access(uuid) to authenticated;

-- `recon.emit_event` NÃO é concedida a `authenticated`: ninguém emite evento
-- à mão. Só os triggers a chamam, e eles são SECURITY DEFINER.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum dado semeado. Nenhum segredo.
-- Nenhum objeto criado no schema `core`.
-- =============================================================================
