-- =============================================================================
-- O MÓDULO 14 NO BANCO — o livro-caixa imutável, o sinal do tipo, o futuro
-- recusado e o saldo sob RLS
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o livro de um tenant não aparece no saldo do outro — DENTRO da view;
--   2. ⭐ **a permissão do INSERT depende do TIPO** (assimetria user-a ×
--      user-b: o Beta registra, mas não AJUSTA);
--   3. ⭐ **o livro é imutável até para o dono do banco**;
--   4. ⭐ **o futuro é recusado pela constraint** — previsão não entra;
--   5. ajuste sem razão e entrada negativa são recusados pela constraint;
--   6. categoria arquivada não recebe lançamento; reativada, volta a
--      receber — e o livro continua UM;
--   7. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert19(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Fluxo de Caixa nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cash', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe register e manage — mas NÃO adjust.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'cash'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('cash.entry.register'), ('cash.category.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'cash.entry.adjust', 'cash'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois lançam; só o Alfa ajusta.'

-- =============================================================================
-- CENÁRIO 1 — O LIVRO, O SINAL E AS CONSTRAINTS HONESTAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o sinal é do tipo; o futuro e a linha muda são recusados ==='

do $$
declare
  v_signed bigint; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into cash.entries (tenant_id, kind, amount_cents, currency, description, occurred_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'in', 100000, 'BRL', 'venda balcão', current_date - 3);

  insert into cash.entries (tenant_id, kind, amount_cents, currency, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'out', 30000, 'BRL', 'compra de material');

  select signed_amount_cents into v_signed
    from cash.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind = 'out';
  perform pg_temp.assert19(v_signed = -30000, '⭐ a saída virou negativa — o sinal é do TIPO');

  begin
    insert into cash.entries (tenant_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'in', -500, 'BRL');
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: entrada negativa');
  exception when check_violation then
    perform pg_temp.assert19(true, 'entrada negativa é recusada — o operador não escolhe o sinal');
  end;

  begin
    insert into cash.entries (tenant_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'adjustment', -500, 'BRL');
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: ajuste sem razão');
  exception when check_violation then
    perform pg_temp.assert19(true, '⭐ ajuste sem razão é a linha muda — recusado');
  end;

  begin
    insert into cash.entries (tenant_id, kind, amount_cents, currency, occurred_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'in', 500, 'BRL', current_date + 1);
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: lançou o amanhã');
  exception when check_violation then
    perform pg_temp.assert19(true, '⭐ o futuro é recusado — previsão é Orçamento, não caixa');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'cash.entry.registered';
  perform pg_temp.assert19(v_n = 2, 'cash.entry.registered saiu duas vezes');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A ASSIMETRIA DO AJUSTE E A IMUTABILIDADE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Beta registra mas não ajusta; o livro não se rasura ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into cash.entries (tenant_id, kind, amount_cents, currency, description)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'in', 7000, 'BRL', 'recebimento');

  begin
    insert into cash.entries (tenant_id, kind, amount_cents, currency, reason)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'adjustment', -100, 'BRL', 'diferença');
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: ajustou sem adjust');
  exception when insufficient_privilege then
    perform pg_temp.assert19(true, '⭐ sem cash.entry.adjust não se ajusta — quem conta não confere');
  end;

  begin
    update cash.entries set amount_cents = 1
     where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: editou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert19(true, 'o livro não se edita pelo cliente');
  end;

  -- E nem pelo DONO DO BANCO — a terceira camada.
  reset role;
  begin
    update cash.entries set amount_cents = 1 where kind = 'in';
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: editou como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert19(v_erro like '%fato consumado%', '⭐ o livro não se edita nem como dono do banco');
  end;

  begin
    delete from cash.entries where kind = 'in';
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: apagou como dono');
  exception when others then
    perform pg_temp.assert19(true, '⭐ o livro não se apaga nem como dono do banco');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — A CATEGORIA É DADO DO TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivada não recebe; reativada volta — o livro é UM ==='

do $$
declare
  v_cat uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into cash.categories (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aluguel')
  returning id into v_cat;

  begin
    insert into cash.categories (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ALUGUEL');
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: nome ativo duplicado');
  exception when unique_violation then
    perform pg_temp.assert19(true, 'duas categorias ATIVAS com o mesmo nome só geram engano');
  end;

  insert into cash.entries (tenant_id, kind, amount_cents, currency, category_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'out', 350000, 'BRL', v_cat);

  update cash.categories set status = 'archived' where id = v_cat;

  begin
    insert into cash.entries (tenant_id, kind, amount_cents, currency, category_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'out', 1000, 'BRL', v_cat);
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: lançou em categoria arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert19(v_erro like '%arquivada%', 'categoria arquivada não recebe lançamento');
  end;

  -- ⭐ archived → active: a MESMA classificação, o MESMO livro.
  update cash.categories set status = 'active' where id = v_cat;
  insert into cash.entries (tenant_id, kind, amount_cents, currency, category_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'out', 350000, 'BRL', v_cat);

  select count(*) into v_n from cash.entries
   where category_id = v_cat and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert19(v_n = 2, '⭐ reativada volta a receber — e a série é UMA');

  begin
    delete from cash.categories where id = v_cat;
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: apagou categoria');
  exception when insufficient_privilege then
    perform pg_temp.assert19(true, 'apagar categoria não existe — arquivar é status');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — O SALDO SOB RLS, DENTRO DA VIEW
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a view soma só o livro de quem lê ==='

do $$
declare
  v_n int; v_saldo bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select count(*) into v_n from cash.balances;
  perform pg_temp.assert19(v_n = 1, 'o Beta vê UMA linha de saldo — a dele');

  select balance_cents into v_saldo from cash.balances where currency = 'BRL';
  perform pg_temp.assert19(v_saldo = 7000, '⭐ o saldo do Beta soma SÓ o livro do Beta — RLS dentro da view');

  -- E o "sem categoria" aparece honesto na visão por categoria.
  select count(*) into v_n from cash.by_category where category_id is null;
  perform pg_temp.assert19(v_n = 1, 'o sem-categoria aparece — honesto, nunca escondido');
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event não é concedida ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  begin
    perform cash.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cash.entry.registered', '{}'::jsonb);
    perform pg_temp.assert19(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert19(true, 'cash.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 14 OK: livro imutável, sinal do tipo, futuro recusado, saldo sob RLS ==='
