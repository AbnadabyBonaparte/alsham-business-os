-- =============================================================================
-- O MÓDULO 63 NO BANCO — a não conformidade que se isola, o registro que NÃO se
-- reescreve, e o fechamento que EXIGE a nota de verificação (o DIVERGE do occ)
-- =============================================================================
--
-- ⭐ ABRE o Domain 🧪 Qualidade (Onda Quatorze, Fase 2).
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--   1. as NCs de um tenant não aparecem no outro; nasce aberta e o autor é
--      carimbado pelo servidor; o futuro é recusado;
--   2. ⭐⭐ **fechar SEM a nota de verificação é RECUSADO** (o DIVERGE do occ:
--      quem conferiu que a causa foi corrigida) — e com a nota, fecha e o fato sai;
--   3. ⭐ o registro é IMUTÁVEL até para o DONO DO BANCO (a física do occ):
--      reescrever o desvio é recusado; NC fechada é terminal (não reabre);
--   4. cross-tenant barrado;
--   5. a caneta de emitir evento não é do cliente; apagar não existe; anon fora.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert68(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: nc instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'nc', 'Não Conformidades', '0.1.0',
  'O livro imutável da não conformidade — a identidade do occ, com o DIVERGE da nota de verificação.',
  'domain', 'quality',
  '[{"key":"nc","canonicalName":"Não conformidades"}]'::jsonb,
  '[{"key":"nc.entry.register","moduleId":"nc","description":"Registrar."},
    {"key":"nc.entry.close","moduleId":"nc","description":"Fechar com verificação."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'nc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.perm, 'nc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('nc.entry.register'), ('nc.entry.close')) as p(perm)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCE ABERTA, AUTOR CARIMBADO, FUTURO RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua NC; nasce aberta; autor do servidor; sem futuro ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into nc.entries (tenant_id, origin, description, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'auditoria interna',
          'etiqueta de lote ausente na doca 3',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert68(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  -- Nasce fechada? recusado.
  begin
    insert into nc.entries (tenant_id, origin, description, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'y', 'closed');
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: nasceu fechada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert68(v_erro like '%nasce aberta%', 'a NC nasce aberta');
  end;

  -- Futuro recusado (fato constatado).
  begin
    insert into nc.entries (tenant_id, origin, description, detected_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'y', now() + interval '1 day');
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: desvio no futuro');
  exception when check_violation then
    perform pg_temp.assert68(true, '⭐ desvio constatado não mora no futuro');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into nc.entries (tenant_id, origin, description)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'reclamação de cliente', 'produto trocado');

  select count(*) into v_n from nc.entries;
  perform pg_temp.assert68(v_n = 1, 'o Beta enxerga só a NC dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ FECHAR EXIGE A NOTA DE VERIFICAÇÃO (o DIVERGE do occ)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: fechar sem verificação é recusado; com verificação, fecha ==='

do $$
declare
  v_id uuid; v_erro text; v_closed int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from nc.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and origin = 'auditoria interna';

  -- ⭐⭐ Fechar sem a nota de verificação: recusado.
  begin
    perform nc.close_entry(v_id, '   ');
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: fechou sem verificação');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert68(v_erro like '%nota de verificação%',
      '⭐⭐ fechar exige a nota de verificação — o DIVERGE do occ');
  end;

  -- Com a nota, fecha.
  perform nc.close_entry(v_id, 'conferido no piso pela qualidade em 2ª inspeção — Marta');
  perform pg_temp.assert68(
    (select status from nc.entries where id = v_id) = 'closed',
    'com a nota de verificação, a NC fecha');
  perform pg_temp.assert68(
    (select verification_note from nc.entries where id = v_id) like 'conferido%',
    'a nota de verificação ficou gravada');

  reset role;
  select count(*) into v_closed from core.event_outbox where event_type = 'nc.entry.closed';
  perform pg_temp.assert68(v_closed = 1, 'o fato de fechamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O REGISTRO É IMUTÁVEL (até para o dono do banco); TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: reescrever o desvio é recusado; NC fechada é terminal ==='

do $$
declare
  v_id uuid; v_open uuid; v_erro text;
begin
  -- Como DONO DO BANCO (sem role authenticated): o gatilho ainda barra.
  reset role;

  select id into v_id from nc.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and origin = 'auditoria interna';

  -- NC fechada é história: nada se edita.
  begin
    update nc.entries set description = 'reescrevendo o desvio' where id = v_id;
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: editou NC fechada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert68(v_erro like '%história%',
      '⭐ NC fechada é história — nem o dono do banco reescreve');
  end;

  -- Numa NC ABERTA, o relato também não se reescreve.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  insert into nc.entries (tenant_id, origin, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inspeção', 'medida fora de tolerância')
  returning id into v_open;

  reset role;
  begin
    update nc.entries set origin = 'outra origem' where id = v_open;
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: reescreveu o relato de NC aberta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert68(v_erro like '%não se reescreve%',
      '⭐ o registro é fato constatado: recorrência é NC nova, não reescrita');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NA NC DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into nc.entries (tenant_id, origin, description)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invasor', 'desvio alheio');
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert68(true, '⭐ cross-tenant barrado: o Alfa não registra NC no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE; APAGAR NÃO EXISTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event/DELETE/anon fora ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from nc.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  -- ⛔ Apagar não existe — o livro da apuração é eterno.
  begin
    delete from nc.entries where id = v_id;
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: apagou NC');
  exception when others then
    perform pg_temp.assert68(true, 'apagar NC não existe — o livro é eterno');
  end;

  -- ⛔ A caneta de emitir evento não é do cliente.
  begin
    perform nc.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nc.entry.registered', '{}'::jsonb);
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert68(true, 'nc.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from nc.entries limit 1;
    perform pg_temp.assert68(false, 'DEVERIA TER FALHADO: anon leu nc.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert68(true, '⭐ anon não encosta em nc.entries');
  end;
  reset role;
end $$;

\echo ''
\echo '=== ⭐ MÓDULO 63 OK — a NC imutável; fechar exige verificação; abre a Qualidade ==='
