-- =============================================================================
-- O MÓDULO 33 NO BANCO — o roster que se isola, o afastamento que volta e o
-- desligamento que não volta (com razão e permissão própria)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os colaboradores de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta CADASTRA e afasta, mas NÃO DESLIGA;
--   2. ⭐ **on_leave ↔ active** — o afastamento VOLTA (dois tipos de "parar",
--      uma só definitiva: o contraste interno assinado);
--   3. ⭐ **terminated é TERMINAL e exige RAZÃO** — desligar em silêncio não
--      existe; e desligado CONGELA;
--   4. ⭐ **desligar exige hr.employee.decide** — o Beta é barrado;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Nome é dado neutro; zero CPF/saúde/banco. Script
-- descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert38(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: hr instalado nos dois tenants; Alfa decide, Beta só cadastra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hr', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hr', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: os dois CADASTRAM (manage); só o Alfa DESLIGA (decide).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'hr.employee.manage', 'hr'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'hr.employee.decide', 'hr'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa desliga.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O NASCIMENTO ATIVO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu roster; o colaborador nasce ativo ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into hr.employees (tenant_id, full_name, role_title, department, hired_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ana Vendedora', 'Vendedora', 'Comercial', '2026-01-06')
  returning id into v_id;

  -- Nasce ativo, mesmo se o formulário insistir em outra coisa.
  begin
    insert into hr.employees (tenant_id, full_name, role_title, hired_on, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'X', '2026-01-06', 'terminated');
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: nasceu desligado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert38(v_erro like '%nasce ativo%', 'o colaborador nasce ativo — não desligado');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into hr.employees (tenant_id, full_name, role_title, hired_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Beto do Beta', 'Analista', '2026-02-01');

  select count(*) into v_n from hr.employees;
  perform pg_temp.assert38(v_n = 1, 'o Beta enxerga só o roster dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ on_leave ↔ active: O AFASTAMENTO VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: afastar e reintegrar — o mesmo registro; carimbo nenhum fica ==='

do $$
declare
  v_id uuid; v_status text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from hr.employees
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and full_name = 'Ana Vendedora';

  update hr.employees set status = 'on_leave' where id = v_id;
  select status into v_status from hr.employees where id = v_id;
  perform pg_temp.assert38(v_status = 'on_leave', 'afastou — on_leave');

  update hr.employees set status = 'active' where id = v_id;
  select status into v_status from hr.employees where id = v_id;
  perform pg_temp.assert38(v_status = 'active', '⭐ o afastamento VOLTA — o mesmo registro reintegra');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ terminated: TERMINAL, COM RAZÃO, E CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: desligar exige razão; é terminal; e congela ==='

do $$
declare
  v_id uuid; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from hr.employees
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and full_name = 'Ana Vendedora';

  begin
    update hr.employees set status = 'terminated' where id = v_id;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: desligou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert38(v_erro like '%razão%', 'desligar exige a razão escrita');
  end;

  update hr.employees
     set status = 'terminated', termination_reason = 'pediu demissão'
   where id = v_id;

  select terminated_by into v_by from hr.employees where id = v_id;
  perform pg_temp.assert38(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o desligamento carimbou QUEM — pelo servidor');

  -- Terminal: não volta.
  begin
    update hr.employees set status = 'active' where id = v_id;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: o desligado voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert38(v_erro like '%terminal%', '⭐ terminated é terminal — quem volta é admissão nova');
  end;

  -- Congela.
  begin
    update hr.employees set role_title = 'rasura' where id = v_id;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: editou desligado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert38(v_erro like '%não se edita%', 'desligado congela inteiro');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ DESLIGAR EXIGE hr.employee.decide: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o Beta cadastra e afasta, mas não desliga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from hr.employees
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and full_name = 'Beto do Beta';

  -- Afastar ele consegue (manage).
  update hr.employees set status = 'on_leave' where id = v_id;
  perform pg_temp.assert38(true, 'o Beta afasta — manage basta');
  update hr.employees set status = 'active' where id = v_id;

  -- Desligar não (falta decide).
  begin
    update hr.employees set status = 'terminated', termination_reason = 'tentativa' where id = v_id;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: o Beta desligou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert38(v_erro like '%hr.employee.decide%', '⭐ desligar exige hr.employee.decide');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from hr.employees limit 1;

  begin
    delete from hr.employees where id = v_id;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: apagou colaborador');
  exception when insufficient_privilege then
    perform pg_temp.assert38(true, 'apagar não existe — desligar é status com razão');
  end;

  begin
    perform hr.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hr.employee.hired', '{}'::jsonb);
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert38(true, 'hr.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ ANON NÃO ENCOSTA — com o papel real.
do $$
begin
  set local role anon;
  begin
    perform 1 from hr.employees limit 1;
    perform pg_temp.assert38(false, 'DEVERIA TER FALHADO: anon leu hr.employees');
  exception when insufficient_privilege then
    perform pg_temp.assert38(true, '⭐ anon não encosta em hr.employees');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 33 OK: roster isolado, afastamento reversível, desligamento terminal com razão e permissão, anon fora ==='
