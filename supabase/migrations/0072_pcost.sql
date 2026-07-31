-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0072_pcost.sql
-- Módulo 57: Custos do Projeto (Project Costs). Schema `pcost`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, na Onda
-- Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa), depois do
-- `0068` (o Módulo 53, Projetos). Nasce sob `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Custos* (§5, na linha de
-- PMO ao lado de *Projetos*, *Recursos* e *Riscos*).
-- Spec: docs/canon/MODULO-PCOST-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE CUSTOS DO PROJETO, LANÇAMENTO IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada custo é um FATO CONSUMADO: o dinheiro foi gasto no projeto, alguém
-- registrou quanto e em quê, e o registro nasce pronto — para sempre. É a mesma
-- física do `cash` (o livro do dinheiro) e do `recv`/`occ`/`sec` (o ato pontual
-- imutável): NÃO TEM coluna de status, não tem ciclo de vida, não tem transição.
-- Não existe "custo aberto" nem "custo em andamento" — o custo ACONTECE e vira
-- linha. Corrigir é lançar OUTRO custo (o ato inverso, com nota), nunca
-- reescrever.
--
-- ⭐ Consequência direta: `pcost.entries` **NÃO TEM `allowed_transition`** e
-- **NÃO TEM `updated_at`** (não há o que tocar num fato que não muda). O cliente
-- não tem NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo
-- assim o gatilho abaixo recusa a reescrita até para o dono do banco — a mesma
-- física do `recv`/`occ`.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — SEM TRAVE DE SALDO (o DIVERGE consciente do `fund`)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi feita, contra o precedente mais próximo: o `fund` (Módulo 40)
-- CONFERE o saldo antes de aceitar o gasto e RECUSA o que o levaria abaixo de
-- zero — "o fundo não pode ficar negativo". Este módulo faz o OPOSTO, de caso
-- pensado:
--
-- **O `pcost` NÃO tem saldo e NÃO tem trave.** Não existe, aqui, um "orçamento
-- do projeto" contra o qual o custo pudesse ser recusado. Este módulo é APENAS
-- o LIVRO do que foi gasto — registrar o custo real é fato consumado, e um livro
-- que recusa lançar o gasto porque "estourou a trave" obriga o operador a MENTIR
-- sobre o que a empresa efetivamente gastou. O `fund` guarda dinheiro COLETIVO
-- de terceiros com propósito amarrado (por isso trava); o `pcost` só narra o
-- custo do próprio projeto (por isso não trava).
--
-- ⭐ A TRAVE, quando existir, é do genérico `bud` (Orçamentos, Módulo 29) por ID
-- SOLTO — capacidade futura, não reconstruída aqui. O `pcost` não conhece o
-- `bud`, não lê o schema dele, não importa nada: o custo entra sempre.
--
-- ⭐ SINAL: `amount_cents > 0` é gasto (o custo, o caso normal); `< 0` é crédito/
-- estorno/devolução (a correção pelo ato inverso — o livro não se rasura). Por
-- isso o sinal é LIVRE (apenas `<> 0` — zero é linha muda) e NÃO há piso: o teste
-- assina que um valor enorme, positivo ou negativo, entra sem recusa de saldo.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o projeto por ID SOLTO (uuid, obrigatório) + nome carimbado pela
--      TELA; o valor e a MOEDA juntos (valor + currency); a categoria TEXTO
--      LIVRE e OPCIONAL (custo sem categoria é permitido e honesto — a lição do
--      `cash`); a competência (`incurred_on`, opcional); a nota TEXTO LIVRE.
--   ❌ NÃO ENTRA orçamento/teto do projeto (é o `bud` genérico, por id solto —
--      capacidade futura), plano de contas fixo (é do contador — o `cash` já
--      declarou), rateio entre centros (é o `cc`), nem apropriação de custo por
--      hora/timesheet (capacidade *Timesheet* própria do Domain, Taxonomia §5).
--      `consumes` VAZIO.
--
-- 🔴 O `pcost` NÃO LÊ o `proj`: o projeto é referenciado por ID SOLTO, SEM FK
-- cruzada e SEM uma linha que toque o schema de Projetos — a Lei do Lego. Não
-- há referência a schema alheio em lugar nenhum deste arquivo.
-- =============================================================================

create schema if not exists pcost;

comment on schema pcost is
  'Módulo Custos do Projeto (Project Costs). Domain pmo (PMO & Projetos) da Taxonomia. O livro de custos: cada custo é LANÇAMENTO IMUTÁVEL, sem ciclo de vida, sem status. SEM trave de saldo (o DIVERGE consciente do fund) — este módulo só narra o gasto; a trave é do bud genérico por id solto. O projeto é referenciado por ID SOLTO (project_id) + project_name carimbado pela tela. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function pcost.emit_event(
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
  if p_event_type not like 'pcost.%' then
    raise exception 'pcost.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pcost',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pcost.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pcost.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pcost.entry.record');
$$;

-- =============================================================================
-- 2. ENTRIES — ⭐⭐ O CUSTO: LANÇAMENTO IMUTÁVEL, SEM CICLO, SEM TRAVE DE SALDO
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do occ.
-- E NÃO há gatilho de saldo: o custo entra sempre (o DIVERGE do fund).
-- =============================================================================

create table pcost.entries (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao projeto de Projetos — SEM FK cruzada (Lei do Lego), obrigatório.
  project_id   uuid        not null,
  -- O nome do projeto carimbado pela TELA — sobrevive ao redesenho do cadastro.
  project_name text        not null default '',
  -- ⭐ Valor + moeda JUNTOS. Sinal LIVRE (só <> 0): > 0 é gasto (o custo);
  -- < 0 é crédito/estorno (a correção pelo ato inverso). SEM piso, SEM teto —
  -- não há saldo aqui (o DIVERGE do fund).
  amount_cents bigint      not null check (amount_cents <> 0),
  currency     text        not null check (length(btrim(currency)) > 0),
  -- ⭐ Categoria TEXTO LIVRE e OPCIONAL — custo sem categoria é permitido e
  -- honesto (a lição do cash: obrigar categoria inventa classificação errada).
  category     text        not null default '',
  -- A competência: o dia em que o custo foi incorrido. Opcional.
  incurred_on  date,
  note         text        not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  recorded_at  timestamptz not null default now(),
  recorded_by  uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint pcost_entries_id_tenant unique (id, tenant_id)
);

create index pcost_entries_book_idx
  on pcost.entries (tenant_id, incurred_on desc nulls last, created_at desc);
create index pcost_entries_by_project_idx
  on pcost.entries (tenant_id, project_id);

alter table pcost.entries enable row level security;
alter table pcost.entries force row level security;

create policy pcost_entries_select on pcost.entries
  for select to authenticated
  using (pcost.can_access(tenant_id));

create policy pcost_entries_insert on pcost.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pcost.entry.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o custo lançado é fato
-- consumado; não existe porta para reescrevê-lo.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de quem/quando é descartado
-- -----------------------------------------------------------------------------

create or replace function pcost.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recorded_at := now();
  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

create trigger pcost_entries_stamp
  before insert on pcost.entries
  for each row execute function pcost.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o custo lançado
-- -----------------------------------------------------------------------------

create or replace function pcost.guard_entry_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o lançamento de custo é fato consumado: não se edita nem se apaga. Corrigir é lançar outro (o ato inverso), com nota.'
    using errcode = '42501';
end;
$$;

create trigger pcost_entries_immutable
  before update or delete on pcost.entries
  for each row execute function pcost.guard_entry_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (o projeto pelo nome carimbado, id solto)
-- =============================================================================

create or replace function pcost.entry_payload(p pcost.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',     p.id,
    'projectId',   p.project_id,
    'projectName', p.project_name,
    'amountCents', p.amount_cents,
    'currency',    p.currency,
    'category',    p.category,
    'incurredOn',  p.incurred_on
  );
$$;

comment on function pcost.entry_payload(pcost.entries) is
  'O envelope de um custo — AUTOSSUFICIENTE, com o projeto pelo NOME carimbado (id solto). Quem escuta não faz join.';

create or replace function pcost.on_entry_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pcost.emit_event(new.tenant_id, 'pcost.entry.recorded', pcost.entry_payload(new));
  return new;
end;
$$;

create trigger pcost_entries_emit_recorded
  after insert on pcost.entries
  for each row execute function pcost.on_entry_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pcost                  from public, anon, authenticated;
revoke all on all tables    in schema pcost from public, anon, authenticated;
revoke all on all functions in schema pcost from public, anon, authenticated;

grant usage on schema pcost to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (o custo é fato).
grant select, insert on pcost.entries to authenticated;

grant execute on function pcost.can_access(uuid) to authenticated;

-- `pcost.emit_event` NÃO é concedida. `pcost.entry_payload` é encanamento do
-- gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhuma trave de saldo (o custo entra sempre — o DIVERGE do
-- fund). Nenhum orçamento/teto (é o bud, por id solto). Nenhum objeto fora de
-- `pcost`. Nenhuma leitura de schema alheio (o projeto por id solto).
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
