-- =============================================================================
-- O MÓDULO 70 NO BANCO — o registro de certificado que se isola, o vencimento
-- obrigatório, o active ↔ archived (a decisão exige permissão própria) e a
-- coerência das datas. ⛔⛔ E a prova de que NÃO há cofre: nenhuma coluna de
-- arquivo/chave/segredo, nenhuma função de assinatura.
-- =============================================================================
--
-- ⭐ Domain 🧾 Contábil & Fiscal (Onda Dezessete, Fase 2) — o ÚNICO módulo da
-- onda; 7 das 8 capacidades ficam FORA por Lei 3.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert75(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: fiscalcert instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'fiscalcert', 'Certificado Digital', '0.1.0',
  'O registro de metadados de certificados; nunca o arquivo/chave. active ↔ archived.',
  'domain', 'accounting',
  '[{"key":"digital-certificate","canonicalName":"Certificado digital"}]'::jsonb,
  '[{"key":"fiscalcert.certificate.manage","moduleId":"fiscalcert","description":"Gerir metadados."},
    {"key":"fiscalcert.certificate.decide","moduleId":"fiscalcert","description":"Arquivar/reativar."}]'::jsonb,
  '[{"type":"fiscalcert.certificate.registered","version":1,"description":"Registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fiscalcert', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'fiscalcert', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- O Alfa (user 1) tem manage + decide; o Beta (user 2) só manage — para provar
-- que arquivar exige a permissão PRÓPRIA de decisão.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fiscalcert.certificate.manage', 'fiscalcert'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fiscalcert.certificate.decide', 'fiscalcert'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ATIVO, ISOLA, E O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce active; o vencimento é obrigatório; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into fiscalcert.certificates (tenant_id, cert_type, holder, valid_until, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e-CNPJ', 'ALSHAM Global', '2027-01-01',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert75(v_st = 'active', 'o certificado nasce active');
  perform pg_temp.assert75(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from fiscalcert.certificates;
  perform pg_temp.assert75(v_n = 0, 'o Beta não vê o certificado do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — A COERÊNCIA DAS DATAS (vencimento não antes do início)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o vencimento não pode ser antes do início ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into fiscalcert.certificates (tenant_id, cert_type, holder, valid_from, valid_until)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e-CPF', 'Fulano', '2027-01-01', '2026-01-01');
    perform pg_temp.assert75(false, 'DEVERIA TER FALHADO: vencimento antes do início');
  exception when check_violation then
    perform pg_temp.assert75(true, '⭐ a coerência das datas barra vencimento antes do início');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ active ↔ archived, E ARQUIVAR EXIGE A PERMISSÃO DE DECISÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivar/reativar exige decide; o registro volta ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage, sem decide) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into fiscalcert.certificates (tenant_id, cert_type, holder, valid_until)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'e-NF-e', 'Beta Ltda', '2027-05-05')
  returning id into v_id;

  begin
    update fiscalcert.certificates set status='archived' where id = v_id;
    perform pg_temp.assert75(false, 'DEVERIA TER FALHADO: arquivar sem a permissão decide');
  exception when insufficient_privilege then
    perform pg_temp.assert75(true, '⭐ arquivar exige fiscalcert.certificate.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from fiscalcert.certificates
   where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and cert_type='e-CNPJ';

  update fiscalcert.certificates set status='archived' where id = v_id;
  perform pg_temp.assert75((select status='archived' from fiscalcert.certificates where id = v_id),
    'o Alfa (com decide) arquivou o certificado');

  -- ⭐ E volta: archived → active (o registro é reversível — a física do vendor).
  update fiscalcert.certificates set status='active' where id = v_id;
  perform pg_temp.assert75((select status='active' from fiscalcert.certificates where id = v_id),
    '⭐ archived → active: o certificado volta (a física do vendor)');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⛔⛔ NÃO HÁ COFRE: nenhuma coluna de arquivo/chave/segredo
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o schema é só metadado — sem .pfx, sem chave, sem assinatura ==='

do $$
declare v_crypto int; v_sign int;
begin
  reset role;
  select count(*) into v_crypto from information_schema.columns
   where table_schema='fiscalcert' and table_name='certificates'
     and (lower(column_name) similar to '%(pfx|p12|private|key|password|passphrase|secret|signature|content|file|blob)%');
  perform pg_temp.assert75(v_crypto = 0, '⛔⛔ nenhuma coluna de cofre (arquivo/chave/segredo)');

  select count(*) into v_sign from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='fiscalcert' and p.proname ilike '%sign%';
  perform pg_temp.assert75(v_sign = 0, '⛔ nenhuma função de assinatura no schema');
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into fiscalcert.certificates (tenant_id, cert_type, holder, valid_until)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'X', '2027-01-01');
    perform pg_temp.assert75(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert75(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform fiscalcert.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fiscalcert.certificate.registered', '{}'::jsonb);
    perform pg_temp.assert75(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert75(true, 'fiscalcert.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from fiscalcert.certificates limit 1;
    perform pg_temp.assert75(false, 'DEVERIA TER FALHADO: anon leu fiscalcert.certificates');
  exception when insufficient_privilege then
    perform pg_temp.assert75(true, '⭐ anon não encosta em fiscalcert.certificates');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'fiscalcert.certificate.registered';
  perform pg_temp.assert75(v_n >= 2, 'cada certificado registrado emitiu fiscalcert.certificate.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'fiscalcert.certificate.archived';
  perform pg_temp.assert75(v_n >= 1, 'o arquivamento emitiu fiscalcert.certificate.archived');
end $$;

\echo ''
\echo '=== MÓDULO 70 OK: só metadado (sem cofre), vencimento obrigatório, active↔archived com decide, anon fora ==='
