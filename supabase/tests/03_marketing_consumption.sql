-- =============================================================================
-- O SEGUNDO MÓDULO — isolamento, e a prova do consumo NO BANCO
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql`, que já criou os tenants Alfa e Beta e
-- os três usuários. Aqui se prova o que o `0004_marketing.sql` acrescentou.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:** os testes do
-- pacote provam a LÓGICA do consumo com uma projeção de mentira. Este prova o
-- EFEITO no banco de verdade — inclusive as três coisas que só o banco pode
-- garantir:
--
--   1. o `unique` recusa o fato repetido, mesmo se o correio falhar;
--   2. um usuário real **não consegue** escrever a projeção;
--   3. a campanha de um tenant não é carimbada pela decisão de outro.
--
-- A terceira é a que dá pesadelo: `record_spend_decision` é SECURITY DEFINER,
-- e função SECURITY DEFINER escrita sem cuidado é exatamente como se atravessa
-- a RLS sem perceber.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert3(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o módulo instalado e uma campanha em cada tenant ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'marketing', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'marketing', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ Os DOIS tenants usam a MESMA referência de verba, de propósito. Referência
-- é string escolhida pelo tenant: dois clientes diferentes podem perfeitamente
-- ter um "AP-2026-0001" cada um. Se o isolamento dependesse de a string ser
-- única no mundo, ele não seria isolamento.
insert into marketing.campaigns (id, tenant_id, name, budget_ref, budget_planned_cents, currency)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Campanha Alfa', 'AP-2026-0001', 500000, 'BRL'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Campanha Beta', 'AP-2026-0001', 700000, 'BRL')
on conflict (id) do nothing;

-- As permissões do marketing, no papel DE TENANT — como o instalador faria.
-- (Antes vinham do papel de sistema, pelo seed; ver o comentário no teste 01.)
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, v.k, 'marketing'
  from core.roles r
 cross join (values ('marketing.campaign.manage'), ('marketing.campaign.publish'), ('marketing.result.record')) v(k)
 where r.tenant_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and r.key = 'admin'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: uma campanha por tenant, ambas com budget_ref AP-2026-0001.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ O EFEITO ACONTECE, E ACONTECE UMA VEZ SÓ
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o fato chega, carimba, e não carimba de novo ==='

do $$
declare v_primeira int; v_segunda int; v_status text; v_linhas int;
begin
  -- Como o correio: `service_role`, do servidor, com o conteúdo do payload.
  select marketing.record_spend_decision(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'AP-2026-0001',
    'approved', 500000, 'BRL', now()) into v_primeira;

  raise notice 'primeira entrega: % campanha(s) afetada(s)', v_primeira;
  perform pg_temp.assert3(v_primeira = 1, 'a primeira entrega carimba a campanha');

  select budget_status into v_status from marketing.campaigns
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  perform pg_temp.assert3(v_status = 'approved',
    'a campanha do Alfa ficou sabendo — sem ninguém digitar nada nela');

  -- A REENTREGA. É o replay, a restauração, o segundo correio ligado por
  -- engano. Nada disso pode contar duas vezes.
  select marketing.record_spend_decision(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'AP-2026-0001',
    'approved', 500000, 'BRL', now()) into v_segunda;

  raise notice 'reentrega do MESMO fato: % campanha(s) afetada(s)', v_segunda;
  perform pg_temp.assert3(v_segunda = 0,
    'a reentrega não repete o efeito — e o retorno 0 diz isso a quem chamou');

  select count(*) into v_linhas from marketing.spend_approvals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert3(v_linhas = 1, 'a projeção continua com UMA linha');
end
$$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A DECISÃO DE UM TENANT NÃO ATRAVESSA PARA O OUTRO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: mesma referência, tenants diferentes ==='

do $$
declare v_alfa text; v_beta text; v_afetadas int;
begin
  select budget_status into v_alfa from marketing.campaigns
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  select budget_status into v_beta from marketing.campaigns
   where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  raise notice 'Alfa=% · Beta=%', v_alfa, v_beta;
  perform pg_temp.assert3(v_alfa = 'approved' and v_beta = 'none',
    'a decisão do Alfa NÃO carimbou a campanha do Beta, apesar da mesma referência');

  -- E o Beta recebe a dele normalmente, com o mesmo texto de referência.
  select marketing.record_spend_decision(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recon', 'AP-2026-0001',
    'rejected', 700000, 'BRL', now()) into v_afetadas;
  perform pg_temp.assert3(v_afetadas = 1, 'o Beta recebe a decisão dele, independente');

  select budget_status into v_alfa from marketing.campaigns
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  perform pg_temp.assert3(v_alfa = 'approved',
    'e a decisão do Beta não reescreveu a do Alfa');
end
$$;

-- =============================================================================
-- CENÁRIO 3 — ⛔ O CLIENTE NÃO ESCREVE A PRÓPRIA APROVAÇÃO DE VERBA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: usuário real tentando forjar a projeção ==='

do $$
declare v_erro text; v_linhas int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- admin do Alfa

  begin
    insert into marketing.spend_approvals
      (tenant_id, source_module_id, external_ref, decision)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'AP-FORJADA', 'approved');
    raise exception '  ❌ FALHOU: o admin conseguiu lançar a própria aprovação de verba';
  exception
    when insufficient_privilege or others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ o INSERT foi recusado (%)', left(v_erro, 60);
  end;

  select count(*) into v_linhas from marketing.spend_approvals where external_ref = 'AP-FORJADA';
  perform pg_temp.assert3(v_linhas = 0, 'nenhuma linha forjada entrou');
end
$$;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- E nem pela porta dos fundos: a função do correio não é concedida.
  begin
    perform marketing.record_spend_decision(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'AP-FUNDOS', 'approved');
    raise exception '  ❌ FALHOU: authenticated executou a função do correio';
  exception
    when insufficient_privilege then
      raise notice '  ✅ authenticated não pode executar marketing.record_spend_decision';
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ a chamada foi recusada (%)', left(v_erro, 60);
  end;
end
$$;

-- =============================================================================
-- CENÁRIO 4 — o isolamento de leitura, nos dois sentidos
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cada tenant lê o próprio ==='

do $$
declare v_campanhas int; v_aprovacoes int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select count(*) into v_campanhas   from marketing.campaigns;
  select count(*) into v_aprovacoes  from marketing.spend_approvals;
  raise notice 'admin do Alfa enxerga: campanhas=% aprovacoes=%', v_campanhas, v_aprovacoes;
  perform pg_temp.assert3(v_campanhas = 1, 'vê a própria campanha, não a do Beta');
  perform pg_temp.assert3(v_aprovacoes = 1, 'vê a própria decisão de verba, não a do Beta');
end
$$;

do $$
declare v_campanhas int; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select count(*) into v_campanhas from marketing.campaigns;
  select name into v_nome from marketing.campaigns;
  raise notice 'admin do Beta enxerga % campanha(s): %', v_campanhas, v_nome;
  perform pg_temp.assert3(v_campanhas = 1 and v_nome = 'Campanha Beta',
    'o espelho vale: o Beta só vê o Beta');
end
$$;

-- =============================================================================
-- CENÁRIO 5 — quem cria não é quem publica
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a separação entre manage e publish é real ==='

-- Um papel de tenant que gerencia campanha mas NÃO publica. É o organograma
-- que o cliente monta — o produto permite as duas na mesma pessoa, mas não
-- presume.
insert into core.roles (tenant_id, key, name, description) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'redator',
   'Cria campanha, não publica', 'Papel de tenant: prepara, não põe no ar.')
on conflict (tenant_id, key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'marketing.campaign.manage', 'marketing'
  from core.roles r
 where r.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and r.key = 'redator'
on conflict (role_id, permission_key) do nothing;

insert into core.memberships (tenant_id, user_id, role_key, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '33333333-3333-4333-8333-333333333333', 'redator', 'active')
on conflict (tenant_id, user_id) do update set role_key = excluded.role_key;

do $$
declare v_erro text; v_status text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- redator

  -- Editar o texto: pode.
  update marketing.campaigns set description = 'texto ajustado pelo redator'
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise notice '  ✅ o redator editou a campanha';

  -- Pôr no ar: não pode. E quem recusa é o TRIGGER, porque policy de UPDATE
  -- não enxerga o estado anterior e não saberia distinguir uma coisa da outra.
  begin
    update marketing.campaigns
       set status = 'published', published_at = now()
     where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception '  ❌ FALHOU: o redator publicou sem marketing.campaign.publish';
  exception
    when insufficient_privilege then
      raise notice '  ✅ publicar foi recusado por falta de permissão';
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ publicar foi recusado (%)', left(v_erro, 70);
  end;
end
$$;

do $$
declare v_status text;
begin
  select status into v_status from marketing.campaigns
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  perform pg_temp.assert3(v_status = 'draft', 'a campanha continua em rascunho');
end
$$;

-- =============================================================================
-- CENÁRIO 6 — a porta de saída não deixa emitir evento alheio
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: o cinto do emit_event ==='

do $$
declare v_erro text;
begin
  begin
    perform marketing.emit_event(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon.approval.decided', '{}'::jsonb);
    raise exception '  ❌ FALHOU: o marketing emitiu um evento em nome do recon';
  exception
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado: %', left(v_erro, 80);
  end;
end
$$;

-- =============================================================================
-- CENÁRIO 7 — publicar põe o evento na caixa de saída, na mesma transação
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: o módulo novo fala pela porta do Core ==='

-- ⚠️ Este bloco AUTENTICA como o admin do Alfa, e não é detalhe: o trigger
-- `campaigns_guard_publish` confere PERMISSÃO, não papel de banco. Escrito sem
-- autenticar, este cenário falha mesmo rodando como superusuário — foi o que
-- aconteceu na primeira versão deste teste.
--
-- É a prova mais forte que a separação podia ter: nem o dono do banco publica
-- uma campanha sem `marketing.campaign.publish`.
create table pg_temp.outbox_antes as select count(*) as n from core.event_outbox;

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- admin do Alfa

  update marketing.campaigns
     set status = 'published', published_at = now()
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise notice '  ✅ o admin, que TEM a permissão, publicou';
end
$$;

-- A caixa de saída é lida fora da sessão autenticada de propósito:
-- `core.event_outbox` não tem policy nem GRANT para `authenticated` (negação
-- por ausência). Se este SELECT funcionasse como usuário, seria bug.
do $$
declare v_antes int; v_depois int; v_tipo text; v_autor text;
begin
  select n into v_antes from pg_temp.outbox_antes;
  select count(*) into v_depois from core.event_outbox;
  perform pg_temp.assert3(v_depois = v_antes + 1, 'publicar pôs exatamente um evento na caixa');

  select event_type, produced_by into v_tipo, v_autor
    from core.event_outbox order by occurred_at desc limit 1;
  raise notice 'último evento: % (por %)', v_tipo, v_autor;
  perform pg_temp.assert3(v_tipo = 'marketing.campaign.published' and v_autor = 'marketing',
    'o evento é do tipo declarado no manifesto, atribuído ao módulo certo');
end
$$;

\echo ''
\echo '======================================================================'
\echo ' ✅ O SEGUNDO MÓDULO PASSOU'
\echo '    O efeito acontece uma vez · a decisão não atravessa tenant ·'
\echo '    o cliente não forja aprovação · quem cria não publica ·'
\echo '    a porta de saída não emite em nome alheio.'
\echo '======================================================================'
