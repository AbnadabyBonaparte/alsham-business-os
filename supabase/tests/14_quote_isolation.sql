-- =============================================================================
-- O MÓDULO 9 NO BANCO — a mesa congelada, o ato carimbado e os fins terminais
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. dois tenants com a MESMA referência de proposta não se veem nem
--      colidem; no mesmo tenant, a referência duplicada é recusada;
--   2. ⭐ **enviar exige conteúdo** — proposta vazia não vai à mesa;
--   3. ⭐ **a mesa congela o conteúdo**: depois de `sent`, item não entra,
--      não muda e não sai — nas três operações;
--   4. ⭐ **o ato é carimbado pelo SERVIDOR**: aceite registra quem e quando
--      via `auth.uid()`/`now()`, exige `decide` (assimetria user-a × user-b)
--      e os fins são TERMINAIS de verdade, contra o gatilho real;
--   5. ⭐ **expirar só com validade vencida** — calendário, nunca vontade;
--   6. retirar exige `cancel`, e o fato certo sai na caixa de saída.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert14(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Propostas nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quote', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'quote', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe SÓ `manage` — nem `decide`, nem `cancel`.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'quote.proposal.manage', 'quote'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'quote'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('quote.proposal.decide'), ('quote.proposal.cancel')) as p(k)
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa decide e retira.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E REFERÊNCIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: a referência é do tenant, não da casa ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into quote.proposals (tenant_id, external_ref, currency, prospect_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PROP-0001', 'BRL', 'Prospecto Um');

  begin
    insert into quote.proposals (tenant_id, external_ref, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PROP-0001', 'BRL');
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: referência duplicada no tenant');
  exception when unique_violation then
    perform pg_temp.assert14(true, 'referência duplicada no MESMO tenant é recusada');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into quote.proposals (tenant_id, external_ref, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'PROP-0001', 'BRL');

  select count(*) into v_n from quote.proposals;
  perform pg_temp.assert14(v_n = 1, 'o Beta enxerga só a proposta dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ENVIAR EXIGE CONTEÚDO, E O FATO SAI
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: proposta vazia não vai à mesa ==='

do $$
declare
  v_id uuid; v_erro text; v_n int; v_total bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from quote.proposals where external_ref = 'PROP-0001'
   and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    update quote.proposals set status = 'sent' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: enviou proposta vazia');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(v_erro like '%ao menos um item%', 'proposta vazia não vai à mesa');
  end;

  insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Consultoria — pacote mensal', 10, 15000);

  select total_cents into v_total from quote.proposals where id = v_id;
  perform pg_temp.assert14(v_total = 150000, 'o total é a soma das linhas, por trigger');

  update quote.proposals set status = 'sent' where id = v_id;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'quote.proposal.sent';
  perform pg_temp.assert14(v_n = 1, 'quote.proposal.sent saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A MESA CONGELA O CONTEÚDO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o que foi posto na mesa não muda mais ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from quote.proposals where external_ref = 'PROP-0001'
   and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    update quote.proposal_items set quantity = 99 where proposal_id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: mudou item de proposta enviada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(v_erro like '%mesa%', 'item de proposta enviada não muda');
  end;

  begin
    insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 2, 'linha nova', 1, 100);
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: acrescentou item após envio');
  exception when others then
    perform pg_temp.assert14(true, 'item não entra depois do envio');
  end;

  begin
    delete from quote.proposal_items where proposal_id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: apagou item após envio');
  exception when others then
    perform pg_temp.assert14(true, 'item não sai depois do envio');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O ATO É CARIMBADO, EXIGE DECIDE, E O FIM É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: aceite com quem e quando; recusado sem decide ==='

do $$
declare
  v_id uuid; v_erro text; v_by uuid; v_at timestamptz; v_n int;
begin
  set local role authenticated;

  -- O Beta (sem decide) monta e envia a dele — e não consegue aceitar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id from quote.proposals
   where external_ref = 'PROP-0001' and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 1, 'Serviço', 1, 50000);
  update quote.proposals set status = 'sent' where id = v_id;

  begin
    update quote.proposals set status = 'accepted' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: aceitou sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(
      v_erro like '%quote.proposal.decide%',
      '⭐ sem decide não se registra aceite — com o nome da permissão no erro');
  end;

  -- O Alfa aceita a dele, e o carimbo é do servidor.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from quote.proposals
   where external_ref = 'PROP-0001' and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  update quote.proposals
     set status = 'accepted', decision_note = 'aceite por e-mail em 29/07'
   where id = v_id;

  select decided_by, decided_at into v_by, v_at from quote.proposals where id = v_id;
  perform pg_temp.assert14(
    v_by = '11111111-1111-4111-8111-111111111111' and v_at is not null,
    '⭐ o aceite carimbou QUEM e QUANDO — pelo servidor, não pela tela');

  -- Terminal é terminal.
  begin
    update quote.proposals set status = 'sent' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: proposta aceita voltou à mesa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(
      v_erro like '%documento novo%',
      '⭐ aceita não volta: renegociar é documento novo');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'quote.proposal.accepted';
  perform pg_temp.assert14(v_n = 1, 'quote.proposal.accepted saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ EXPIRAR É CALENDÁRIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: expirar só com validade vencida ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Sem validade: não expira nunca.
  insert into quote.proposals (tenant_id, external_ref, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PROP-SEM-VALIDADE', 'BRL')
  returning id into v_id;
  insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Serviço', 1, 1000);
  update quote.proposals set status = 'sent' where id = v_id;

  begin
    update quote.proposals set status = 'expired' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: expirou sem validade');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(v_erro like '%sem validade%', 'sem validade não expira nunca');
  end;

  -- Validade no futuro: também não.
  insert into quote.proposals (tenant_id, external_ref, currency, valid_until)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PROP-NO-PRAZO', 'BRL', current_date + 30)
  returning id into v_id;
  insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Serviço', 1, 1000);
  update quote.proposals set status = 'sent' where id = v_id;

  begin
    update quote.proposals set status = 'expired' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: expirou dentro do prazo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert14(v_erro like '%ainda não venceu%', 'no prazo não se expira — calendário, nunca vontade');
  end;

  -- Validade vencida: passa, com manage.
  insert into quote.proposals (tenant_id, external_ref, currency, valid_until)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PROP-VENCIDA', 'BRL', current_date - 1)
  returning id into v_id;
  insert into quote.proposal_items (tenant_id, proposal_id, line_no, description, quantity, unit_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Serviço', 1, 1000);
  update quote.proposals set status = 'sent' where id = v_id;
  update quote.proposals set status = 'expired' where id = v_id;
  perform pg_temp.assert14(true, '⭐ com validade vencida, expirar passa');
end $$;

-- =============================================================================
-- CENÁRIO 6 — RETIRAR EXIGE CANCEL; APAGAR NÃO EXISTE; A CANETA É DO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: retirar é permissão própria; apagar não existe ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;

  -- O Beta (sem cancel) não retira a proposta enviada dele.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id from quote.proposals
   where external_ref = 'PROP-0001' and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  begin
    update quote.proposals set status = 'cancelled' where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: retirou sem cancel');
  exception when insufficient_privilege then
    perform pg_temp.assert14(true, 'sem quote.proposal.cancel não se retira');
  end;

  begin
    delete from quote.proposals where id = v_id;
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: apagou proposta');
  exception when insufficient_privilege then
    perform pg_temp.assert14(true, 'apagar proposta não existe — retirar é status');
  end;

  begin
    perform quote.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'quote.proposal.sent', '{}'::jsonb);
    perform pg_temp.assert14(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert14(true, 'quote.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 9 OK: mesa congelada, ato carimbado, fins terminais, tenants isolados ==='
