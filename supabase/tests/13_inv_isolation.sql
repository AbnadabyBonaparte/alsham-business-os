-- =============================================================================
-- O MÓDULO 8 NO BANCO — o livro imutável, o saldo calculado e o negativo
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que troca o papel do `user-a` — ver a MONTAGEM).
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:** os testes do
-- pacote provam a LÓGICA. Este prova o EFEITO no banco, e sete coisas que só
-- existem aqui:
--
--   1. dois estoques com o MESMO SKU em tenants diferentes não se veem nem
--      colidem — e no mesmo tenant o SKU duplicado é recusado;
--   2. ⭐ **o livro é imutável nas três camadas**, inclusive para o dono do
--      banco;
--   3. ⭐ **o AJUSTE exige razão** (constraint) **e permissão própria**
--      (`inv.movement.adjust` — a assimetria user-a × user-b prova as duas);
--   4. ⭐ **o saldo NEGATIVO passa** — a decisão de canon do módulo, provada
--      contra o banco de verdade, e a view soma certo por item e por local;
--   5. a view de saldo respeita a RLS (`security_invoker`) — o Beta não soma
--      o estoque do Alfa;
--   6. item arquivado não movimenta, e REATIVADO volta a movimentar — o
--      livro continua sendo UM;
--   7. o fato `inv.movement.registered` sai AUTOSSUFICIENTE: item pelo nome,
--      unidade e saldo resultante, com `produced_by = 'inv'`.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert13(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o Estoque nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inv', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'inv', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe `manage` e `register`, mas **não** `adjust`. É ela
-- que prova, no cenário 4, que o ajuste é mão mais pesada de verdade.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'inv'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('inv.item.manage'), ('inv.movement.register')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'inv.movement.adjust', 'inv'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa ajusta.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E SKU: o código do tenant é DO TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant tem o catálogo dele, e o SKU não cruza ==='

do $$
declare
  v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into inv.items (tenant_id, description, unit, sku) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Parafuso 8mm', 'un', 'PAR-8'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Tinta acrílica branca 18L', 'lata', null);

  -- O MESMO SKU no mesmo tenant: recusado.
  begin
    insert into inv.items (tenant_id, description, unit, sku)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Parafuso 8mm (repetido)', 'un', 'par-8');
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: SKU duplicado no tenant');
  exception when unique_violation then
    perform pg_temp.assert13(true, 'SKU duplicado no MESMO tenant é recusado (caixa ignorada)');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- O MESMO SKU em OUTRO tenant: passa. O código é do tenant, não da casa.
  insert into inv.items (tenant_id, description, unit, sku)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Peça de reposição', 'un', 'PAR-8');

  select count(*) into v_n from inv.items;
  perform pg_temp.assert13(v_n = 1, 'o Beta enxerga só o item dele');

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_n from inv.items;
  perform pg_temp.assert13(v_n = 2, 'e o Alfa vê os dois dele — não o do vizinho');
end $$;

-- =============================================================================
-- CENÁRIO 2 — O FATO SAI AUTOSSUFICIENTE, COM O SALDO RESULTANTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: lançar no livro escreve a caixa de saída, com o item pelo nome ==='

do $$
declare
  v_item uuid; v_n int; v_payload jsonb; v_produtor text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_item from inv.items where sku = 'PAR-8';

  insert into inv.movements (tenant_id, item_id, kind, quantity, external_ref, location)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'in', 100, 'NF 4711', 'depósito 1');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type = 'inv.movement.registered';
  perform pg_temp.assert13(v_n = 1, 'inv.movement.registered saiu uma vez');

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox where event_type = 'inv.movement.registered';
  perform pg_temp.assert13(v_produtor = 'inv', 'produced_by é inv — o cinto assina certo');
  perform pg_temp.assert13(
    v_payload->>'itemDescription' = 'Parafuso 8mm' and v_payload->>'unit' = 'un',
    '⭐ o payload leva o item pelo NOME — quem escuta não faz join');
  perform pg_temp.assert13(
    (v_payload->>'balanceAfter')::numeric = 100,
    '⭐ e leva o SALDO RESULTANTE — quem escuta não soma um livro que não lê');
  perform pg_temp.assert13(
    (v_payload->>'signedQuantity')::numeric = 100,
    'o sinal é do tipo: entrada soma');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O LIVRO É IMUTÁVEL NAS TRÊS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o livro não se edita nem se apaga — nem pelo dono do banco ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Camadas 1 e 2: sem policy e sem grant, o UPDATE morre por privilégio.
  begin
    update inv.movements set quantity = 999 where quantity = 100;
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: cliente editou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert13(true, 'cliente não edita o livro (sem grant, sem policy)');
  end;

  begin
    delete from inv.movements where quantity = 100;
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: cliente apagou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert13(true, 'cliente não apaga o livro');
  end;
end $$;

-- Camada 3: o gatilho, para quem roda como DONO do banco — onde as duas
-- primeiras camadas não valem.
do $$
declare
  v_erro text;
begin
  begin
    update inv.movements set quantity = 999 where quantity = 100;
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: o dono editou o livro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert13(
      v_erro like '%fato consumado%',
      '⭐ nem o dono do banco edita: a camada 3 morde com o erro certo');
  end;

  begin
    delete from inv.movements where quantity = 100;
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: o dono apagou o livro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert13(v_erro like '%AJUSTE%', 'nem apaga: corrigir é lançar ajuste');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O AJUSTE EXIGE RAZÃO E EXIGE A MÃO MAIS PESADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: ajuste sem razão não entra; ajuste sem permissão não entra ==='

do $$
declare
  v_item uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa, com adjust

  select id into v_item from inv.items where sku = 'PAR-8';

  -- Sem razão: a CONSTRAINT recusa, antes de qualquer permissão.
  begin
    insert into inv.movements (tenant_id, item_id, kind, quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'adjustment', -5);
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: ajuste sem razão');
  exception when check_violation then
    perform pg_temp.assert13(true, '⭐ ajuste sem razão é recusado pela constraint');
  end;

  -- Com razão e com a permissão: passa, inclusive NEGATIVO.
  insert into inv.movements (tenant_id, item_id, kind, quantity, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'adjustment', -5,
          'quebra na descarga, conferida em 29/07');
  perform pg_temp.assert13(true, 'ajuste negativo com razão entra no livro');

  -- O Beta tem register mas NÃO tem adjust: entrada passa, ajuste não.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_item from inv.items
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  insert into inv.movements (tenant_id, item_id, kind, quantity)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_item, 'in', 10);

  begin
    insert into inv.movements (tenant_id, item_id, kind, quantity, reason)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_item, 'adjustment', -1, 'tentativa');
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: ajuste sem inv.movement.adjust');
  exception when insufficient_privilege or check_violation then
    -- RLS de INSERT reprovada aparece como violação de policy.
    perform pg_temp.assert13(true, '⭐ sem inv.movement.adjust o ajuste é recusado — quem conta não é quem confere');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ O SALDO NEGATIVO PASSA, E A VIEW CONTA CERTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o físico já saiu — o banco aceita e a tela mostra ==='

do $$
declare
  v_item uuid; v_saldo numeric; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_item from inv.items where description like 'Tinta%';

  -- Nenhuma entrada foi lançada — e a saída acontece no mundo mesmo assim.
  insert into inv.movements (tenant_id, item_id, kind, quantity, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'out', 3,
          'obra da loja centro levou 3 latas');
  perform pg_temp.assert13(true, '⭐⭐ a saída sem saldo PASSA — recusar obrigaria o operador a mentir');

  select balance into v_saldo from inv.balances where item_id = v_item;
  perform pg_temp.assert13(v_saldo = -3, 'e a view mostra o negativo, sem maquiagem');

  -- O saldo do PAR-8: 100 de entrada − 5 de ajuste = 95.
  select balance into v_saldo from inv.balances b
   join inv.items i on i.id = b.item_id where i.sku = 'PAR-8';
  perform pg_temp.assert13(v_saldo = 95, 'o livro soma: 100 − 5 = 95');

  -- Por local: a entrada de 100 foi no 'depósito 1'; o ajuste, sem local.
  select balance into v_saldo from inv.balances_by_location b
   join inv.items i on i.id = b.item_id
   where i.sku = 'PAR-8' and b.location = 'depósito 1';
  perform pg_temp.assert13(v_saldo = 100, 'o saldo por local separa o que tem local');

  -- ⭐ A RLS vale DENTRO da view (security_invoker): o Beta só soma o dele.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from inv.balances;
  perform pg_temp.assert13(v_n = 1, 'o Beta vê UM saldo — o dele');
  select balance into v_saldo from inv.balances;
  perform pg_temp.assert13(v_saldo = 10, 'e é a soma do livro DELE, não do vizinho');
end $$;

-- =============================================================================
-- CENÁRIO 6 — ITEM ARQUIVADO NÃO MOVIMENTA; REATIVADO, VOLTA — E O LIVRO É UM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: arquivar fecha o livro; reativar reabre O MESMO livro ==='

do $$
declare
  v_item uuid; v_erro text; v_saldo numeric; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_item from inv.items where sku = 'PAR-8';

  update inv.items set status = 'archived' where id = v_item;

  begin
    insert into inv.movements (tenant_id, item_id, kind, quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'in', 1);
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: movimentou item arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert13(v_erro like '%arquivado%', 'item arquivado não movimenta');
  end;

  -- ⭐ archived → active: o item que volta é o MESMO item.
  update inv.items set status = 'active' where id = v_item;

  insert into inv.movements (tenant_id, item_id, kind, quantity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_item, 'in', 5);

  select balance into v_saldo from inv.balances where item_id = v_item;
  perform pg_temp.assert13(v_saldo = 100, '⭐ o livro continuou de onde estava: 95 + 5 = 100');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'inv.item.archived';
  perform pg_temp.assert13(v_n = 1, 'arquivar contou o fato próprio dele');
end $$;

-- =============================================================================
-- CENÁRIO 7 — SEM PORTA DE DELETE, E A CANETA DO CORREIO NÃO É DA TELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: apagar item não existe; emitir evento à mão não existe ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    delete from inv.items where sku = 'PAR-8';
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: cliente apagou item');
  exception when insufficient_privilege then
    perform pg_temp.assert13(true, 'apagar item não existe — arquivar é status');
  end;

  begin
    perform inv.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inv.item.registered', '{}'::jsonb);
    perform pg_temp.assert13(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert13(true, 'inv.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 8 OK: livro imutável, saldo calculado, negativo honesto, tenants isolados ==='
