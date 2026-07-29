-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0012_recon_match_decided.sql
-- Quando um casamento é confirmado ou rejeitado, o fato sai pela porta.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — depois de `0010` e `0011`.
-- Ver docs/runbook/APLICAR.md.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
-- -----------------------------------------------------------------------------
-- Confirmar casamento na mesa só fazia UPDATE em `reconciliation_matches`.
-- Sem evento, Contas a Pagar / a Receber não tinham o que escutar para liquidar
-- o título — `consumes` deles ficava vazio por Lei 7 (handler inexistente).
--
-- Este arquivo:
--   1. emite `recon.match.decided` na transição suggested → confirmed|rejected
--      (e também no INSERT já decidido);
--   2. payload AUTOSSUFICIENTE: quem escuta não faz join em schema alheio.
--
-- ⛔ Só cria objeto no schema `recon`. A porta que o AR usa para aplicar a
-- baixa nasce em `0013_ar_apply_recon_match.sql` — migration com um schema
-- dono, mesma decisão do par `0007`/`0008`.
-- =============================================================================

create or replace function recon.on_match_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind          text;
  v_external_ref  text;
  v_currency      char(3);
  v_target_id     uuid;
begin
  if new.status not in ('confirmed', 'rejected') then
    return new;
  end if;

  -- Só a primeira decisão conta. Reentregar o mesmo status não reemite.
  if TG_OP = 'UPDATE' then
    if old.status = new.status then
      return new;
    end if;
    if old.status <> 'suggested' then
      return new;
    end if;
  end if;

  if new.receivable_id is not null then
    v_kind := 'receivable';
    v_target_id := new.receivable_id;
    select r.external_ref, r.currency
      into v_external_ref, v_currency
      from recon.receivables r
     where r.id = new.receivable_id
       and r.tenant_id = new.tenant_id;
  elsif new.payable_id is not null then
    v_kind := 'payable';
    v_target_id := new.payable_id;
    select p.external_ref, p.currency
      into v_external_ref, v_currency
      from recon.payables p
     where p.id = new.payable_id
       and p.tenant_id = new.tenant_id;
  else
    -- CHECK matches_one_target deveria impedir; se falhar, não inventa fato.
    return new;
  end if;

  if v_external_ref is null then
    raise exception 'recon.on_match_decided: título % sumiu antes do evento', v_target_id
      using errcode = '23503';
  end if;

  perform recon.emit_event(
    new.tenant_id,
    'recon.match.decided',
    jsonb_build_object(
      'matchId',            new.id,
      'decision',           new.status,
      'targetKind',         v_kind,
      'targetId',           v_target_id,
      'externalRef',        v_external_ref,
      'matchedAmountCents', new.matched_amount_cents,
      'currency',           v_currency,
      'statementLineId',    new.statement_line_id,
      'score',              new.score,
      'origin',             new.origin,
      'strategy',           new.strategy,
      'decidedBy',          new.decided_by,
      'decidedAt',          new.decided_at
    )
  );

  return new;
end;
$$;

comment on function recon.on_match_decided() is
  'Emite recon.match.decided quando um casamento passa a confirmed|rejected. Payload autossuficiente — o consumidor não lê recon.*.';

create trigger matches_emit_decided
  after insert or update of status on recon.reconciliation_matches
  for each row execute function recon.on_match_decided();

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum objeto fora de `recon`.
-- =============================================================================
