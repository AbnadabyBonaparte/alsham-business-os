-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0018_ops.sql
-- Módulo 7: Esteira de Produção. Schema `ops`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0010` e o seed estão aplicados em produção (informado
-- pelo dono). Aplicar é ato do dono — ver docs/runbook/APLICAR.md §11.
--
-- -----------------------------------------------------------------------------
-- AS TRÊS DECISÕES DE CANON, ANTES DA PRIMEIRA TABELA
-- -----------------------------------------------------------------------------
-- **1. O `module_id` é `ops`, e NÃO `os`.**
--
-- A Etapa 13 foi encomendada com os fatos chamados `os.opened`,
-- `os.stage.advanced`, `os.sent-back`. O `os` vem de "ordem de serviço", lê
-- bonito em português — e não pode ser o identificador deste módulo, por dois
-- motivos que não são de gosto:
--
--   a) **`os` já significa outra coisa na Taxonomia.** A hierarquia canônica
--      (§1) é `CORE → ENGINES → DOMAINS → CAPACIDADES → OS (VERTICAIS) →
--      TENANT`. "OS" é uma CAMADA inteira do mapa — os 29 pacotes por setor da
--      §6. Um módulo chamado `os` faria a palavra querer dizer duas coisas no
--      mesmo repositório, e Sol Único é exatamente a lei contra isso.
--
--   b) ⛔ **`os` é o artigo definido plural do idioma em que este repositório
--      é escrito.** A prosa de `docs/canon/` e destas migrations usa a palavra
--      solta "os" **129 vezes** — contadas em 28/07/2026, não estimadas; a
--      palavra "ops" aparece zero.
--      Um módulo chamado `os` seria impossível de procurar por nome na
--      documentação da própria casa.
--
--      ⚠️ **Registro de honestidade:** a primeira versão deste cabeçalho dizia
--      que `os.` seria impossível de conferir por grep, porque casaria dentro
--      de `dados.`, `tenants.` e afins. **Isso estava errado**, e o próprio
--      teste do módulo derrubou a afirmação: a matriz de guarda deste
--      repositório usa `\bOUTRO\.`, com fronteira de palavra, e `\bos\.` não
--      casa dentro de `dados.` nem de `tenants.`. O argumento caiu; a decisão
--      ficou, sustentada pelos dois motivos que se verificam. Fica escrito
--      porque a Lei 7 vale para o argumento tanto quanto para o número.
--
-- Com `ops`, o CORE-SPEC (§3, passos 1 e 5) continua valendo ao pé da letra —
-- `<moduleId>.<agregado>.<fato>` — e os sete fatos encomendados existem todos,
-- com o prefixo corrigido e o agregado no lugar: `ops.order.opened`,
-- `ops.stage.advanced`, `ops.stage.skipped`, `ops.order.sent-back`,
-- `ops.order.completed`, `ops.order.cancelled`, `ops.deliverable.registered`.
--
-- **2. O `domain_key` é `operations`, e NÃO `marketing`.**
--
-- A etapa se chama "Marketing Ops" e nasceu da esteira de uma agência. É
-- justamente por isso que ela **não** pode nascer no Domain Marketing.
--
-- O teste anti-viés (CLAUDE.md §4): *"outra empresa do mesmo setor usaria isso
-- exatamente como está?"* — e mais que isso, outra empresa de **outro** setor?
-- Uma construtora abre ordem de serviço. Um escritório de advocacia move um
-- processo por fases. Uma oficina recebe, orça, executa e entrega. Nenhum
-- deles faz marketing, e todos os três são este módulo, sem uma linha
-- diferente.
--
-- A Taxonomia §5 põe **"Ordens de serviço"** como a primeira capacidade de
-- **🏭 Operações (10)**. É de lá que este módulo vem. As capacidades
-- *Briefings* e *Produção*, do Domain Marketing, são o que a esteira de uma
-- agência ATENDE quando o tenant desenha as etapas dela — configuração, nunca
-- schema. Registrar o módulo como "de marketing" seria o processo de um
-- cliente virando a identidade do produto.
--
-- ⚠️ Há também um motivo mecânico: o Módulo 2 já é `marketing`. Dois módulos
-- disputando o mesmo prefixo de permissão e de evento fariam
-- `marketing.emit_event()` aceitar o fato do vizinho, e a revogação em bloco
-- do §3 do CORE-SPEC (`prefixo <moduleId>.` para revogar tudo de uma vez)
-- passaria a derrubar permissão de dois módulos ao desinstalar um.
--
-- **3. ⭐ AS ETAPAS SÃO DADO DO TENANT. Jamais enum do produto.**
--
-- É a lei desta etapa e a razão de ela existir. `abertura → briefing →
-- criação → revisão → aprovação → veiculação` é a esteira de UMA agência.
-- Quem não tem briefing pula; quem tem duas revisões desenha duas; quem
-- fabrica peça física chama de "corte → solda → pintura".
--
-- Portanto: **não existe `create type ops.stage as enum`** neste arquivo, e
-- não pode existir em nenhum futuro. A etapa é linha em `ops.pipeline_stages`,
-- com nome escolhido pelo tenant.
--
-- Corolário que custa caro se esquecido: a esteira é dado VIVO — renomeia-se,
-- reordena-se, apaga-se. A trilha da OS, que é história, **carimba o nome da
-- etapa no momento do ato** e guarda o id solto, sem chave estrangeira. É a
-- regra "a trilha sobrevive ao dado" do CORE-SPEC §4 aplicada à etapa.
-- =============================================================================

create schema if not exists ops;

comment on schema ops is
  'Módulo Esteira de Produção (ordens de serviço). Domain operations da Taxonomia. Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- Sétima vez que este bloco aparece. O padrão é lei (CLAUDE.md §5.5).
-- =============================================================================

create or replace function ops.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not like 'ops.%' then
    raise exception 'ops.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ops',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ops.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function ops.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ops.pipeline.design')
      or core.has_permission(p_tenant_id, 'ops.order.manage')
      or core.has_permission(p_tenant_id, 'ops.order.decide');
$$;

create or replace function ops.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. PIPELINES — a esteira que o tenant desenha
-- -----------------------------------------------------------------------------
-- Um tenant pode ter mais de uma: a esteira do marketing não é a esteira da
-- manutenção. Não há esteira "padrão" semeada — semear uma seria escolher o
-- processo do cliente por ele, que é o viés desta etapa em pessoa.
--
-- ANTI-VIÉS:
--   ✅ ENTRA `name` livre.
--   ❌ NÃO ENTRA `kind`/`department` com enum ('marketing','obra','juridico').
--      Departamento é organograma de cliente. Se o tenant quiser distinguir,
--      distingue pelo nome da esteira.
-- =============================================================================

create table ops.pipelines (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  -- Necessária para as chaves estrangeiras compostas de etapa e de OS.
  constraint pipelines_id_tenant unique (id, tenant_id)
);

-- Duas esteiras ativas com o mesmo nome no mesmo tenant só geram engano na
-- hora de abrir a OS. Arquivada não conflita: o nome fica livre de novo.
create unique index pipelines_unique_active_name
  on ops.pipelines (tenant_id, lower(name))
  where status = 'active';

create trigger pipelines_touch
  before update on ops.pipelines
  for each row execute function ops.touch_updated_at();

alter table ops.pipelines enable row level security;
alter table ops.pipelines force row level security;

create policy pipelines_select on ops.pipelines
  for select to authenticated
  using (ops.can_access(tenant_id));

create policy pipelines_insert on ops.pipelines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ops.pipeline.design'));

create policy pipelines_update on ops.pipelines
  for update to authenticated
  using (core.has_permission(tenant_id, 'ops.pipeline.design'))
  with check (core.has_permission(tenant_id, 'ops.pipeline.design'));

-- ⛔ Sem policy de DELETE. Esteira que já rodou OS é história; arquivar é
-- `status = 'archived'`.

-- =============================================================================
-- 2.1 ⭐ PIPELINE_STAGES — A LEI DAS ETAPAS, EM TABELA
-- -----------------------------------------------------------------------------
-- Aqui está a decisão 3 do cabeçalho, materializada. Se um dia alguém quiser
-- "padronizar" as etapas, é esta tabela que vai desaparecer — e é por isso que
-- este comentário existe.
--
-- Os dois campos que fazem a esteira ser DESENHO e não decoração:
--
--   `requires_approval` — passar desta etapa é DECISÃO, e exige a permissão
--     `ops.order.decide`. Sem ela, avançar basta `ops.order.manage`. É o que
--     dá sentido mecânico à etapa "aprovação" sem que "aprovação" vire um
--     nome mágico dentro do código: quem decide o que é decisão é o tenant.
--
--   `skippable` — a etapa pode não se aplicar a esta OS. **Pular não apaga**:
--     escreve na trilha quem pulou, quando e por quê (§4). Uma esteira sem
--     etapas puláveis obriga o operador a mentir — a marcar "briefing feito"
--     num trabalho que não tem briefing — e trilha que mente é pior que
--     trilha que falta.
--
-- ANTI-VIÉS:
--   ❌ NÃO ENTRA `sla_days`, `role_responsavel`, `checklist`, `color`. Cada um
--      é o processo de uma empresa virando obrigação de todas. Prazo é da OS
--      (`due_date`), não da etapa.
-- =============================================================================

create table ops.pipeline_stages (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  pipeline_id       uuid        not null,
  -- A ordem na esteira. Ver o comentário do índice sobre `deferrable`.
  position          integer     not null check (position >= 0),
  name              text        not null check (length(btrim(name)) > 0),
  requires_approval boolean     not null default false,
  skippable         boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint stages_id_tenant unique (id, tenant_id),
  -- A etapa pertence a uma esteira DO MESMO TENANT. Sem o `tenant_id` na
  -- chave, um bug de aplicação poderia pendurar a etapa na esteira do
  -- vizinho, e a RLS de leitura esconderia o estrago em vez de impedi-lo.
  constraint stages_pipeline_fk
    foreign key (pipeline_id, tenant_id)
    references ops.pipelines (id, tenant_id)
    on delete cascade,
  -- ⭐ `deferrable initially deferred`, e a razão é concreta: reordenar a
  -- esteira é trocar duas posições, e trocar duas posições passa por um
  -- instante em que as duas são iguais. Com a unicidade conferida linha a
  -- linha, o reordenamento só funcionaria com um número temporário fora da
  -- faixa — a gambiarra clássica que todo mundo escreve e ninguém documenta.
  -- Conferida no fim da transação, a troca é natural e a garantia continua
  -- inteira.
  constraint stages_position_unique unique (pipeline_id, position)
    deferrable initially deferred
);

create index stages_pipeline_idx
  on ops.pipeline_stages (tenant_id, pipeline_id, position);

create trigger stages_touch
  before update on ops.pipeline_stages
  for each row execute function ops.touch_updated_at();

alter table ops.pipeline_stages enable row level security;
alter table ops.pipeline_stages force row level security;

create policy stages_select on ops.pipeline_stages
  for select to authenticated
  using (ops.can_access(tenant_id));

create policy stages_insert on ops.pipeline_stages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ops.pipeline.design'));

create policy stages_update on ops.pipeline_stages
  for update to authenticated
  using (core.has_permission(tenant_id, 'ops.pipeline.design'))
  with check (core.has_permission(tenant_id, 'ops.pipeline.design'));

-- ⚠️ Esta é a ÚNICA tabela do módulo com porta de DELETE, e é deliberado:
-- desenhar uma esteira é tentativa e erro, e uma etapa criada por engano tem
-- de sair. O que a apagou NÃO leva história junto — a trilha da OS guarda o id
-- solto e o NOME CARIMBADO (§4), justamente para sobreviver a este delete.
create policy stages_delete on ops.pipeline_stages
  for delete to authenticated
  using (core.has_permission(tenant_id, 'ops.pipeline.design'));

-- =============================================================================
-- 3. ORDERS — a ordem de serviço
-- -----------------------------------------------------------------------------
-- Nasce numa esteira do tenant, na primeira etapa dela. Anda para a frente,
-- ou volta por uma devolução explícita (REFAZER).
--
-- ⭐ **O CICLO DE VIDA DIVERGE DO `ap` DE PROPÓSITO, E A DIVERGÊNCIA É
-- `done → in_progress`.**
--
-- No Módulo 3, `settled` é terminal: um título quitado que volta a ser devido
-- é documento NOVO, porque dinheiro tem identidade por documento. Aqui, uma OS
-- concluída pode voltar — e é o caso comum, não a exceção: o cliente recebeu a
-- peça e pediu mudança.
--
-- Obrigar uma segunda OS partiria em duas a história de UM trabalho, e a
-- história inteira do trabalho é a razão de este módulo existir. É a mesma
-- lição que o Módulo 4 escreveu sobre `archived → active`, chegando por outro
-- caminho: **dinheiro tem identidade por documento; trabalho tem identidade
-- por serviço.**
--
-- ⚠️ O que NÃO volta é `cancelled`. Cancelar é dizer "este trabalho não será
-- feito"; retomar é decidir fazer um trabalho — e aí é OS nova, com abertura
-- nova na trilha. Aqui o `ap` estava certo, e copiá-lo foi decisão, não
-- inércia.
--
-- ANTI-VIÉS:
--   ✅ ENTRA `description` como TEXTO LIVRE — o que é este trabalho.
--
--      ⭐ **O campo se chamou `briefing` até a guarda anti-viés do próprio
--      módulo reprovar o nome**, e a lição é boa demais para ficar de fora:
--      "briefing" é vocabulário de agência. Uma construtora tem descrição de
--      serviço; uma oficina tem o relato do cliente; um escritório tem o
--      objeto do processo. É o MESMO campo, e batizá-lo com a palavra de um
--      ofício faria a tela de todos os outros falar a língua de um só. A
--      etapa "briefing" continua existindo — como nome de etapa, escolhido
--      pelo tenant, que é exatamente onde vocabulário de ofício deve morar.
--
--      Formulário de briefing estruturado é de cada ofício; um esquema de
--      campos aqui seria a agência de um cliente virando obrigação de uma
--      construtora.
--   ✅ ENTRA `assignee_user_id` OPCIONAL, e amarrado a `core.memberships` —
--      responsável é quem é DO TENANT.
--   ✅ ENTRA `due_date` OPCIONAL. Trabalho sem prazo existe.
--   ❌ NÃO ENTRA número sequencial de OS. Formato de numeração é convenção de
--      cada casa ("OS-2026-0001", "1024/26") e uma sequência no schema
--      escolheria a convenção de um por todos.
--   ❌ NÃO ENTRA prioridade, custo, horas, cliente. Cada um é um módulo ou
--      uma capacidade própria. "Para quem é" já tem dono: o Módulo 4.
-- =============================================================================

create table ops.orders (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  pipeline_id      uuid        not null,
  -- Onde a OS está AGORA. Nulo só quando ela já saiu da esteira — concluída
  -- ou cancelada. Ver a constraint de coerência abaixo.
  current_stage_id uuid,
  title            text        not null check (length(btrim(title)) > 0),
  description      text        not null default '',
  assignee_user_id uuid,
  due_date         date,
  status           text        not null default 'open'
                   check (status in ('open', 'in_progress', 'done', 'cancelled')),
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint orders_id_tenant unique (id, tenant_id),
  constraint orders_pipeline_fk
    foreign key (pipeline_id, tenant_id)
    references ops.pipelines (id, tenant_id)
    on delete restrict,
  -- A etapa atual é de uma esteira do mesmo tenant. Sem esta chave composta,
  -- uma OS poderia apontar para a etapa do vizinho.
  --
  -- ⚠️ `restrict`, e não `set null`: a etapa onde há OS parada não se apaga. É
  -- o contrapeso exato da única porta de DELETE do módulo (§2.1) — redesenhar
  -- a esteira é livre, **menos** onde há trabalho em cima. Com `set null` a
  -- OS ficaria viva e sem etapa, o que a constraint de coerência abaixo
  -- recusaria de qualquer forma — só que como erro obscuro, em vez de como a
  -- recusa clara que o banco dá aqui.
  constraint orders_stage_fk
    foreign key (current_stage_id, tenant_id)
    references ops.pipeline_stages (id, tenant_id)
    on delete restrict,
  -- ⭐ O responsável é membro DESTE tenant. `auth.users` sozinho deixaria
  -- atribuir a OS a qualquer usuário da plataforma, inclusive de outra
  -- empresa — e a RLS não pegaria, porque a linha continua sendo do tenant
  -- certo. Isolamento se escreve na chave, não na policy.
  --
  -- ⚠️ `set null (assignee_user_id)` com a coluna EXPLÍCITA (Postgres 15+).
  -- Sem a lista, o `set null` tentaria anular as duas colunas da chave —
  -- inclusive `tenant_id`, que é `not null` — e sair do tenant faria a linha
  -- explodir em vez de perder o responsável.
  constraint orders_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  -- Coerência: OS viva está numa etapa; OS que saiu da esteira não está.
  constraint orders_stage_coherent check (
    (status in ('open', 'in_progress') and current_stage_id is not null) or
    (status in ('done', 'cancelled'))
  )
);

create index orders_board_idx
  on ops.orders (tenant_id, pipeline_id, current_stage_id)
  where status in ('open', 'in_progress');
create index orders_assignee_idx
  on ops.orders (tenant_id, assignee_user_id)
  where assignee_user_id is not null;

create trigger orders_touch
  before update on ops.orders
  for each row execute function ops.touch_updated_at();

alter table ops.orders enable row level security;
alter table ops.orders force row level security;

create policy orders_select on ops.orders
  for select to authenticated
  using (ops.can_access(tenant_id));

create policy orders_insert on ops.orders
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ops.order.manage'));

-- Editar título, descrição, responsável e prazo exige `manage`. Quem separa a
-- EDIÇÃO da DECISÃO é o trigger de §3.2 — policy de UPDATE não enxerga o
-- `old` e não distingue "corrigiu o título" de "concluiu a OS". Mesma decisão
-- do `ap`, do `crm` e do `ar`.
create policy orders_update on ops.orders
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'ops.order.manage')
    or core.has_permission(tenant_id, 'ops.order.decide')
  )
  with check (
    core.has_permission(tenant_id, 'ops.order.manage')
    or core.has_permission(tenant_id, 'ops.order.decide')
  );

-- ⛔ Sem policy de DELETE. Cancelar é status.

-- -----------------------------------------------------------------------------
-- 3.1 ⭐ AS TRANSIÇÕES PERMITIDAS — a mesma tabela que o domínio TypeScript
-- -----------------------------------------------------------------------------
-- Espelho exato de `ALLOWED_TRANSITIONS` em `@alsham/ops`, e há teste que LÊ
-- ESTE ARQUIVO e compara par a par. Mudar um lado só reprova.
-- -----------------------------------------------------------------------------

create or replace function ops.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',        'in_progress'),
    ('open',        'done'),
    ('open',        'cancelled'),
    ('in_progress', 'done'),
    ('in_progress', 'cancelled'),
    -- ⭐ A DIVERGÊNCIA. Ver o cabeçalho de §3: trabalho tem identidade por
    -- serviço, e uma entrega devolvida é o MESMO serviço.
    ('done',        'in_progress')
  );
$$;

comment on function ops.allowed_transition(text, text) is
  'O ciclo de vida da ordem de serviço. Espelho exato de ALLOWED_TRANSITIONS em @alsham/ops — há teste que lê este arquivo e compara. done → in_progress existe de propósito; cancelled é terminal.';

-- -----------------------------------------------------------------------------
-- 3.2 O PORTEIRO DO ESTADO
-- -----------------------------------------------------------------------------
-- Concluir e cancelar são DECISÕES: exigem `ops.order.decide`. Sair de `open`
-- para `in_progress` é a OS começar a andar, e quem move a OS pela esteira já
-- foi conferido em §4 — aqui só se confere o que é decisão de fim de linha.
-- -----------------------------------------------------------------------------

create or replace function ops.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not ops.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da ordem de serviço', old.status, new.status
      using errcode = '22023';
  end if;

  if new.status in ('done', 'cancelled') then
    if not core.has_permission(new.tenant_id, 'ops.order.decide') then
      raise exception 'concluir ou cancelar uma OS exige a permissão ops.order.decide'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_guard_status
  before update of status on ops.orders
  for each row execute function ops.guard_status_transition();

-- =============================================================================
-- 4. ORDER_EVENTS — ⭐ A TRILHA, E ELA É IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada movimento da OS escreve UMA linha aqui. É o padrão de três camadas que
-- o Módulo 4 provou em `crm.interactions`, e a razão é a mesma: movimento
-- registrado é fato consumado. Se saiu errado, a correção é OUTRO movimento.
--
--   1. sem policy de UPDATE nem de DELETE — a RLS nega por ausência;
--   2. sem GRANT de UPDATE nem de DELETE — a porta não existe;
--   3. um trigger que levanta erro nas duas — para quem rodar como dono do
--      banco, onde as duas primeiras não valem.
--
-- ⭐ **`from_stage_id` e `to_stage_id` são SOLTOS, sem chave estrangeira, e ao
-- lado deles vai o NOME CARIMBADO.**
--
-- Não é descuido: é a única coisa que faz a trilha sobreviver ao redesenho da
-- esteira. A etapa é dado vivo do tenant — renomeia, reordena, some. Com FK, o
-- delete da etapa arrastaria a história ou travaria o redesenho; sem o nome
-- carimbado, a trilha de 2026 seria lida com o vocabulário de 2028 e diria uma
-- coisa que nunca aconteceu. É a regra "a trilha sobrevive ao dado" do
-- CORE-SPEC §4, que ali vale para o recurso e aqui vale para a etapa.
--
-- ⭐ **`kind = 'skipped'` é a Lei das Etapas em linha de banco.** Pular não
-- apaga a etapa da OS: registra QUEM pulou, QUANDO e a razão. Uma etapa pulada
-- em silêncio é indistinguível de uma etapa cumprida, e é exatamente essa
-- distinção que o dono precisa enxergar.
-- =============================================================================

create table ops.order_events (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  order_id        uuid        not null,
  kind            text        not null check (kind in (
                    'opened',
                    'advanced',
                    'skipped',
                    'sent-back',
                    'completed',
                    'cancelled',
                    'deliverable-registered'
                  )),
  -- Soltos de propósito. Ver o cabeçalho.
  from_stage_id   uuid,
  from_stage_name text,
  to_stage_id     uuid,
  to_stage_name   text,
  -- A razão do ato: por que pulou, o que refazer, o que ficou combinado.
  note            text        not null default '',
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid        references auth.users (id) on delete set null,
  constraint order_events_order_fk
    foreign key (order_id, tenant_id)
    references ops.orders (id, tenant_id)
    on delete restrict
);

create index order_events_timeline_idx
  on ops.order_events (tenant_id, order_id, occurred_at desc);

alter table ops.order_events enable row level security;
alter table ops.order_events force row level security;

create policy order_events_select on ops.order_events
  for select to authenticated
  using (ops.can_access(tenant_id));

-- ⚠️ A trilha NÃO tem policy de INSERT para `authenticated`, e isso é
-- deliberado: ninguém escreve na trilha à mão. Quem escreve são as funções de
-- movimento de §5, que são `security definer` — elas conferem a permissão do
-- ato ANTES e registram o que de fato aconteceu. Trilha que a aplicação
-- escreve direto é trilha que a aplicação pode escrever errado.

-- Camada 3: o erro com nome, para quem roda como dono do banco.
create or replace function ops.guard_trail_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha da OS é registro de fato consumado: não se edita nem se apaga. Registre outro movimento.'
    using errcode = '42501';
end;
$$;

create trigger order_events_immutable
  before update or delete on ops.order_events
  for each row execute function ops.guard_trail_immutable();

-- =============================================================================
-- 5. DELIVERABLES — o entregável, versionado
-- -----------------------------------------------------------------------------
-- **Minerado do kraken-v2** (`content_piece_versions`, migrations 0019 e 0021
-- daquele repositório — PROVADO, com assinante pagante). O que se minerou foi
-- a IDEIA, e a peça central dela é uma coluna que quase todo mundo esquece:
--
--   ⭐ `instruction` — **o pedido que gerou ESTA versão.** No kraken ela nasceu
--      para poder contestar cobrança; aqui ela existe porque uma pilha de
--      versões sem o motivo de cada uma é um monte de arquivos, não um
--      histórico. "v3" não diz nada; "v3 — cliente pediu tirar o telefone do
--      rodapé" diz tudo.
--
-- ⛔ **NÃO HÁ UPLOAD DE ARQUIVO, e a ausência é decisão declarada.**
--
-- `reference` é texto: um link do Drive, um caminho de rede, um número de
-- processo, o nome de uma pasta. Storage é outra coisa inteira — bucket,
-- política de acesso por tenant, limite de tamanho, custo, retenção, LGPD do
-- que está dentro do arquivo. A Taxonomia lista *Storage & Arquivos* como
-- capacidade do **Core** (§3), não deste módulo, e ela está **NÃO
-- CONSTRUÍDA**. Fazer upload aqui seria construir meio Storage dentro de um
-- módulo, e o meio que fica de fora é sempre o da segurança.
--
-- ⭐ **REFAZER CRIA VERSÃO NOVA. Nunca edita.** É a mesma imutabilidade em
-- três camadas da trilha, pelo mesmo motivo: a versão anterior é o que foi
-- entregado e recusado, e apagá-la apaga a razão de existir da terceira.
-- =============================================================================

create table ops.deliverables (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  order_id     uuid        not null,
  -- Em que etapa foi registrado. Solto e carimbado, como na trilha.
  stage_id     uuid,
  stage_name   text,
  -- ⭐ TEXTO LIVRE. "arte", "legenda", "laudo", "planta baixa", "orçamento".
  -- Um enum aqui congelaria o ofício de um cliente no schema de todos.
  kind         text        not null check (length(btrim(kind)) > 0),
  -- Onde o entregável está. Ver o cabeçalho sobre a ausência de upload.
  reference    text        not null check (length(btrim(reference)) > 0),
  version      integer     not null check (version >= 1),
  -- O pedido que gerou ESTA versão. Vazio na primeira.
  instruction  text        not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  constraint deliverables_order_fk
    foreign key (order_id, tenant_id)
    references ops.orders (id, tenant_id)
    on delete restrict,
  -- Uma versão por (OS, tipo). É esta unicidade que faz duas refações
  -- simultâneas darem erro em vez de gerarem duas "v2" diferentes.
  constraint deliverables_unique_version unique (tenant_id, order_id, kind, version)
);

create index deliverables_order_idx
  on ops.deliverables (tenant_id, order_id, kind, version desc);

alter table ops.deliverables enable row level security;
alter table ops.deliverables force row level security;

create policy deliverables_select on ops.deliverables
  for select to authenticated
  using (ops.can_access(tenant_id));

-- Registrar entregável é trabalho, não decisão: basta `manage`. A INSERÇÃO
-- direta é permitida (ao contrário da trilha) porque o fato aqui é o próprio
-- dado; o que a acompanha — a linha na trilha e o evento — sai do trigger de
-- §6.4, que não depende de a aplicação lembrar.
create policy deliverables_insert on ops.deliverables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ops.order.manage'));

-- ⛔ Sem policy de UPDATE e sem policy de DELETE — camada 1 da imutabilidade.

create or replace function ops.guard_deliverable_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'entregável é versão entregue: não se edita nem se apaga. Registre a próxima versão com a instrução do que mudou.'
    using errcode = '42501';
end;
$$;

create trigger deliverables_immutable
  before update or delete on ops.deliverables
  for each row execute function ops.guard_deliverable_immutable();

-- =============================================================================
-- 6. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ **O PAYLOAD É AUTOSSUFICIENTE.** Quem escuta não pode fazer join: o schema
-- deste módulo é invisível para ele, por policy e por lei. Por isso o envelope
-- carrega o NOME da etapa e o NOME da esteira, nunca só o id — um id que o
-- ouvinte não consegue resolver é um campo que só serve para depurar.
-- =============================================================================

create or replace function ops.order_payload(p ops.orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId',      p.id,
    'title',        p.title,
    'status',       p.status,
    'pipelineId',   p.pipeline_id,
    'pipelineName', (select pl.name from ops.pipelines pl where pl.id = p.pipeline_id),
    'stageId',      p.current_stage_id,
    'stageName',    (select s.name from ops.pipeline_stages s where s.id = p.current_stage_id),
    'dueDate',      p.due_date,
    'assigneeId',   p.assignee_user_id
  );
$$;

comment on function ops.order_payload(ops.orders) is
  'O envelope de uma OS — AUTOSSUFICIENTE. Leva o NOME da esteira e da etapa, não só o id: quem escuta não tem como resolver id deste schema.';

-- -----------------------------------------------------------------------------
-- 6.1 `ops.order.opened` — e a OS nasce COM a primeira linha da trilha
-- -----------------------------------------------------------------------------

create or replace function ops.on_order_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  select name into v_stage_name
    from ops.pipeline_stages where id = new.current_stage_id;

  insert into ops.order_events (
    tenant_id, order_id, kind, to_stage_id, to_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id, 'opened', new.current_stage_id, v_stage_name, '', (select auth.uid())
  );

  perform ops.emit_event(new.tenant_id, 'ops.order.opened', ops.order_payload(new));
  return new;
end;
$$;

create trigger orders_emit_opened
  after insert on ops.orders
  for each row execute function ops.on_order_opened();

-- -----------------------------------------------------------------------------
-- 6.2 `ops.order.completed` e `ops.order.cancelled`
-- -----------------------------------------------------------------------------
-- ⚠️ A reabertura (`done → in_progress`) NÃO emite fato próprio: ela só
-- acontece por devolução, e a devolução já tem o seu (`ops.order.sent-back`).
-- Dois fatos para um ato fariam todo consumidor contar a mesma coisa duas
-- vezes — e o tenant paga por evento entregue.

create or replace function ops.on_order_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('done', 'cancelled') then
    return new;   -- reabertura: o fato dela é a devolução (§7).
  end if;

  select name into v_stage_name
    from ops.pipeline_stages where id = new.current_stage_id;

  -- ⭐ Sair da esteira TAMBÉM é movimento, e movimento é linha na trilha. Sem
  -- esta escrita, a última coisa que a trilha registraria de uma OS concluída
  -- seria o penúltimo avanço — e a pergunta "quem concluiu isto, e quando?"
  -- ficaria sem resposta justamente na linha que mais importa.
  --
  -- Aqui a trilha nasce do gatilho, não da função de movimento, porque
  -- concluir e cancelar acontecem por UPDATE comum (policy + porteiro de
  -- §3.2), como no `ap`, no `crm` e no `ar`. O gatilho é o que garante que a
  -- trilha não dependa de a aplicação lembrar.
  insert into ops.order_events (
    tenant_id, order_id, kind, from_stage_id, from_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id,
    case when new.status = 'done' then 'completed' else 'cancelled' end,
    new.current_stage_id, v_stage_name, '', (select auth.uid())
  );

  if new.status = 'done' then
    perform ops.emit_event(new.tenant_id, 'ops.order.completed', ops.order_payload(new));
  else
    perform ops.emit_event(new.tenant_id, 'ops.order.cancelled', ops.order_payload(new));
  end if;

  return new;
end;
$$;

create trigger orders_emit_finished
  after update of status on ops.orders
  for each row execute function ops.on_order_finished();

-- -----------------------------------------------------------------------------
-- 6.3 Os fatos de movimento — emitidos a partir da TRILHA, não da OS
-- -----------------------------------------------------------------------------
-- ⭐ A escolha importa: `advanced`, `skipped` e `sent-back` só existem como
-- linha de trilha. Emitir a partir do UPDATE da OS não conseguiria distinguir
-- "avançou" de "voltou" sem reconstruir a intenção a partir das posições — e
-- pular sequer muda a etapa quando a pulada é a última antes do fim. A trilha
-- já sabe o que foi feito, porque foi ela quem registrou.

create or replace function ops.on_trail_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order ops.orders;
  v_type  text;
begin
  v_type := case new.kind
              when 'advanced'               then 'ops.stage.advanced'
              when 'skipped'                then 'ops.stage.skipped'
              when 'sent-back'              then 'ops.order.sent-back'
              when 'deliverable-registered' then 'ops.deliverable.registered'
              else null
            end;

  if v_type is null then
    return new;   -- `opened`, `completed` e `cancelled` têm gatilho próprio.
  end if;

  -- Leitura no PRÓPRIO schema, para o payload ser autossuficiente.
  select * into v_order from ops.orders where id = new.order_id;

  perform ops.emit_event(
    new.tenant_id,
    v_type,
    ops.order_payload(v_order) || jsonb_build_object(
      'movementId',   new.id,
      'occurredAt',   new.occurred_at,
      'fromStageId',  new.from_stage_id,
      'fromStage',    new.from_stage_name,
      'toStageId',    new.to_stage_id,
      'toStage',      new.to_stage_name,
      'note',         new.note
    )
  );
  return new;
end;
$$;

create trigger order_events_emit
  after insert on ops.order_events
  for each row execute function ops.on_trail_movement();

-- -----------------------------------------------------------------------------
-- 6.4 O entregável escreve a própria linha na trilha
-- -----------------------------------------------------------------------------
-- E é o trigger de §6.3 que transforma essa linha no fato
-- `ops.deliverable.registered`. Um caminho só: quem registra entregável não
-- precisa lembrar de escrever a trilha, e não consegue registrar sem ela.

create or replace function ops.on_deliverable_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.order_events (
    tenant_id, order_id, kind, to_stage_id, to_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.order_id, 'deliverable-registered',
    new.stage_id, new.stage_name,
    new.kind || ' v' || new.version ||
      case when length(btrim(new.instruction)) > 0 then ' — ' || new.instruction else '' end,
    new.created_by
  );
  return new;
end;
$$;

create trigger deliverables_write_trail
  after insert on ops.deliverables
  for each row execute function ops.on_deliverable_registered();

-- =============================================================================
-- 7. OS MOVIMENTOS — as três funções que movem a OS pela esteira
-- -----------------------------------------------------------------------------
-- Por que funções, e não UPDATE direto da aplicação:
--
--   1. **atomicidade** — mover é mudar a etapa E escrever a trilha. Duas
--      escritas separadas na aplicação são duas chances de uma acontecer sem a
--      outra, e a que costuma faltar é a trilha;
--   2. **o nome carimbado** — o nome da etapa tem de ser lido no instante do
--      ato, no servidor. Vindo da tela, seria o nome que a tela tinha em
--      cache;
--   3. **a permissão que depende do DADO** — passar de uma etapa com
--      `requires_approval` exige `ops.order.decide`; das outras, `manage`
--      basta. Policy não consegue expressar isso; a função consegue.
--
-- ⚠️ São `security definer` porque escrevem na trilha, que não tem porta de
-- INSERT para `authenticated`. Logo, a PRIMEIRA coisa que cada uma faz é
-- conferir a permissão no tenant da OS — nunca no `p_tenant_id` que recebeu,
-- que aqui sequer é parâmetro. É a mesma disciplina de `core.install_module()`.
-- =============================================================================

create or replace function ops.advance_order(
  p_order_id uuid,
  p_note     text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    ops.orders;
  v_atual    ops.pipeline_stages;
  v_proxima  ops.pipeline_stages;
  v_event_id uuid;
begin
  select * into v_order from ops.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'ordem de serviço não encontrada' using errcode = 'P0002';
  end if;

  -- A RLS não vale dentro de SECURITY DEFINER: a checagem de acesso é esta.
  if not ops.can_access(v_order.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if v_order.status not in ('open', 'in_progress') then
    raise exception 'OS % não está na esteira (status %)', p_order_id, v_order.status
      using errcode = '22023';
  end if;

  select * into v_atual from ops.pipeline_stages where id = v_order.current_stage_id;

  -- ⭐ A permissão depende do DESENHO DO TENANT, não de um nome mágico.
  if v_atual.requires_approval then
    if not core.has_permission(v_order.tenant_id, 'ops.order.decide') then
      raise exception 'a etapa "%" exige aprovação: passar dela requer a permissão ops.order.decide', v_atual.name
        using errcode = '42501';
    end if;
  elsif not core.has_permission(v_order.tenant_id, 'ops.order.manage') then
    raise exception 'mover a OS exige a permissão ops.order.manage'
      using errcode = '42501';
  end if;

  select * into v_proxima
    from ops.pipeline_stages
   where pipeline_id = v_order.pipeline_id
     and position    > v_atual.position
   order by position
   limit 1;

  if v_proxima.id is null then
    raise exception 'a etapa "%" é a última da esteira: daqui a OS se conclui, não avança', v_atual.name
      using errcode = '22023';
  end if;

  insert into ops.order_events (
    tenant_id, order_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_order.tenant_id, v_order.id, 'advanced',
    v_atual.id, v_atual.name, v_proxima.id, v_proxima.name,
    coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_event_id;

  update ops.orders
     set current_stage_id = v_proxima.id,
         status           = 'in_progress'
   where id = v_order.id;

  return v_event_id;
end;
$$;

comment on function ops.advance_order(uuid, text) is
  'Move a OS para a próxima etapa da esteira do tenant. Exige ops.order.decide quando a etapa atual pede aprovação; ops.order.manage nas demais.';

-- -----------------------------------------------------------------------------
-- ⭐ PULAR — o ato registrado
-- -----------------------------------------------------------------------------
-- Só pula quem tem `ops.order.decide`, e só se a etapa foi desenhada como
-- pulável. A razão é OBRIGATÓRIA: "pulei porque este trabalho não tem
-- briefing" é a diferença entre uma trilha que explica e uma que só omite.

create or replace function ops.skip_stage(
  p_order_id uuid,
  p_reason   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    ops.orders;
  v_atual    ops.pipeline_stages;
  v_proxima  ops.pipeline_stages;
  v_event_id uuid;
begin
  select * into v_order from ops.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'ordem de serviço não encontrada' using errcode = 'P0002';
  end if;

  if not ops.can_access(v_order.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_order.tenant_id, 'ops.order.decide') then
    raise exception 'pular uma etapa é decisão: exige a permissão ops.order.decide'
      using errcode = '42501';
  end if;

  if v_order.status not in ('open', 'in_progress') then
    raise exception 'OS % não está na esteira (status %)', p_order_id, v_order.status
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'pular uma etapa exige a razão: sem ela a trilha registra a omissão e esconde o motivo'
      using errcode = '22023';
  end if;

  select * into v_atual from ops.pipeline_stages where id = v_order.current_stage_id;

  if not v_atual.skippable then
    raise exception 'a etapa "%" não foi desenhada como pulável nesta esteira', v_atual.name
      using errcode = '22023';
  end if;

  select * into v_proxima
    from ops.pipeline_stages
   where pipeline_id = v_order.pipeline_id
     and position    > v_atual.position
   order by position
   limit 1;

  if v_proxima.id is null then
    raise exception 'a etapa "%" é a última da esteira: não há para onde pular', v_atual.name
      using errcode = '22023';
  end if;

  insert into ops.order_events (
    tenant_id, order_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_order.tenant_id, v_order.id, 'skipped',
    v_atual.id, v_atual.name, v_proxima.id, v_proxima.name,
    btrim(p_reason), (select auth.uid())
  )
  returning id into v_event_id;

  update ops.orders
     set current_stage_id = v_proxima.id,
         status           = 'in_progress'
   where id = v_order.id;

  return v_event_id;
end;
$$;

comment on function ops.skip_stage(uuid, text) is
  'Pula uma etapa PULÁVEL, registrando quem, quando e por quê. Pular nunca apaga a etapa da história da OS.';

-- -----------------------------------------------------------------------------
-- ⭐ DEVOLVER — o REFAZER, minerado do ciclo aprovar/rejeitar/refazer do kraken
-- -----------------------------------------------------------------------------
-- Volta a OS para uma etapa ANTERIOR da mesma esteira, com a instrução do que
-- refazer. É o que transforma "reprovado" em trabalho: reprovar sem dizer o
-- que mudar devolve a OS e trava a pessoa.
--
-- ⭐ Devolver uma OS CONCLUÍDA a reabre (`done → in_progress`) — é a
-- divergência de §3 em ação, e é o caso comum: a entrega saiu, o cliente pediu
-- ajuste. A história do trabalho continua a mesma.

create or replace function ops.send_back_order(
  p_order_id    uuid,
  p_to_stage_id uuid,
  p_instruction text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    ops.orders;
  v_atual    ops.pipeline_stages;
  v_destino  ops.pipeline_stages;
  v_event_id uuid;
begin
  select * into v_order from ops.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'ordem de serviço não encontrada' using errcode = 'P0002';
  end if;

  if not ops.can_access(v_order.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_order.tenant_id, 'ops.order.decide') then
    raise exception 'devolver uma OS é decisão: exige a permissão ops.order.decide'
      using errcode = '42501';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'OS cancelada não se devolve: retomar um trabalho cancelado é OS nova'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_instruction, ''))) = 0 then
    raise exception 'devolver exige a instrução do que refazer: devolver sem dizer o que mudar trava quem recebe'
      using errcode = '22023';
  end if;

  select * into v_destino
    from ops.pipeline_stages
   where id = p_to_stage_id and pipeline_id = v_order.pipeline_id;

  if v_destino.id is null then
    raise exception 'a etapa de destino não pertence à esteira desta OS'
      using errcode = '22023';
  end if;

  -- Etapa atual pode ser nula: OS concluída saiu da esteira. Nesse caso
  -- qualquer etapa da esteira é destino válido, e a OS reabre.
  select * into v_atual from ops.pipeline_stages where id = v_order.current_stage_id;

  if v_atual.id is not null and v_destino.position >= v_atual.position then
    raise exception 'devolver é voltar: a etapa "%" não é anterior a "%"', v_destino.name, v_atual.name
      using errcode = '22023';
  end if;

  insert into ops.order_events (
    tenant_id, order_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_order.tenant_id, v_order.id, 'sent-back',
    v_atual.id, v_atual.name, v_destino.id, v_destino.name,
    btrim(p_instruction), (select auth.uid())
  )
  returning id into v_event_id;

  update ops.orders
     set current_stage_id = v_destino.id,
         status           = 'in_progress'
   where id = v_order.id;

  return v_event_id;
end;
$$;

comment on function ops.send_back_order(uuid, uuid, text) is
  'Devolve a OS para uma etapa anterior com a instrução do que refazer. Devolver uma OS concluída a reabre — trabalho tem identidade por serviço.';

-- =============================================================================
-- 8. FECHAMENTO DE PRIVILÉGIOS
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema ops                 from public, anon, authenticated;
revoke all on all tables    in schema ops from public, anon, authenticated;
revoke all on all functions in schema ops from public, anon, authenticated;

grant usage on schema ops to authenticated;

grant select, insert, update on ops.pipelines to authenticated;

-- A ÚNICA com DELETE. Ver §2.1: desenhar esteira é tentativa e erro, e a
-- trilha sobrevive ao delete porque carimba o nome.
grant select, insert, update, delete on ops.pipeline_stages to authenticated;

grant select, insert, update on ops.orders to authenticated;

-- ⛔ SÓ SELECT. Nem INSERT: a trilha se escreve pelas funções de §7, que
-- conferem a permissão do ato. É a camada 2 da imutabilidade, mais a garantia
-- de que ninguém inventa um movimento que não aconteceu.
grant select on ops.order_events to authenticated;

-- ⛔ SÓ SELECT e INSERT. Refazer é versão nova; editar não existe.
grant select, insert on ops.deliverables to authenticated;

grant execute on function ops.can_access(uuid)                        to authenticated;
grant execute on function ops.advance_order(uuid, text)               to authenticated;
grant execute on function ops.skip_stage(uuid, text)                  to authenticated;
grant execute on function ops.send_back_order(uuid, uuid, text)       to authenticated;

-- `ops.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhuma esteira semeada — semear uma
-- seria escolher o processo do cliente por ele. Nenhum objeto em core, recon,
-- marketing, ap, crm ou ar. Nenhuma leitura de schema alheio.
-- =============================================================================
