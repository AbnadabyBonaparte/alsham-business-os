-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0009_crm.sql
-- Módulo 4: Relacionamentos (CRM base). Schema `crm`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0008` e o seed estão aplicados em produção (informado
-- pelo dono). Aplicar é ato do dono — ver docs/runbook/APLICAR.md §9.
--
-- -----------------------------------------------------------------------------
-- AS DUAS DECISÕES DE CANON, ANTES DA PRIMEIRA TABELA
-- -----------------------------------------------------------------------------
-- **1. O `module_id` é `crm`.**
--
-- O CORE-SPEC (§3, passo 1 e passo 5) define o tipo de evento como
-- `<moduleId>.<agregado>.<fato>`, e o cinto de `emit_event()` confere esse
-- prefixo. Com eventos e permissões em `crm.*`, o `module_id` **tem** de ser
-- `crm` — qualquer outra escolha faria a porta de saída recusar os próprios
-- eventos do módulo, em runtime, no primeiro cadastro. É a mesma lição que o
-- Módulo 3 documentou, e agora é padrão.
--
-- **2. O `domain_key` é `crm` — Taxonomia §5, "🤝 Comercial & CRM (12)".**
--
-- A seção lista, literalmente: *CRM · Pipeline · Propostas · Orçamentos ·
-- Follow-up · Visitas · Clientes · Leads · WhatsApp · Ligações · Comissão ·
-- Metas* — e traz a nota *"reaproveita 360° PRIMA"*, que é a Lei 4 em letra.
--
-- ⚠️ **UMA CAPACIDADE DAQUELA LISTA NÃO PODE VIRAR SCHEMA, E É "WhatsApp".**
-- A Taxonomia nomeia as capacidades como o MERCADO as nomeia — é um mapa do
-- que empresas fazem, não um projeto de tabela. Congelar "WhatsApp" numa
-- coluna ou num enum seria congelar o instrumento de um país e de uma década
-- dentro de um produto que nasce servindo qualquer um. Aqui o canal é
-- **texto livre**, e é assim que a capacidade continua atendida quando o
-- instrumento mudar.
--
-- -----------------------------------------------------------------------------
-- LEI 4 — O REAPROVEITAMENTO, E A DIVERGÊNCIA DELIBERADA
-- -----------------------------------------------------------------------------
-- `packages/crm/README.md` e o Balanço Supabase (§ pedreira) mandam minerar o
-- SCHEMA do `alsham-core` — `accounts` / `contacts` / `deals` / `quotes` —
-- **jamais o banco**. O que se minerou aqui foi a IDEIA, e com uma divergência
-- que precisa estar escrita:
--
--   A pedreira separa `accounts` (organização) de `contacts` (pessoa).
--   **Aqui é UMA tabela, com `kind`.**
--
-- Duas tabelas forçam uma hierarquia — o contato PERTENCE a uma conta —, e
-- essa hierarquia presume um organograma de venda B2B. Um fornecedor
-- autônomo é pessoa sem conta; um cliente de uma pessoa só é os dois ao mesmo
-- tempo; um parceiro não é nem um nem outro. Com `kind` numa tabela só, o
-- módulo serve os três sem presumir o negócio de ninguém (Lei anti-viés), e
-- — o que mais importa — **o histórico de contato fica inteiro num lugar só**,
-- que é a razão de este módulo existir.
--
-- ⚠️ **NÃO VERIFICADO:** este repositório não leu o schema real do
-- `alsham-core`. A mineração partiu do que o Balanço registra, e o Balanço é
-- documento — não é o banco. Nenhum agente daqui conecta a banco com dado de
-- cliente.
--
-- -----------------------------------------------------------------------------
-- O TESTE ANTI-VIÉS, CAMPO A CAMPO
-- -----------------------------------------------------------------------------
-- CRM é onde o viés entra mais fácil de todos: o funil de UMA empresa vira
-- enum, e o produto passa a vender o processo de um cliente para todos.
-- =============================================================================

create schema if not exists crm;

comment on schema crm is
  'Módulo Relacionamentos (CRM base). Domain crm da Taxonomia. Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- Quarta vez que este bloco aparece, e é o ponto: o padrão virou lei (§5.5).
-- =============================================================================

create or replace function crm.emit_event(
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
  if p_event_type not like 'crm.%' then
    raise exception 'crm.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'crm',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function crm.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function crm.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'crm.party.manage')
      or core.has_permission(p_tenant_id, 'crm.interaction.record')
      or core.has_permission(p_tenant_id, 'crm.party.archive');
$$;

create or replace function crm.touch_updated_at()
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
-- 2. PARTIES — a contraparte
-- -----------------------------------------------------------------------------
-- Uma tabela, dois `kind`. Pessoa ou organização com quem a empresa se
-- relaciona: cliente, fornecedor, parceiro, prospecto, o que o tenant chamar.
--
-- ANTI-VIÉS aplicado:
--
--   ✅ ENTRA `kind` com DOIS valores só — `person` e `org`. É a distinção que
--      muda o comportamento no mundo real (pessoa tem nome, organização tem
--      razão social) e a única que vale em qualquer país e qualquer setor.
--   ✅ ENTRA `tax_id` — nome NEUTRO de propósito, e OPCIONAL. Chamar de `cpf`
--      ou `cnpj` amarraria o produto ao Brasil; ter os dois presumiria que
--      pessoa tem um e organização tem outro, o que é verdade **aqui** e não
--      na maioria do mundo. É "identificador fiscal", e cada país põe o seu.
--   ✅ ENTRA `tags text[]` — TEXTO LIVRE, escolhido pelo tenant. É aqui que
--      "cliente", "fornecedor", "VIP", "inativo" vivem, e é aqui que eles
--      DEVEM viver: cada empresa recorta a carteira dela do jeito dela.
--   ✅ ENTRA `email` e `phone`, os dois OPCIONAIS e sem formato imposto.
--
--   ❌ NÃO ENTRA `type` com enum de negócio ('cliente','fornecedor','lead').
--      Parece inofensivo e é o viés inteiro: uma empresa que compra e vende
--      para a mesma contraparte precisaria de duas linhas, e o histórico de
--      contato se partiria em dois. É `tags`, e o tenant decide.
--   ❌ NÃO ENTRA funil, estágio, pipeline, probabilidade, valor esperado.
--      *Pipeline* é outra capacidade da Taxonomia (§5) e é um MÓDULO próprio.
--      Um estágio de funil no cadastro de contraparte é o processo de UMA
--      empresa virando schema de todas.
--   ❌ NÃO ENTRA `whatsapp`, `instagram`, `telefone_fixo`, `celular`.
--      Instrumento de contato de um país e de uma década. Ver o cabeçalho.
--   ❌ NÃO ENTRA dono/responsável/vendedor, comissão, meta. São capacidades
--      próprias, e "quem atende" é organograma de cliente.
--   ❌ NÃO ENTRA endereço estruturado (rua/número/CEP/estado). Formato de
--      endereço é o que mais varia entre países, e este módulo não precisa
--      dele para existir. Quando precisar, nasce como capacidade própria.
--
-- ⚠️ Arquivar é STATUS, nunca `delete`. Contraparte apagada leva junto o
-- histórico de contato — e a policy de DELETE não existe, então nem por engano.
-- =============================================================================

create table crm.parties (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  kind           text        not null check (kind in ('person', 'org')),
  display_name   text        not null check (length(btrim(display_name)) > 0),
  -- Identificador fiscal da contraparte. Neutro de país, como no recon e no ap.
  tax_id         text        check (tax_id is null or length(btrim(tax_id)) > 0),
  email          text        check (email is null or length(btrim(email)) > 0),
  phone          text        check (phone is null or length(btrim(phone)) > 0),
  -- O recorte da carteira é do tenant. Ver o ANTI-VIÉS acima.
  tags           text[]      not null default '{}',
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  note           text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  -- ⭐ Necessário para a chave estrangeira composta das interações — ver §3.
  constraint parties_id_tenant unique (id, tenant_id)
);

-- ⭐ A UNICIDADE DO IDENTIFICADOR — e por que é índice PARCIAL, não constraint.
--
-- A mesma contraparte não entra duas vezes no tenant **quando o identificador
-- é informado**. Quando não é, não há o que comparar: duas pessoas podem ter o
-- mesmo nome, e recusar a segunda seria inventar uma regra que o mundo não tem.
--
-- `unique (tenant_id, tax_id)` como constraint de tabela não serviria: em
-- Postgres, NULL nunca conflita com NULL, então ela até deixaria passar os
-- nulos — mas por acidente da semântica, não por decisão. O índice parcial diz
-- a decisão em voz alta: **a regra só existe onde o dado existe.**
create unique index parties_unique_tax_id
  on crm.parties (tenant_id, tax_id)
  where tax_id is not null;

create index parties_active_idx
  on crm.parties (tenant_id, display_name)
  where status = 'active';
create index parties_tags_idx on crm.parties using gin (tags);

create trigger parties_touch
  before update on crm.parties
  for each row execute function crm.touch_updated_at();

alter table crm.parties enable row level security;
alter table crm.parties force row level security;

create policy parties_select on crm.parties
  for select to authenticated
  using (crm.can_access(tenant_id));

create policy parties_insert on crm.parties
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'crm.party.manage'));

-- Editar exige `manage`. A separação real de quem ARQUIVA está no trigger de
-- §2.2 — policy de UPDATE não enxerga o `old` e não distingue "corrigiu o
-- telefone" de "tirou a contraparte da carteira". Mesma decisão do `ap`.
create policy parties_update on crm.parties
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'crm.party.manage')
    or core.has_permission(tenant_id, 'crm.party.archive')
  )
  with check (
    core.has_permission(tenant_id, 'crm.party.manage')
    or core.has_permission(tenant_id, 'crm.party.archive')
  );

-- ⛔ Sem policy de DELETE. Arquivar é `status = 'archived'`.

-- -----------------------------------------------------------------------------
-- 2.1 ⭐ AS TRANSIÇÕES PERMITIDAS — a mesma tabela que o domínio TypeScript
-- -----------------------------------------------------------------------------
-- Espelho exato de `ALLOWED_TRANSITIONS` em `@alsham/crm`, e há um teste que LÊ
-- ESTE ARQUIVO e compara par a par. Mesma arquitetura do Módulo 3.
--
-- ⚠️ **AQUI O CICLO DIFERE DO `ap` DE PROPÓSITO, E A DIFERENÇA É A LIÇÃO.**
--
-- No Módulo 3, `cancelled` é TERMINAL: um título que volta a ser devido é
-- documento NOVO, com referência nova, porque dinheiro tem identidade por
-- documento.
--
-- Aqui, `archived → active` **existe**. Uma contraparte que volta é a MESMA
-- pessoa. Obrigá-la a nascer de novo criaria uma segunda linha para alguém que
-- é um só — e partiria o histórico de contato em dois, que é exatamente o que
-- este módulo existe para manter inteiro.
--
-- Copiar a regra do módulo anterior "por consistência" teria sido o erro.
-- =============================================================================

create or replace function crm.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function crm.allowed_transition(text, text) is
  'O ciclo de vida da contraparte. Espelho exato de ALLOWED_TRANSITIONS em @alsham/crm — há teste que lê este arquivo e compara.';

-- -----------------------------------------------------------------------------
-- 2.2 O PORTEIRO DO ESTADO
-- Cadastrar uma contraparte e tirá-la da carteira são atos diferentes. O
-- produto PERMITE que sejam a mesma pessoa (as duas permissões no mesmo
-- papel), mas não PRESUME.
-- -----------------------------------------------------------------------------

create or replace function crm.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not crm.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da contraparte', old.status, new.status
      using errcode = '22023';
  end if;

  -- Vale para os DOIS sentidos: quem pode tirar da carteira é quem pode
  -- trazer de volta. Deixar o retorno livre faria "arquivar" ser uma porta que
  -- qualquer um destranca por dentro.
  if not core.has_permission(new.tenant_id, 'crm.party.archive') then
    raise exception 'mudar o estado da contraparte exige a permissão crm.party.archive'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger parties_guard_status
  before update of status on crm.parties
  for each row execute function crm.guard_status_transition();

-- =============================================================================
-- 3. INTERACTIONS — o registro de contato
-- -----------------------------------------------------------------------------
-- ⭐ **IMUTÁVEIS POR CONTRATO, e isso é a decisão central desta tabela.**
--
-- Uma interação é o registro de que **algo aconteceu**: uma conversa, uma
-- visita, uma ligação, um e-mail. Fato consumado não se edita. Se o registro
-- saiu errado, a correção é **outra interação** dizendo o que se corrigiu —
-- exatamente como um livro-caixa se corrige com estorno, nunca com borracha.
--
-- A imutabilidade tem TRÊS camadas, e as três são deliberadas:
--
--   1. **sem policy de UPDATE** — a RLS nega por ausência;
--   2. **sem GRANT de UPDATE nem de DELETE** — a porta nem existe;
--   3. **um trigger que levanta erro** em UPDATE e em DELETE — para o dia em
--      que alguém rodar como dono do banco, onde as duas primeiras não valem.
--
-- Duas bastariam para o cliente. A terceira é para nós.
--
-- ANTI-VIÉS:
--
--   ✅ ENTRA `channel` como TEXTO LIVRE. "ligação", "visita", "e-mail",
--      "aplicativo de mensagem", "carta" — e o que existir em 2030. Ver o
--      cabeçalho sobre a capacidade *WhatsApp* da Taxonomia.
--   ✅ ENTRA `occurred_at` separado de `created_at`: quando ACONTECEU não é
--      quando foi DIGITADO, e registrar a visita de ontem é o caso comum.
--
--   ❌ NÃO ENTRA `direction` ('inbound'/'outbound'), `outcome`, `sentiment`,
--      `next_step`, `duration`. Cada um deles é o processo de uma equipe de
--      venda virando obrigação de todas. Quando *Follow-up* ou *Pipeline*
--      nascerem como módulo, eles trazem o que precisarem.
-- =============================================================================

create table crm.interactions (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  party_id       uuid        not null,
  -- Quando ACONTECEU. Pode ser no passado — registrar a visita de ontem é o
  -- caso comum, não a exceção.
  occurred_at    timestamptz not null default now(),
  -- Por onde. TEXTO LIVRE — ver o ANTI-VIÉS acima.
  channel        text        not null check (length(btrim(channel)) > 0),
  note           text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  -- ⭐ A chave composta, e não só `references crm.parties (id)`.
  --
  -- Ela amarra a interação à contraparte **do mesmo tenant**. Sem o
  -- `tenant_id` na FK, uma interação poderia — por bug de aplicação, não por
  -- RLS — apontar para a contraparte de outro tenant, e a RLS de leitura
  -- esconderia o estrago em vez de impedi-lo.
  constraint interactions_party_fk
    foreign key (party_id, tenant_id)
    references crm.parties (id, tenant_id)
    on delete restrict
);

-- ⛔ `on delete restrict`, e não `cascade`: se um dia alguém conseguir apagar
-- uma contraparte, o banco recusa enquanto houver histórico. Arquivar não
-- apaga nada — e é justamente por isso que a porta de DELETE não existe.

create index interactions_timeline_idx
  on crm.interactions (tenant_id, party_id, occurred_at desc);

alter table crm.interactions enable row level security;
alter table crm.interactions force row level security;

create policy interactions_select on crm.interactions
  for select to authenticated
  using (crm.can_access(tenant_id));

create policy interactions_insert on crm.interactions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'crm.interaction.record'));

-- ⛔ Sem policy de UPDATE e sem policy de DELETE. É a camada 1 da
-- imutabilidade — a RLS nega por ausência.

-- 3.1 A terceira camada: o erro com NOME, para quem roda como dono do banco.
create or replace function crm.guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'interação é registro de fato consumado: não se edita nem se apaga. Registre outra interação corrigindo.'
    using errcode = '42501';
end;
$$;

create trigger interactions_immutable
  before update or delete on crm.interactions
  for each row execute function crm.guard_immutable();

-- =============================================================================
-- 4. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ **O PAYLOAD É AUTOSSUFICIENTE.** Quem escuta não pode fazer join: o schema
-- deste módulo é invisível para ele, por policy e por lei. O envelope da
-- interação carrega os dados da contraparte junto — quem receber
-- `crm.interaction.registered` não tem como resolver um `partyId` sozinho.
-- =============================================================================

create or replace function crm.party_payload(p crm.parties)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'partyId',     p.id,
    'kind',        p.kind,
    'displayName', p.display_name,
    'taxId',       p.tax_id,
    'email',       p.email,
    'phone',       p.phone,
    'tags',        to_jsonb(p.tags),
    'status',      p.status
  );
$$;

comment on function crm.party_payload(crm.parties) is
  'O envelope de uma contraparte — AUTOSSUFICIENTE. Quem escuta não pode fazer join, então tudo o que ele precisa vai aqui.';

-- 4.1 `crm.party.registered`
create or replace function crm.on_party_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform crm.emit_event(new.tenant_id, 'crm.party.registered', crm.party_payload(new));
  return new;
end;
$$;

create trigger parties_emit_registered
  after insert on crm.parties
  for each row execute function crm.on_party_registered();

-- 4.2 `crm.party.updated` — só o que MUDA O FATO para quem escuta.
--
-- ⚠️ Corrigir a nota interna não é fato para o mundo. Mudar nome, identificador
-- fiscal, contato ou tags é. Emitir a cada salvamento encheria a caixa de
-- saída de ruído — e o tenant paga por evento entregue.
create or replace function crm.on_party_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    return new;   -- mudança de estado tem evento próprio (§4.3)
  end if;

  if new.display_name is distinct from old.display_name
     or new.tax_id    is distinct from old.tax_id
     or new.email     is distinct from old.email
     or new.phone     is distinct from old.phone
     or new.kind      is distinct from old.kind
     or new.tags      is distinct from old.tags then
    perform crm.emit_event(new.tenant_id, 'crm.party.updated', crm.party_payload(new));
  end if;

  return new;
end;
$$;

create trigger parties_emit_updated
  after update on crm.parties
  for each row execute function crm.on_party_updated();

-- 4.3 `crm.party.archived` — a ação destrutiva deste módulo.
--
-- ⚠️ Só o arquivamento vira fato. Trazer de volta NÃO emite: quem escuta
-- guardou uma projeção do que era "sair da carteira", e um evento de retorno
-- exigiria que todo consumidor soubesse desfazer — obrigação que nenhum deles
-- pediu. Quando existir um consumidor que precise saber do retorno, nasce
-- `crm.party.restored`, com handler (Lei 7).
create or replace function crm.on_party_archived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'archived' or old.status = 'archived' then
    return new;
  end if;

  perform crm.emit_event(new.tenant_id, 'crm.party.archived', crm.party_payload(new));
  return new;
end;
$$;

create trigger parties_emit_archived
  after update of status on crm.parties
  for each row execute function crm.on_party_archived();

-- 4.4 `crm.interaction.registered`
create or replace function crm.on_interaction_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party crm.parties;
begin
  -- ⚠️ Este `select` é no PRÓPRIO schema do módulo — não é leitura de tabela
  -- alheia. Ele existe porque o payload tem de ser autossuficiente: quem
  -- receber a interação não tem como resolver um `partyId` sozinho.
  select * into v_party from crm.parties where id = new.party_id;

  perform crm.emit_event(
    new.tenant_id,
    'crm.interaction.registered',
    jsonb_build_object(
      'interactionId', new.id,
      'occurredAt',    new.occurred_at,
      'channel',       new.channel,
      'note',          new.note
    ) || crm.party_payload(v_party)
  );
  return new;
end;
$$;

create trigger interactions_emit_registered
  after insert on crm.interactions
  for each row execute function crm.on_interaction_registered();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema crm                from public, anon, authenticated;
revoke all on all tables    in schema crm from public, anon, authenticated;
revoke all on all functions in schema crm from public, anon, authenticated;

grant usage on schema crm to authenticated;

-- Sem DELETE. Nem por GRANT, nem por policy.
grant select, insert, update on crm.parties to authenticated;

-- ⛔ SÓ SELECT e INSERT. É a camada 2 da imutabilidade: sem GRANT de UPDATE
-- nem de DELETE, a porta não existe nem para quem tiver a permissão.
grant select, insert on crm.interactions to authenticated;

grant execute on function crm.can_access(uuid) to authenticated;

-- `crm.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum objeto em core, recon, marketing
-- ou ap. Nenhuma leitura de schema alheio.
-- =============================================================================
