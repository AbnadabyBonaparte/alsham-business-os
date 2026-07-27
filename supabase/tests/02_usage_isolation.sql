-- =============================================================================
-- ISOLAMENTO DA CONTABILIDADE DE USO — a fatura de um não vaza para o outro
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql`, que já criou os tenants Alfa e Beta e
-- os três usuários. Aqui se prova o que o `0003_billing.sql` acrescentou.
--
-- Por que este teste é próprio: consumo é o dado que vira **dinheiro**. Um
-- vazamento aqui não é constrangimento — é o concorrente lendo o volume de
-- operação do vizinho, e a fatura de um contestada com o dado do outro.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert2(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: consumo nos DOIS tenants ==='

insert into core.usage_ledger (tenant_id, metric, quantity, period, source_module_id, source_ref)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', 1, '2026-07', 'recon', 'evt-alfa-1'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', 1, '2026-07', 'recon', 'evt-alfa-2'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'seats',            3, '2026-07', null,    null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'events-per-month', 1, '2026-07', 'recon', 'evt-beta-1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'events-per-month', 1, '2026-07', 'recon', 'evt-beta-2'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'events-per-month', 1, '2026-07', 'recon', 'evt-beta-3')
on conflict do nothing;

\echo 'montagem concluída: Alfa=2 eventos, Beta=3 eventos.'

-- =============================================================================
-- CENÁRIO 1 — o tenant lê o próprio consumo, e SÓ o próprio
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: isolamento do livro-caixa ==='

do $$
declare v_linhas int; v_soma bigint; v_alheio bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select count(*) into v_linhas from core.usage_ledger;
  raise notice 'user-a (Alfa) enxerga % lançamentos', v_linhas;
  perform pg_temp.assert2(v_linhas = 3, 'vê os 3 lançamentos do Alfa, nenhum dos 3 do Beta');

  select core.usage_in_period(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-07') into v_soma;
  perform pg_temp.assert2(v_soma = 2, 'a apuração do próprio consumo dá 2');

  -- A prova que importa: pedir o consumo ALHEIO, com o id na mão.
  select core.usage_in_period(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'events-per-month', '2026-07') into v_alheio;
  raise notice 'user-a pedindo a apuração do Beta: %', v_alheio;
  perform pg_temp.assert2(v_alheio = 0,
    'a apuração do tenant alheio devolve 0 — SECURITY INVOKER roda sob a RLS de quem chama');
end
$$;

do $$
declare v_soma bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select core.usage_in_period(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'events-per-month', '2026-07') into v_soma;
  raise notice 'user-b (Beta) apura o próprio consumo: %', v_soma;
  perform pg_temp.assert2(v_soma = 3, 'e o Beta vê 3, não 2 nem 5 — cada um com o seu');
end
$$;

-- =============================================================================
-- CENÁRIO 2 — o cliente NÃO escreve no próprio livro-caixa
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: quem lança consumo é a plataforma ==='

do $$
declare v_erro text; v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    -- Se isto passasse, o cliente escolheria a própria fatura.
    insert into core.usage_ledger (tenant_id, metric, quantity, period)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', -999, '2026-07');
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'authenticated tentando lançar consumo: %', coalesce(left(v_erro,60), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert2(v_ok, 'authenticated NÃO insere no ledger');

  v_ok := false; v_erro := null;
  begin
    update core.usage_ledger set quantity = 0;
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'authenticated tentando editar consumo: %', coalesce(left(v_erro,60), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert2(v_ok, 'authenticated NÃO edita o ledger — correção é estorno, não edição');
end
$$;

-- =============================================================================
-- CENÁRIO 3 — o mesmo fato não conta duas vezes
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: idempotência da contagem ==='

do $$
declare v_erro text; v_ok boolean := false; v_antes bigint; v_depois bigint;
begin
  reset role;
  select core.usage_in_period(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-07') into v_antes;

  begin
    -- O correio reentregando o MESMO evento. Sem o unique, isto viraria
    -- cobrança a mais — o pior tipo de bug: o cliente descobre antes de nós.
    insert into core.usage_ledger (tenant_id, metric, quantity, period, source_module_id, source_ref)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', 1, '2026-07', 'recon', 'evt-alfa-1');
  exception when unique_violation then
    v_erro := sqlerrm; v_ok := true;
  end;

  select core.usage_in_period(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-07') into v_depois;

  raise notice 'reentrega do mesmo evento: bloqueada=% | consumo antes=% depois=%', v_ok, v_antes, v_depois;
  perform pg_temp.assert2(v_ok, 'o mesmo source_ref é recusado pelo unique');
  perform pg_temp.assert2(v_antes = v_depois, 'e a apuração NÃO subiu — reentrega não vira cobrança');
end
$$;

do $$
declare v_ok boolean := true;
begin
  reset role;
  -- Lançamento manual (sem `source_ref`) pode repetir: nulos não colidem, e
  -- ajuste de operação é legítimo. O unique é parcial por isso.
  insert into core.usage_ledger (tenant_id, metric, quantity, period)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'storage-mb', 10, '2026-07'),
         ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'storage-mb', 10, '2026-07');
  perform pg_temp.assert2(v_ok, 'lançamento sem source_ref pode repetir — nulos não colidem');
end
$$;

-- =============================================================================
-- CENÁRIO 4 — estorno é lançamento, não apagamento
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: correção sem apagar ==='

do $$
declare v_soma bigint; v_linhas int;
begin
  reset role;
  insert into core.usage_ledger (tenant_id, metric, quantity, period, source_ref)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', -1, '2026-07', 'estorno-evt-alfa-1');

  select core.usage_in_period(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-07') into v_soma;
  select count(*) into v_linhas from core.usage_ledger
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and metric = 'events-per-month';

  raise notice 'após o estorno: soma=% linhas=%', v_soma, v_linhas;
  perform pg_temp.assert2(v_soma = 1, 'o estorno abateu a conta (2 - 1 = 1)');
  perform pg_temp.assert2(v_linhas = 3,
    'e as 3 linhas continuam lá — de onde veio o número é pergunta que fatura contestada faz');
end
$$;

-- =============================================================================
-- CENÁRIO 5 — período é do FATO, não da digitação
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: lançamento retroativo ==='

do $$
declare v_julho bigint; v_junho bigint;
begin
  reset role;
  insert into core.usage_ledger (tenant_id, metric, quantity, period, source_ref)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', 5, '2026-06', 'retroativo-1');

  select core.usage_in_period('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-07') into v_julho;
  select core.usage_in_period('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events-per-month', '2026-06') into v_junho;

  raise notice 'julho=% junho=%', v_julho, v_junho;
  perform pg_temp.assert2(v_julho = 1, 'julho não mudou');
  perform pg_temp.assert2(v_junho = 5, 'o lançamento retroativo caiu em junho, o mês do FATO');
end
$$;

do $$
begin
  begin
    insert into core.usage_ledger (tenant_id, metric, quantity, period)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 1, '2026-13');
    perform pg_temp.assert2(false, 'período inválido deveria ter sido recusado');
  exception when check_violation then
    perform pg_temp.assert2(true, 'período fora do formato YYYY-MM é recusado pelo banco');
  end;
end
$$;

\echo ''
\echo '============================================================'
\echo ' ISOLAMENTO DE USO PROVADO — a fatura de um não vaza no outro'
\echo '============================================================'
