-- =============================================================================
-- O MÓDULO 96 NO BANCO — o patrocínio que volta do arquivo, a assimetria entre
-- quem registra a cota e quem só cuida do checklist, o carimbo de entrega do
-- servidor, e o vínculo SOLTO ao evt × a FK real intra-schema do entregável
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os patrocínios de um tenant não aparecem no outro;
--   2. ⭐ **assimetria**: Alfa tem `sponsor.sponsorship.manage` E
--      `sponsor.deliverable.manage`; Beta só tem `sponsor.deliverable.manage`
--      — cuida do checklist mas não registra/arquiva o patrocínio;
--   3. ⭐ **active ↔ archived é REVERSÍVEL** — arquiva e volta (o DIVERGE do
--      lease terminal), sem exigir razão;
--   4. ⭐ **o carimbo de entrega é do SERVIDOR** — `delivered_at`/`delivered_by`
--      mentidos no INSERT/UPDATE são descartados;
--   5. ⭐ **event_id é ID SOLTO** (um id inexistente insere sem erro), MAS o
--      `sponsorship_id` do entregável é FK REAL intra-schema (id inexistente
--      é recusado) — o contraste vínculo-solto × FK-do-próprio-módulo;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta em nenhuma das duas tabelas.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert101(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: sponsor instalado; Alfa registra E cuida do checklist, Beta só o checklist ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sponsor', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sponsor', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sponsor.deliverable.manage', 'sponsor'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ Só o Alfa ganha sponsorship.manage — o Beta fica só com deliverable.manage.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sponsor.sponsorship.manage', 'sponsor'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cuidam do checklist; só o Alfa registra/arquiva patrocínio.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E O EVENT_ID SOLTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu mapa; o patrocínio nasce ativo; event_id solto ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ O event_id NÃO existe em evt nenhum — e insere sem erro: o vínculo é
  -- solto, a integridade daquele dado é do evt, não daqui.
  insert into sponsor.sponsorships (tenant_id, event_id, event_ref, sponsor_name, tier, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'ee000000-0000-4000-8000-000000000099', 'Congresso 2026',
          'Marca Alfa', 'ouro', 5000000, 'BRL')
  returning id into v_id;

  begin
    insert into sponsor.sponsorships (tenant_id, event_id, sponsor_name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'ee000000-0000-4000-8000-000000000098', 'Nasce Errado', 'archived');
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert101(v_erro like '%nasce ativo%', 'o patrocínio nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select count(*) into v_n from sponsor.sponsorships;
  perform pg_temp.assert101(v_n = 0, 'o Beta não enxerga o mapa do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ASSIMETRIA: O BETA CUIDA DO CHECKLIST MAS NÃO REGISTRA/ARQUIVA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Beta só tem deliverable.manage — falha ao registrar/arquivar patrocínio ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into sponsor.sponsorships (tenant_id, event_id, sponsor_name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'ee000000-0000-4000-8000-000000000097', 'Marca Beta');
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: o Beta registrou patrocínio sem sponsorship.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, '⭐ registrar patrocínio exige sponsor.sponsorship.manage — o Beta é barrado');
  end;
end $$;

-- Um patrocínio do tenant do Beta, criado pelo dono do banco só para os testes
-- seguintes (contorna a RLS deliberadamente — é montagem, não é o Beta agindo).
insert into sponsor.sponsorships (tenant_id, event_id, sponsor_name)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'ee000000-0000-4000-8000-000000000096', 'Patrocinador do Beta');

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from sponsor.sponsorships
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and sponsor_name = 'Patrocinador do Beta';

  begin
    update sponsor.sponsorships set status = 'archived' where id = v_id;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: o Beta arquivou sem sponsorship.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, '⭐ arquivar exige sponsor.sponsorship.manage — o Beta é barrado');
  end;

  -- Mas o Beta CUIDA do checklist — é a permissão dele.
  insert into sponsor.deliverables (tenant_id, sponsorship_id, description)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 'logo no palco');
  perform pg_temp.assert101(true, 'o Beta cadastra entregável — deliverable.manage basta');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ active ↔ archived É REVERSÍVEL (o DIVERGE do lease terminal)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivar e reabrir — o mesmo patrocínio, sem exigir razão ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from sponsor.sponsorships
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and sponsor_name = 'Marca Alfa';

  -- ⭐ Arquivar NÃO exige razão (o DIVERGE do lease, cujo ended exige motivo).
  update sponsor.sponsorships set status = 'archived' where id = v_id;
  select status into v_status from sponsor.sponsorships where id = v_id;
  perform pg_temp.assert101(v_status = 'archived', 'arquivou o patrocínio, sem exigir razão');

  update sponsor.sponsorships set status = 'active' where id = v_id;
  select status into v_status from sponsor.sponsorships where id = v_id;
  perform pg_temp.assert101(v_status = 'active', '⭐ o patrocínio VOLTA do arquivo — a mesma relação');

  -- Transição inexistente é barrada.
  begin
    update sponsor.sponsorships set status = 'ended' where id = v_id;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: status fora do ciclo');
  exception when others then
    perform pg_temp.assert101(true, 'status fora de (active,archived) é recusado pelo check');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'sponsor.sponsorship.archived';
  perform pg_temp.assert101(v_n = 1, 'o fato de arquivar saiu');
  select count(*) into v_n from core.event_outbox where event_type = 'sponsor.sponsorship.reopened';
  perform pg_temp.assert101(v_n = 1, 'o fato de reabrir saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O CARIMBO DE ENTREGA É DO SERVIDOR; A FK DO ENTREGÁVEL É REAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: delivered_at/by carimbados pelo servidor; sponsorship_id é FK real ==='

do $$
declare
  v_id uuid; v_deliv uuid; v_at timestamptz; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from sponsor.sponsorships
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and sponsor_name = 'Marca Alfa';

  -- Nasce entregue, mentindo a hora E o autor — os dois são descartados.
  insert into sponsor.deliverables (tenant_id, sponsorship_id, description, delivered, delivered_at, delivered_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, '10 cortesias', true,
          '1999-01-01 00:00+00', '22222222-2222-4222-8222-222222222222')
  returning id, delivered_at, delivered_by into v_deliv, v_at, v_by;

  perform pg_temp.assert101(v_at > now() - interval '1 minute', '⭐ delivered_at é do servidor — a hora mentida foi descartada');
  perform pg_temp.assert101(v_by = '11111111-1111-4111-8111-111111111111', '⭐ delivered_by é quem está autenticado — não o que o INSERT mandou');

  -- Marcar um pendente como feito também carimba o servidor.
  insert into sponsor.deliverables (tenant_id, sponsorship_id, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'ativação no foyer')
  returning id into v_deliv;

  update sponsor.deliverables set delivered = true, delivered_at = '1999-01-01 00:00+00' where id = v_deliv;
  select delivered_at into v_at from sponsor.deliverables where id = v_deliv;
  perform pg_temp.assert101(v_at > now() - interval '1 minute', '⭐ marcar feito carimba a hora do servidor');

  -- ⭐ O sponsorship_id é FK REAL intra-schema — um id inexistente é recusado
  -- (o contraste com o event_id solto do patrocínio).
  begin
    insert into sponsor.deliverables (tenant_id, sponsorship_id, description)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '99999999-9999-4999-8999-999999999999', 'entregável órfão');
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: entregável apontou patrocínio inexistente');
  exception when foreign_key_violation then
    perform pg_temp.assert101(true, '⭐ o sponsorship_id é FK real intra-schema — órfão recusado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid; v_deliv uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from sponsor.sponsorships limit 1;

  begin
    delete from sponsor.sponsorships where id = v_id;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: apagou patrocínio');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, 'apagar patrocínio não existe — arquivar é status');
  end;

  select id into v_deliv from sponsor.deliverables limit 1;
  begin
    delete from sponsor.deliverables where id = v_deliv;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: apagou entregável');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, 'apagar entregável não existe — sem grant de DELETE');
  end;

  begin
    perform sponsor.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sponsor.sponsorship.registered', '{}'::jsonb);
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, 'sponsor.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from sponsor.sponsorships limit 1;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: anon leu sponsor.sponsorships');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, '⭐ anon não encosta em sponsor.sponsorships');
  end;

  begin
    perform 1 from sponsor.deliverables limit 1;
    perform pg_temp.assert101(false, 'DEVERIA TER FALHADO: anon leu sponsor.deliverables');
  exception when insufficient_privilege then
    perform pg_temp.assert101(true, '⭐ anon não encosta em sponsor.deliverables');
  end;

  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 96 OK: camada sobre evt/ctr/deal, assimetria, active↔archived reversível, carimbo do servidor, FK real do entregável, anon fora ==='
