-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0014_ap_apply_recon_match.sql
-- Porta que aplica a baixa confirmada no recon sobre o título a pagar.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — depois de `0012`/`0013`.
--
-- Espelho consciente de `0013_ar_apply_recon_match.sql`, com a divergência
-- do AP: **não se paga a maior** (`payables_no_overpay`).
--
-- ⛔ Só cria objeto no schema `ap`.
-- =============================================================================

create table ap.recon_settlements (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  match_id             uuid        not null,
  external_ref         text        not null,
  matched_amount_cents bigint      not null check (matched_amount_cents > 0),
  currency             char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  decision             text        not null check (decision in ('confirmed', 'rejected')),
  source_module_id     text        not null,
  applied_at           timestamptz not null default now(),
  constraint ap_recon_settlements_unique_match unique (tenant_id, match_id)
);

create index ap_recon_settlements_ref_idx
  on ap.recon_settlements (tenant_id, external_ref);

alter table ap.recon_settlements enable row level security;
alter table ap.recon_settlements force row level security;

create policy recon_settlements_select on ap.recon_settlements
  for select to authenticated
  using (ap.can_access(tenant_id));

revoke all on ap.recon_settlements from public, anon;
grant select on ap.recon_settlements to authenticated;

comment on table ap.recon_settlements is
  'Baixas aplicadas a partir de recon.match.decided (lado a pagar). Idempotência por (tenant, match_id).';

create or replace function ap.apply_recon_match(
  p_tenant_id            uuid,
  p_source_module_id     text,
  p_match_id             uuid,
  p_external_ref         text,
  p_matched_amount_cents bigint,
  p_currency             char(3),
  p_decision             text,
  p_target_kind          text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
  v_pay      ap.payables;
  v_new_set  bigint;
  v_status   text;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'ap.apply_recon_match: origem do fato não informada'
      using errcode = '22023';
  end if;

  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'ap.apply_recon_match: decisão % não reconhecida', p_decision
      using errcode = '22023';
  end if;

  -- Este módulo só liquida o próprio lado.
  if p_target_kind is distinct from 'payable' then
    return 'ignored-target';
  end if;

  if p_decision = 'rejected' then
    insert into ap.recon_settlements (
      tenant_id, match_id, external_ref, matched_amount_cents,
      currency, decision, source_module_id
    )
    values (
      p_tenant_id, p_match_id, p_external_ref, p_matched_amount_cents,
      p_currency, p_decision, p_source_module_id
    )
    on conflict (tenant_id, match_id) do nothing
    returning id into v_inserted;
    return case when v_inserted is null then 'unchanged' else 'recorded-rejected' end;
  end if;

  select * into v_pay
    from ap.payables
   where tenant_id = p_tenant_id
     and external_ref = p_external_ref
   for update;

  if not found then
    return 'ignored-missing';
  end if;

  -- Idempotência ANTES do overpay: reentrega do mesmo match_id não é
  -- "pagar a maior" — o título já reflete esta baixa. Conferir overpay
  -- primeiro devolvia ignored-overpay e mentia sobre a reentrega.
  insert into ap.recon_settlements (
    tenant_id, match_id, external_ref, matched_amount_cents,
    currency, decision, source_module_id
  )
  values (
    p_tenant_id, p_match_id, p_external_ref, p_matched_amount_cents,
    p_currency, p_decision, p_source_module_id
  )
  on conflict (tenant_id, match_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return 'unchanged';
  end if;

  if v_pay.status = 'cancelled' then
    return 'skipped-cancelled';
  end if;

  if v_pay.currency is distinct from p_currency then
    return 'ignored-currency';
  end if;

  -- ⭐ DIVERGÊNCIA DO AR: pagar a maior é recusado (payables_no_overpay).
  -- Só para match NOVO — depois da carimba de idempotência.
  if v_pay.settled_amount_cents + p_matched_amount_cents > v_pay.amount_cents then
    return 'ignored-overpay';
  end if;

  v_new_set := v_pay.settled_amount_cents + p_matched_amount_cents;

  if v_new_set <= 0 then
    v_status := 'open';
    v_new_set := 0;
  elsif v_new_set = v_pay.amount_cents then
    v_status := 'settled';
  else
    v_status := 'partially_settled';
  end if;

  update ap.payables
     set settled_amount_cents = v_new_set,
         status               = v_status,
         updated_at           = now()
   where id = v_pay.id
     and tenant_id = p_tenant_id;

  return 'applied';
end;
$$;

comment on function ap.apply_recon_match(uuid, text, uuid, text, bigint, char, text, text) is
  'Aplica recon.match.decided no título a pagar. Idempotente por match_id. Recusa overpay. Sem schema alheio. Só service_role.';

revoke all on function ap.apply_recon_match(uuid, text, uuid, text, bigint, char, text, text)
  from public, anon, authenticated;

-- =============================================================================
-- FIM. Nenhum objeto fora de `ap`.
-- =============================================================================
