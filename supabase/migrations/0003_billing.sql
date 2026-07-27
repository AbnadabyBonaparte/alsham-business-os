-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0003_billing.sql
-- A contabilidade de uso. Fase 1 do ROADMAP-TECNICO-V1 (Billing do Core).
-- =============================================================================
--
-- NÃO APLICADO EM NENHUM PROJETO SUPABASE por esta obra. Aplicar em produção é
-- ato do dono — ver docs/runbook/APLICAR.md.
--
-- MAS PROVADO: aplicado de verdade a cada push, depois do 0001 e do 0002, num
-- PostgreSQL 17 limpo e efêmero (.github/workflows/db-verify.yml), com teste
-- de isolamento de uso entre dois tenants.
--
-- -----------------------------------------------------------------------------
-- ⚠️ LEI 7 — NÃO HÁ PREÇO NESTE ARQUIVO, E É DE PROPÓSITO
-- -----------------------------------------------------------------------------
-- Aqui se conta USO, não dinheiro. Nenhuma coluna de valor, nenhuma moeda,
-- nenhuma tabela de preço. Preço é decisão do dono, com números que ele mede —
-- e enquanto não existirem, escrever qualquer um seria inventar promessa.
--
-- Separar o que o plano PERMITE (`plan_limits`, no 0001) do que o plano CUSTA
-- é o que deixa mudar preço sem tocar em limite, e vender o mesmo limite por
-- preços diferentes por região ou contrato.
--
-- -----------------------------------------------------------------------------
-- ORIGEM MINERADA (Lei do Reaproveitamento)
-- -----------------------------------------------------------------------------
--   usage_ledger  <- kraken-v2 (Balanço de Tecnologia §1 e Balanço Supabase §1:
--                    **PROVADO** em produção, com 95+ lançamentos reais e
--                    economia unitária calculada). É a peça mais próxima de
--                    cobrança por uso que o império possui.
--   plan_limits   <- já existe no 0001_core.sql, do mesmo kraken-v2.
--
-- -----------------------------------------------------------------------------
-- AS REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (mesmo rigor do 0001/0002)
-- -----------------------------------------------------------------------------
--   1. `tenant_id` NOT NULL. Uso é sempre de alguém.
--   2. RLS habilitada E forçada, com policy real. Nunca `USING (true)`.
--   3. Nenhum dado semeado.
--   4. O tenant LÊ o próprio uso; ESCREVER é ato de plataforma (`service_role`).
--      Deixar o cliente lançar o próprio consumo seria deixá-lo escolher a
--      própria fatura.
-- =============================================================================

-- =============================================================================
-- 1. USAGE_LEDGER — o livro-caixa do consumo
-- -----------------------------------------------------------------------------
-- É um LIVRO, não um contador: cada consumo é um lançamento, e o total é a
-- soma. Um campo `total` que se incrementa perderia a resposta para "de onde
-- veio esse número?" — e é exatamente essa pergunta que uma fatura contestada
-- faz.
--
-- ANTI-VIÉS aplicado:
--   ✅ `metric` é TEXTO livre. Métrica nova não exige migration, e nenhuma
--      métrica de um cliente específico está no schema.
--   ❌ NÃO ENTRA preço, moeda, desconto, nem regra de faturamento. São de
--      quem cobra, não de quem mede.
--   ❌ NÃO ENTRA franquia por cliente. Isso é `plan_limits` (catálogo) ou
--      `tenant_modules.settings` (exceção contratada).
-- =============================================================================

create table core.usage_ledger (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  -- A grandeza medida: 'seats', 'modules', 'storage-mb', 'events-per-month'…
  metric           text        not null check (length(btrim(metric)) > 0),
  -- Quantidade consumida. Inteiro: meio evento não existe.
  -- Pode ser NEGATIVO — estorno é lançamento, não apagamento.
  quantity         bigint      not null,
  -- Período de apuração, 'YYYY-MM'. Gravado, não derivado de `recorded_at`:
  -- um lançamento retroativo pertence ao mês do FATO, não ao da digitação.
  period           text        not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Quem gerou. NULL = a própria plataforma.
  source_module_id text,
  -- A referência ao fato: `event_id`, id de upload, id de convite.
  -- ⭐ É A CHAVE DE IDEMPOTÊNCIA: ver o unique parcial abaixo.
  source_ref       text,
  recorded_at      timestamptz not null default now()
);

-- ⭐ O MESMO FATO NÃO CONTA DUAS VEZES.
--
-- Reentrega do mesmo evento pelo correio bate aqui e é recusada — do mesmo
-- jeito que `processed_events` protege o efeito, este índice protege a conta.
-- Sem ele, um retry de rede viraria cobrança a mais, que é o pior tipo de bug:
-- o cliente descobre antes de nós.
--
-- Parcial porque `source_ref` nulo é legítimo (lançamento manual, ajuste) e
-- nulos não devem colidir entre si.
create unique index usage_ledger_fato_unico
  on core.usage_ledger (tenant_id, metric, source_ref)
  where source_ref is not null;

-- O índice do trabalho: "quanto este tenant usou desta métrica neste mês?"
create index usage_ledger_apuracao_idx
  on core.usage_ledger (tenant_id, metric, period);

create index usage_ledger_periodo_idx
  on core.usage_ledger (tenant_id, period, recorded_at desc);

alter table core.usage_ledger enable row level security;
alter table core.usage_ledger force row level security;

-- O tenant vê o próprio consumo — e é bom que veja: fatura que não se confere
-- é fatura que se contesta. Não é `USING (true)`: membro de outro tenant não
-- enxerga linha nenhuma.
create policy usage_ledger_select_member on core.usage_ledger
  for select to authenticated
  using (core.is_tenant_member(tenant_id));

-- Sem policy de INSERT/UPDATE/DELETE, de propósito.
--
-- Lançar consumo é ato de plataforma, por `service_role`. Deixar o cliente
-- escrever no próprio livro-caixa seria deixá-lo escolher a própria fatura.
-- E ledger não se edita: correção é lançamento de estorno, com `quantity`
-- negativa — é por isso que a coluna aceita negativo.

-- =============================================================================
-- 2. A LEITURA DO CONSUMO
-- -----------------------------------------------------------------------------
-- Uma função em vez de uma view: a view somaria tudo o que a RLS deixasse
-- passar, e a assinatura aqui deixa explícito que a resposta é sempre por
-- tenant, métrica e período.
--
-- STABLE e SECURITY INVOKER: roda com os privilégios de quem chama, ou seja,
-- **sob a RLS de quem chama**. Um membro do tenant A que peça o consumo do
-- tenant B recebe zero — não porque a função verifique, mas porque a RLS não
-- devolve as linhas. Segurança por construção, não por lembrança.
-- =============================================================================

create or replace function core.usage_in_period(
  p_tenant_id uuid,
  p_metric    text,
  p_period    text
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(u.quantity), 0)::bigint
    from core.usage_ledger u
   where u.tenant_id = p_tenant_id
     and u.metric    = p_metric
     and u.period    = p_period;
$$;

comment on function core.usage_in_period(uuid, text, text) is
  'Quanto este tenant consumiu desta métrica neste período. SECURITY INVOKER: roda sob a RLS de quem chama — pedir o consumo alheio devolve zero.';

comment on table core.usage_ledger is
  'Livro-caixa de consumo por tenant. Conta USO, nunca dinheiro (Lei 7). Escrita é service_role; correção é estorno, não edição.';

-- =============================================================================
-- 3. FECHAMENTO DE PRIVILÉGIOS
-- =============================================================================

revoke all on core.usage_ledger from public, anon, authenticated;

grant select on core.usage_ledger to authenticated;
grant execute on function core.usage_in_period(uuid, text, text) to authenticated;

-- `anon` não recebe nada. Escrita não é concedida a ninguém além do
-- `service_role`, que passa por cima por ser dono.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum preço. Nenhum segredo.
-- =============================================================================
