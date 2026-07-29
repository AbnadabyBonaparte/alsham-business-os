-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0011_recon_receivables.sql
-- Conciliação de recebimentos: projeção `recon.receivables` + matches polimórficos.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — depois de `0010_ar.sql`.
-- Ver docs/runbook/APLICAR.md.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
-- -----------------------------------------------------------------------------
-- O Módulo 5 (AR) emite `ar.receivable.*`. O Módulo 1 precisa projetar o título
-- e casar contra CRÉDITOS do extrato. O caminho barato (sinal invertido em
-- `recon.payables`) foi recusado no MODULO-AR-SPEC §2.3.
--
-- Esta migration:
--   1. cria `recon.receivables` (sem `no_overpay` — receber a maior é permitido);
--   2. torna `reconciliation_matches` polimórfica (payable XOR receivable);
--   3. abre `recon.record_external_receivable` (espelho da 0008, só service_role).
--
-- ⛔ Não edita `0002_recon.sql` nem `0008`. Arquivo aplicado é história.
-- =============================================================================

-- =============================================================================
-- 1. recon.receivables — projeção local de títulos a receber
-- =============================================================================

create table recon.receivables (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  source         text        not null default 'imported'
                 check (source in ('imported', 'event')),
  source_module_id text,
  external_ref   text        not null,
  due_date       date        not null,
  -- Sempre POSITIVO: valor a receber. O sinal é da linha do extrato.
  amount_cents   bigint      not null check (amount_cents > 0),
  -- ⭐ SEM teto de overpay: received pode passar de amount (divergência AR).
  received_amount_cents bigint not null default 0 check (received_amount_cents >= 0),
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  counterparty_name  text,
  counterparty_tax_id text,
  description    text        not null default '',
  status         text        not null default 'open'
                 check (status in ('open', 'partially_received', 'received', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint receivables_source_coherent check (
    (source = 'imported' and source_module_id is null) or
    (source = 'event'    and source_module_id is not null)
  ),
  constraint receivables_unique_ref unique (tenant_id, external_ref),
  constraint receivables_id_tenant unique (id, tenant_id)
);

create index receivables_open_idx
  on recon.receivables (tenant_id, due_date)
  where status in ('open', 'partially_received');
create index receivables_amount_idx
  on recon.receivables (tenant_id, amount_cents);
create index receivables_taxid_idx
  on recon.receivables (tenant_id, counterparty_tax_id)
  where counterparty_tax_id is not null;

create trigger receivables_touch
  before update on recon.receivables
  for each row execute function recon.touch_updated_at();

alter table recon.receivables enable row level security;
alter table recon.receivables force row level security;

create policy receivables_select on recon.receivables
  for select to authenticated
  using (recon.can_access(tenant_id));

create policy receivables_insert on recon.receivables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recon.statement.import'));

create policy receivables_update on recon.receivables
  for update to authenticated
  using      (core.has_permission(tenant_id, 'recon.match.manage'))
  with check (core.has_permission(tenant_id, 'recon.match.manage'));

comment on table recon.receivables is
  'Projeção local de títulos a receber. Alimentada por importação ou por evento (source=event). Sem no_overpay: receber a maior é permitido.';

revoke all on recon.receivables from public, anon;
grant select, insert, update on recon.receivables to authenticated;

-- =============================================================================
-- 2. Matches polimórficos — payable XOR receivable
-- =============================================================================
-- payable_id nasceu NOT NULL na 0002. Aqui vira nullable; receivable_id entra;
-- CHECK garante exatamente um dos dois. Uniques parciais substituem o unique
-- antigo (NULL em unique Postgres não impede duplicata de crédito).

alter table recon.reconciliation_matches
  alter column payable_id drop not null;

alter table recon.reconciliation_matches
  add column receivable_id uuid;

alter table recon.reconciliation_matches
  drop constraint if exists matches_unique_pair;

alter table recon.reconciliation_matches
  add constraint matches_one_target check (
    (payable_id is not null and receivable_id is null)
    or
    (payable_id is null and receivable_id is not null)
  );

alter table recon.reconciliation_matches
  add constraint matches_receivable_fk
    foreign key (receivable_id, tenant_id)
    references recon.receivables (id, tenant_id) on delete cascade;

create unique index matches_unique_payable_pair
  on recon.reconciliation_matches (statement_line_id, payable_id)
  where payable_id is not null;

create unique index matches_unique_receivable_pair
  on recon.reconciliation_matches (statement_line_id, receivable_id)
  where receivable_id is not null;

create index matches_receivable_idx
  on recon.reconciliation_matches (receivable_id)
  where receivable_id is not null;

comment on column recon.reconciliation_matches.receivable_id is
  'Alvo do casamento quando a linha é crédito. Mutuamente exclusivo com payable_id.';

-- =============================================================================
-- 3. recon.record_external_receivable — porta de projeção (service_role)
-- =============================================================================

create or replace function recon.record_external_receivable(
  p_tenant_id             uuid,
  p_source_module_id      text,
  p_external_ref          text,
  p_due_date              date,
  p_amount_cents          bigint,
  p_currency              char(3),
  p_status                text,
  p_received_amount_cents bigint default 0,
  p_counterparty_name     text   default null,
  p_counterparty_tax_id   text   default null,
  p_description           text   default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing recon.receivables;
  v_touched  integer;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'recon.record_external_receivable: origem do título não informada'
      using errcode = '22023';
  end if;

  if p_status not in ('open', 'partially_received', 'received', 'cancelled') then
    raise exception 'recon.record_external_receivable: estado % não reconhecido', p_status
      using errcode = '22023';
  end if;

  select * into v_existing
    from recon.receivables
   where tenant_id = p_tenant_id
     and external_ref = p_external_ref;

  if found and v_existing.source = 'imported' then
    return 'skipped-imported';
  end if;

  if not found then
    insert into recon.receivables (
      tenant_id, source, source_module_id, external_ref,
      due_date, amount_cents, received_amount_cents, currency,
      counterparty_name, counterparty_tax_id, description, status
    )
    values (
      p_tenant_id, 'event', p_source_module_id, p_external_ref,
      p_due_date, p_amount_cents, coalesce(p_received_amount_cents, 0), p_currency,
      p_counterparty_name, p_counterparty_tax_id, coalesce(p_description, ''), p_status
    );
    return 'created';
  end if;

  update recon.receivables r
     set source_module_id      = p_source_module_id,
         due_date              = p_due_date,
         amount_cents          = p_amount_cents,
         received_amount_cents = coalesce(p_received_amount_cents, 0),
         currency              = p_currency,
         counterparty_name     = p_counterparty_name,
         counterparty_tax_id   = p_counterparty_tax_id,
         description           = coalesce(p_description, ''),
         status                = p_status,
         updated_at            = now()
   where r.tenant_id    = p_tenant_id
     and r.external_ref = p_external_ref
     and (r.source_module_id, r.due_date, r.amount_cents, r.received_amount_cents,
          r.currency, r.counterparty_name, r.counterparty_tax_id, r.description, r.status)
         is distinct from
         (p_source_module_id, p_due_date, p_amount_cents, coalesce(p_received_amount_cents, 0),
          p_currency, p_counterparty_name, p_counterparty_tax_id, coalesce(p_description, ''), p_status);

  get diagnostics v_touched = row_count;
  return case when v_touched > 0 then 'updated' else 'unchanged' end;
end;
$$;

comment on function recon.record_external_receivable(uuid, text, text, date, bigint, char, text, bigint, text, text, text) is
  'Projeta no recon um título a receber vindo de OUTRO módulo. Idempotente por (tenant_id, external_ref). Nunca sobrescreve título importado. Aceita received > amount. Procedência por argumento.';

revoke all on function recon.record_external_receivable(uuid, text, text, date, bigint, char, text, bigint, text, text, text)
  from public, anon, authenticated;

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum objeto fora de `recon`. Sem menção ao module_id
-- do produtor.
-- =============================================================================
