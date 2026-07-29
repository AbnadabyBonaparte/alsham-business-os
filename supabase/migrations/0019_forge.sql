-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0019_forge.sql
-- IA Base — a forja do Core. Objetos no schema `core`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0009` e o seed estão aplicados em produção (informado
-- pelo dono); `0010` e `0011` são arquivo. Aplicar é ato do dono — runbook §12.
--
-- -----------------------------------------------------------------------------
-- AS QUATRO DECISÕES DE CANON, ANTES DA PRIMEIRA TABELA
-- -----------------------------------------------------------------------------
-- **1. ⭐ A FORJA É DO CORE, e por isso escreve em `core` — não num schema
-- próprio.**
--
-- A Lei do Lego (CLAUDE.md §5.5.1) diz que *nenhum módulo cria objeto no schema
-- `core`*. A forja **não é módulo**: *IA Base* é uma das 12 capacidades do
-- **Core** na Taxonomia §3, ao lado de Billing, Workflow Engine e Auditoria —
-- e as três já vivem aqui (`core.usage_ledger`, `core.event_outbox`,
-- `core.audit_log`).
--
-- A consequência prática é a que importa: **a forja não aparece na Store.** Se
-- ela fosse módulo, o Módulo 7 precisaria conhecê-la para pedir geração, e a
-- Lei do Lego proíbe exatamente isso. Sendo Core, qualquer módulo pede, e
-- nenhum depende.
--
-- **2. Os fatos são `core.generation.*`, e não `ops.generation.*`.**
--
-- A Etapa 14 foi encomendada com os fatos chamados `os.generation.requested`.
-- Eles não podem ser do módulo da esteira, e a razão é a generalização: no dia
-- em que o Módulo 4 pedir um resumo de histórico à forja, com fatos `ops.*` ele
-- teria de duplicar os três eventos, ou emitir fato de um módulo que não é
-- dele. Fato do Core sai por `core.emit_event()`, que já existe desde a Etapa 9
-- e já tem o cinto do prefixo.
--
-- **3. ⛔ O PROMPT NUNCA VAI PARA A CAIXA DE SAÍDA.**
--
-- O CORE-SPEC §4 é literal: *"a trilha nunca guarda segredo"*. O prompt carrega
-- o Cérebro da Marca do tenant e pode carregar o briefing de um trabalho
-- confidencial — e o envelope é entregue a **qualquer** consumidor inscrito.
--
-- O que vai: quanto foi consumido, em que métrica, a modalidade, o TAMANHO do
-- prompt e o resultado. Suficiente para faturar, auditar e investigar custo;
-- insuficiente para vazar. O prompt fica em `core.ai_generations`, com RLS —
-- e nem lá ele é obrigatório.
--
-- **4. ⚖️ A LEI DO MOTOR — o fornecedor é receita interna.**
--
-- Lei do império (`CLAUDE.md` da ALSHAM Global e do kraken): o nome do
-- fornecedor de IA **nunca** aparece em texto visível ao cliente. Aqui isso tem
-- efeito de schema: `adapter_id` existe em `core.ai_generations` e em
-- `core.usage_ledger.source_module_id` — que são internos —, e **não existe** no
-- payload do evento, que a aplicação pode exibir.
--
-- É a mesma arquitetura do `lib/providerLabels.ts` do kraken-v2, que devolve o
-- rótulo funcional da etapa ("Texto", "Arte") e deixa o fornecedor fora do
-- texto visível.
--
-- **5. ⚠️ A GERAÇÃO É SÍNCRONA NESTA ETAPA, e a decisão é declarada.**
--
-- A sonda do kraken-v2 registrou que lá a geração é **JOB** — `jobs` com
-- estados e avanço por `cron`, com lock idempotente. É o desenho certo para o
-- pipeline dele: um vídeo vira dez peças, e ninguém fica olhando a tela.
--
-- Aqui é diferente, e por uma razão de produto: **o operador pede a geração
-- PARADO numa etapa da esteira, e o resultado volta para a MESMA tela**, onde
-- ele decide — aprova, refaz ou descarta. Assíncrono exigiria uma segunda tela
-- ("seu rascunho ficou pronto") que não existe, e um caminho de notificação
-- que também não existe.
--
-- ⛔ **E se um dia for assíncrona, a fila é a do Core — nunca uma segunda.**
-- `core.event_outbox` já tem arrendamento, backoff e `dead` sem apagar.
-- ⚠️ O que FALTA para isso, e por isso está NÃO CONSTRUÍDO: a política de
-- reentrega do correio é boa para entregar FATO e perigosa para refazer
-- CHAMADA PAGA — um evento que falha três vezes custa três gerações. Quando
-- entrar, entra com política própria de tentativa, e essa política é decisão
-- do dono.
-- =============================================================================

-- =============================================================================
-- 1. ⭐ O CÉREBRO DA MARCA — contexto do tenant, uma linha por tenant
-- -----------------------------------------------------------------------------
-- **Minerado do kraken-v2** (`personas`, migration 0003 daquele repositório —
-- PROVADO, com assinante pagante): `voice_profile`, `forbidden_terms`,
-- `value_vetoes`. Minerou-se a IDEIA, com uma divergência escrita:
--
--   ⚠️ **Lá são PERSONAS (várias por workspace); aqui é UMA por tenant.**
--
--   Persona por linha faz sentido quando o produto É conteúdo e o cliente
--   administra várias marcas — que é o caso do kraken. Numa plataforma de
--   gestão, o tenant **é** a marca, e uma tabela de personas obrigaria toda
--   tela a perguntar "qual persona?" antes de qualquer coisa. Quando um tenant
--   precisar de duas vozes, isso nasce como capacidade própria, com a razão
--   escrita — e não como uma coluna a mais aqui.
--
-- ANTI-VIÉS:
--   ✅ ENTRA `identity` e `tone` como TEXTO LIVRE. Tom de voz é da empresa.
--   ✅ ENTRA `forbidden text[]` — o que a marca NUNCA diz. É a peça do kraken
--      que mais vale, e a que quase todo mundo esquece de construir.
--   ❌ NÃO ENTRA `industry`, `persona_type`, `target_audience` com enum. Cada
--      um é o segmento de um cliente virando o vocabulário de todos.
--   ❌ NÃO ENTRA `model`, `temperature`, `max_tokens`. Isso é do MOTOR, é
--      configuração de engenharia e vive em `env` do servidor. Pôr no banco do
--      tenant seria expor a composição do motor — contra a Lei do Motor — e
--      dar ao cliente a chave de uma peça que ele nunca detém (Lei 5).
-- =============================================================================

create table core.ai_brand_context (
  tenant_id  uuid        primary key references core.tenants (id) on delete cascade,
  -- Quem somos. Texto livre.
  identity   text        not null default '',
  -- Como falamos. Texto livre.
  tone       text        not null default '',
  -- ⛔ O que NUNCA se diz. Ver o ANTI-VIÉS acima.
  forbidden  text[]      not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null
);

comment on table core.ai_brand_context is
  'O Cérebro da Marca do tenant — quem somos, como falamos e o que nunca dizemos. Dado do TENANT, nunca constante do produto. Entra em toda geração.';

create trigger ai_brand_context_touch
  before update on core.ai_brand_context
  for each row execute function core.touch_updated_at();

alter table core.ai_brand_context enable row level security;
alter table core.ai_brand_context force row level security;

-- ⭐ Ler o contexto da marca exige ser MEMBRO; escrever exige administrar o
-- tenant. A distinção é real: quem gera peça precisa que o tom entre no
-- pedido, mas quem DEFINE o tom da empresa é quem responde por ela.
create policy ai_brand_select on core.ai_brand_context
  for select to authenticated
  using (core.is_tenant_member(tenant_id));

create policy ai_brand_insert on core.ai_brand_context
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'core.tenant.manage'));

create policy ai_brand_update on core.ai_brand_context
  for update to authenticated
  using (core.has_permission(tenant_id, 'core.tenant.manage'))
  with check (core.has_permission(tenant_id, 'core.tenant.manage'));

-- ⛔ Sem policy de DELETE. Esvaziar o contexto é `update` para vazio — e assim
-- a trilha de `updated_by` sobrevive à limpeza.

-- =============================================================================
-- 2. `core.ai_generations` — o registro de cada pedido à forja
-- -----------------------------------------------------------------------------
-- Uma linha por pedido, com o que aconteceu. É o que permite responder "por que
-- este rascunho ficou assim?" e "quanto isto custou este mês?".
--
-- ⚠️ **O `prompt` é OPCIONAL e fica AQUI, nunca no evento.** Ver a decisão 3 do
-- cabeçalho. Guardá-lo é o que torna um resultado ruim investigável — foi
-- exatamente a pendência que o dossiê do kraken deixou aberta (§6: *"ler os
-- prompts que o Kraken envia... e avaliá-los"*), e que ele não conseguia
-- responder sem ir ao `payload` dos jobs.
--
-- ⚠️ E ele é **redigível**: a coluna aceita nulo, e o ambiente que não quiser
-- guardar prompt simplesmente não grava. Um campo obrigatório aqui seria uma
-- decisão de retenção de dado tomada por nós, no lugar do dono.
-- =============================================================================

create table core.ai_generations (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- 'text' ou 'image'. As duas que estão construídas.
  kind           text        not null check (kind in ('text', 'image')),
  status         text        not null default 'requested'
                 check (status in ('requested', 'completed', 'failed')),
  -- ⚖️ INTERNO. O adaptador que executou. Ver a decisão 4 do cabeçalho: ele
  -- existe para o custo por motor (o bake-off do kraken) e para o log — nunca
  -- para o texto visível ao cliente.
  adapter_id     text,
  -- ⚠️ Opcional de propósito. Ver o cabeçalho desta seção.
  prompt         text,
  prompt_length  integer     not null default 0 check (prompt_length >= 0),
  -- Quanto foi consumido, na unidade da métrica de plano.
  consumed       integer     not null default 0 check (consumed >= 0),
  -- Termos da marca que ESCAPARAM — a rede de segurança acusa, não redige.
  violations     text[]      not null default '{}',
  -- ⭐ **MINERADO do `usage_ledger.is_mock` do kraken-v2** (migration 0012
  -- daquele repositório), e a razão está escrita lá: *"custo de laboratório
  -- contamina o relatório de margem, que é a razão de existir do ledger"*.
  --
  -- ⚠️ **É COLUNA, e não inferência pelo nome do adaptador.** Deduzir "é mock
  -- porque o `adapter_id` começa com demo-" funcionaria hoje e quebraria no dia
  -- em que um adaptador real se chamasse assim. A marca tem de ser um fato
  -- gravado, não um palpite sobre uma string.
  --
  -- ⛔ E a consequência é dupla: a geração de laboratório **existe no
  -- registro** (para o operador ver o que aconteceu) e **não existe no
  -- livro-caixa** (`core.usage_ledger` não recebe lançamento). Marcada, e fora
  -- da conta.
  is_mock        boolean     not null default false,
  failure_reason text,
  -- De onde veio o pedido. TEXTO LIVRE e opcional: hoje é a esteira, amanhã
  -- pode ser qualquer módulo, e um enum aqui obrigaria migration a cada um.
  source_module  text,
  source_ref     text,
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  finished_at    timestamptz,
  constraint ai_generations_coherent check (
    (status = 'requested' and finished_at is null) or
    (status = 'completed' and finished_at is not null) or
    (status = 'failed')
  )
);

comment on table core.ai_generations is
  'Cada pedido à forja do Core, com o que foi consumido e o que a rede de segurança acusou. O prompt fica aqui, nunca na caixa de saída.';

create index ai_generations_tenant_idx
  on core.ai_generations (tenant_id, created_at desc);

alter table core.ai_generations enable row level security;
alter table core.ai_generations force row level security;

-- ⭐ Ler o próprio histórico de geração é direito de membro: é o que permite
-- ao operador entender por que um rascunho saiu como saiu.
create policy ai_generations_select on core.ai_generations
  for select to authenticated
  using (core.is_tenant_member(tenant_id));

-- ⛔ **NENHUMA policy de INSERT, UPDATE ou DELETE para `authenticated`.**
--
-- E é a decisão de segurança desta migration: quem escreve aqui é a
-- COMPOSIÇÃO (`apps/api`), que roda com `service_role` e tem a chave do motor.
-- Se a tela pudesse inserir, ela poderia registrar uma geração que nunca
-- aconteceu — e o livro-caixa de consumo passaria a aceitar lançamento
-- inventado pelo cliente.

-- =============================================================================
-- 3. A PERMISSÃO DE GERAR
-- -----------------------------------------------------------------------------
-- ⭐ **É permissão do CORE, não de módulo**, pelo mesmo motivo da decisão 1: a
-- forja serve a todos. `core.ai.generate` é concedida ao papel do tenant como
-- qualquer permissão de Core, e não entra nem sai com a instalação de módulo
-- nenhum.
-- =============================================================================

create or replace function core.can_generate(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'core.ai.generate');
$$;

comment on function core.can_generate(uuid) is
  'O usuário pode pedir geração à forja NESTE tenant? Cortesia de interface — quem barra de verdade é o endpoint da composição, que confere de novo.';

-- =============================================================================
-- 4. OS FATOS DA FORJA
-- -----------------------------------------------------------------------------
-- Saem por `core.emit_event()`, que já existe (0006) e já confere o prefixo
-- `core.%`. A forja não ganha porta própria — o Core já tem a dele.
--
-- ⛔ **O payload é montado pela composição, e não por trigger**, e a razão é a
-- decisão 3: o que NÃO pode ir no envelope (o prompt, o adaptador) é
-- justamente o que está nesta tabela. Um trigger genérico que serializasse a
-- linha vazaria os dois — e vazaria em silêncio, que é como esse tipo de erro
-- sempre acontece.
--
-- A função abaixo existe para que a composição não monte o envelope à mão em
-- dois lugares. Ela recebe só o que PODE sair.
-- =============================================================================

create or replace function core.emit_generation_event(
  p_tenant_id     uuid,
  p_generation_id uuid,
  p_status        text,
  p_kind          text,
  p_metric        text,
  p_prompt_length integer,
  p_consumed      integer default null,
  p_violations    text[]  default null,
  p_failure       text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if p_status not in ('requested', 'completed', 'failed') then
    raise exception 'estado de geração desconhecido: %', p_status using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'generationId', p_generation_id,
    'kind',         p_kind,
    'metric',       p_metric,
    'promptLength', p_prompt_length
  );

  if p_status = 'completed' then
    v_payload := v_payload || jsonb_build_object(
      'consumed',   coalesce(p_consumed, 0),
      'violations', to_jsonb(coalesce(p_violations, '{}'::text[]))
    );
  elsif p_status = 'failed' then
    v_payload := v_payload || jsonb_build_object(
      'failureReason', left(coalesce(p_failure, 'desconhecida'), 200)
    );
  end if;

  return core.emit_event(
    p_tenant_id,
    'core.generation.' || p_status,
    v_payload
  );
end;
$$;

comment on function core.emit_generation_event(uuid, uuid, text, text, text, integer, integer, text[], text) is
  'O envelope do fato de geração — e o que ele NÃO carrega. Sem prompt (é segredo do tenant) e sem adaptador (é receita interna). CORE-SPEC §4.';

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- =============================================================================

grant select, insert, update on core.ai_brand_context to authenticated;
-- ⛔ Sem DELETE: esvaziar é `update`, e a trilha de quem esvaziou sobrevive.

-- ⛔ SÓ SELECT. Ver §2: quem escreve é a composição, com service_role.
grant select on core.ai_generations to authenticated;

grant execute on function core.can_generate(uuid) to authenticated;

-- ⛔ `core.emit_generation_event` NÃO é concedida a `authenticated`: ninguém
-- registra geração à mão. Quem a chama é a composição.
revoke all on function core.emit_generation_event(uuid, uuid, text, text, text, integer, integer, text[], text)
  from public, anon, authenticated;

-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhuma chave. Nenhum nome de
-- fornecedor. Nenhum objeto em schema de módulo — a coluna que a esteira
-- precisa vive na migration DELA (`0020_ops_machine_draft.sql`), pelo mesmo
-- motivo que a projeção do recon viveu no `0008` e não no `0007`.
-- =============================================================================
