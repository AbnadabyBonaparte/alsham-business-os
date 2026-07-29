-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0013_ar_apply_recon_match.sql
-- Porta que aplica a baixa confirmada no recon sobre o título a receber.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — depois de `0010`, `0011` e `0012`.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
-- -----------------------------------------------------------------------------
-- O Módulo 1 emite `recon.match.decided`. Este módulo (AR) precisa liquidar o
-- título **sem ler** `recon.*`. A função abaixo é a porta: recebe o payload
-- já traduzido, é idempotente por `match_id`, e só o `service_role` executa.
--
-- ⛔ Só cria objeto no schema `ar`. Espelho da decisão `0007`/`0008`.
-- =============================================================================

-- Livro das baixas vindas do recon — a chave de idempotência da reentrega.
create table ar.recon_settlements (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  match_id             uuid        not null,
  external_ref         text        not null,
  matched_amount_cents bigint      not null check (matched_amount_cents > 0),
  currency             char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  decision             text        not null check (decision in ('confirmed', 'rejected')),
  source_module_id     text        not null,
  applied_at           timestamptz not null default now(),
  constraint recon_settlements_unique_match unique (tenant_id, match_id)
);

create index recon_settlements_ref_idx
  on ar.recon_settlements (tenant_id, external_ref);

alter table ar.recon_settlements enable row level security;
alter table ar.recon_settlements force row level security;

-- Só leitura para quem gerencia títulos — a escrita é da RPC (service_role).
create policy recon_settlements_select on ar.recon_settlements
  for select to authenticated
  using (ar.can_access(tenant_id));

revoke all on ar.recon_settlements from public, anon;
grant select on ar.recon_settlements to authenticated;

comment on table ar.recon_settlements is
  'Baixas aplicadas a partir de recon.match.decided. Idempotência por (tenant, match_id). Sem UPDATE: fato consumado.';

-- =============================================================================
-- ar.apply_recon_match — aplica confirmed; rejected só registra
-- =============================================================================

create or replace function ar.apply_recon_match(
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
  v_recv     ar.receivables;
  v_new_recv bigint;
  v_status   text;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'ar.apply_recon_match: origem do fato não informada'
      using errcode = '22023';
  end if;

  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'ar.apply_recon_match: decisão % não reconhecida', p_decision
      using errcode = '22023';
  end if;

  -- Este módulo só liquida o próprio lado. Evento de payable é ignorado aqui.
  if p_target_kind is distinct from 'receivable' then
    return 'ignored-target';
  end if;

  -- Rejeitar: guarda o fato (idempotente) e não mexe no título.
  if p_decision = 'rejected' then
    insert into ar.recon_settlements (
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

  select * into v_recv
    from ar.receivables
   where tenant_id = p_tenant_id
     and external_ref = p_external_ref
   for update;

  -- Sem título local: NÃO carimba settlement — se o título nascer depois e o
  -- correio reentregar (ou outro match), ainda há chance de aplicar.
  if not found then
    return 'ignored-missing';
  end if;

  insert into ar.recon_settlements (
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

  if v_recv.status = 'cancelled' then
    return 'skipped-cancelled';
  end if;

  if v_recv.currency is distinct from p_currency then
    return 'ignored-currency';
  end if;

  v_new_recv := v_recv.received_amount_cents + p_matched_amount_cents;

  -- Espelho de statusForReceipt no domínio: over-receive → received.
  if v_new_recv <= 0 then
    v_status := 'open';
    v_new_recv := 0;
  elsif v_new_recv >= v_recv.amount_cents then
    v_status := 'received';
  else
    v_status := 'partially_received';
  end if;

  update ar.receivables
     set received_amount_cents = v_new_recv,
         status                = v_status,
         updated_at            = now()
   where id = v_recv.id
     and tenant_id = p_tenant_id;

  return 'applied';
end;
$$;

comment on function ar.apply_recon_match(uuid, text, uuid, text, bigint, char, text, text) is
  'Aplica recon.match.decided no título a receber. Idempotente por match_id. Sem acesso a schema alheio. Só service_role.';

revoke all on function ar.apply_recon_match(uuid, text, uuid, text, bigint, char, text, text)
  from public, anon, authenticated;

-- =============================================================================
-- FIM. Nenhum objeto fora de `ar`.
-- =============================================================================
