-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0120_secret_pages.sql
-- PÁGINAS RESERVADAS — conteúdo por endereço secreto, do TENANT, no banco.
-- Objetos no schema `core`. Core, NÃO módulo: sem manifesto, fora da Store.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono. A lacuna 0015–0016 é proposital, e a
-- 0119 fica RESERVADA para o PR do fuso do tenant (aberto à parte) — por isso
-- esta, a próxima livre nesta frente, é a 0120 e não a 0119: dois PRs abertos
-- não podem cravar o mesmo número sem colidir no merge.
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE ESTE ARQUIVO RESOLVE, E POR QUE O CONTEÚDO NÃO PODE VIVER EM CÓDIGO
-- -----------------------------------------------------------------------------
-- Precisa-se de uma página que só quem tem login no tenant E conhece o endereço
-- exato consegue abrir — uma proposta, um documento reservado, endereçado a um
-- interlocutor específico. A tentação é escrever essa página como um arquivo no
-- repositório. Seria erro de canon: o §3 do CLAUDE.md PROÍBE nome de cliente
-- (razão social, marca, apelido, contato) em qualquer arquivo, commit, branch,
-- comentário ou pasta. Um documento endereçado a alguém carrega o nome dele.
--
-- A resposta certa é a que o banco já é: **dado de tenant mora no banco, com
-- RLS**, não em código. Esta migration cria a PRATELEIRA genérica
-- (`core.secret_pages`) — slug, título, corpo em markdown, por tenant, isolada.
-- O CONTEÚDO (o nome, a proposta) o dono insere direto no banco depois do
-- apply; nunca passa por PR nenhuma. Nenhum nome entra no repositório — só a
-- estrutura, que é a mesma para qualquer tenant e qualquer documento.
--
-- ⛔ DUAS CAMADAS DE SEGREDO, e a segunda é a única que conta:
--   1. O `slug` é aleatório e não-óbvio (default de 32 hex): não se adivinha,
--      não aparece em menu, busca ou sitemap. É defesa em profundidade.
--   2. A RLS é a cerca real: a leitura resolve o tenant da sessão e devolve só
--      as linhas DAQUELE tenant. Saber o slug de outro tenant não revela nada —
--      a consulta roda dentro do seu próprio tenant e volta vazia.
--
-- ⚖️ É CORE, como o Painel (0021) e o Insight (0116): serve TODOS os tenants e
-- nenhum módulo em particular (Lei do Lego §5.5.1). Sem manifesto, sem cartão de
-- seed, fora da Store. Escreve/lê em `core`, que já está exposto na Data API.
-- =============================================================================

-- =============================================================================
-- 1. A TABELA — a prateleira de páginas reservadas do tenant
-- -----------------------------------------------------------------------------
-- ⚠️ `slug` UNIQUE global e não-óbvio: é o endereço. O default o gera aleatório
-- (32 hex de dois uuids) para que uma inserção manual que esqueça o slug NUNCA
-- caia num endereço adivinhável. O `tenant_id` é a dona; a RLS abaixo garante
-- que um slug só resolve dentro do próprio tenant.
-- =============================================================================

create table core.secret_pages (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,

  -- O ENDEREÇO. Único no mundo, não-óbvio, não-vazio. O default é aleatório —
  -- `replace(gen_random_uuid...)` não exige extensão e dá 32 hex por uuid.
  slug        text        not null unique
                          default replace(gen_random_uuid()::text, '-', '')
                                || replace(gen_random_uuid()::text, '-', ''),

  -- O TÍTULO e o CORPO (markdown). Título não-vazio (Lei 7: página sem título é
  -- ruído). Corpo pode nascer vazio e ser preenchido depois pelo dono.
  title       text        not null check (btrim(title) <> ''),
  body        text        not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- O slug não-óbvio é regra, não sugestão: recusa endereço curto/adivinhável.
  constraint secret_pages_slug_nao_obvio check (char_length(slug) >= 24)
);

comment on table core.secret_pages is
  'Páginas reservadas do tenant: conteúdo (markdown) acessível só por login no tenant + o slug exato. Core, não módulo. O conteúdo é inserido no banco pelo dono; nunca em código (§3). A RLS isola por tenant; o slug é a segunda camada.';

-- ⛔ RLS ligada e FORÇADA. A tabela nua é fechada ao authenticated (sem grant,
-- sem policy de tabela): a única porta de leitura é a função abaixo, no molde
-- do 0116 (defesa em profundidade — a leitura passa sempre pelo leitor que
-- valida o vínculo). A escrita é do service_role (o dono, no apply).
alter table core.secret_pages enable row level security;
alter table core.secret_pages force row level security;

create index secret_pages_by_tenant_idx
  on core.secret_pages (tenant_id, updated_at desc);

-- =============================================================================
-- 2. A LEITURA — o tenant abre a PRÓPRIA página, pelo slug, e só ela
-- -----------------------------------------------------------------------------
-- O molde do 0116/0021: `security definer`, com o vínculo checado na PRIMEIRA
-- linha. A função NÃO confia no `p_tenant_id` que recebeu — exige que o
-- chamador seja membro dele. Depois disso, resolve a página SÓ dentro desse
-- tenant: `where tenant_id = p_tenant_id and slug = p_slug`. Assim, conhecer o
-- slug de OUTRO tenant não abre nada — a consulta é sempre no seu próprio.
-- =============================================================================

create or replace function core.read_secret_page(p_tenant_id uuid, p_slug text)
returns table (
  title      text,
  body       text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.is_tenant_member(p_tenant_id) then
    raise exception 'sem vínculo com este tenant' using errcode = '42501';
  end if;

  return query
  select sp.title, sp.body, sp.updated_at
    from core.secret_pages sp
   where sp.tenant_id = p_tenant_id
     and sp.slug = p_slug;
end;
$$;

comment on function core.read_secret_page(uuid, text) is
  'Abre a página reservada DESTE tenant pelo slug. O vínculo é checado na primeira linha (molde do 0116); o slug só resolve dentro do próprio tenant, então saber o slug de outro tenant não revela nada.';

-- =============================================================================
-- 3. FECHAMENTO — revogar ANTES de conceder (a lição do 0021/0022/0116)
-- -----------------------------------------------------------------------------
-- Toda função nasce com EXECUTE para PUBLIC no PostgreSQL. Esta nasceu DEPOIS
-- do `revoke ... on all functions in schema core` do 0001, então herdou o
-- privilégio de PUBLIC — e o `grant` abaixo só significa algo porque o `revoke`
-- tira o de PUBLIC primeiro. Sem ele, o grant é decoração (a sabotagem do 0022).
-- =============================================================================

revoke all on function core.read_secret_page(uuid, text) from public, anon, authenticated;
grant execute on function core.read_secret_page(uuid, text) to authenticated;

-- A escrita é do dono/serviço: o conteúdo é inserido direto no banco no apply.
-- `authenticated` e `anon` não recebem grant de tabela — a prateleira é fechada.
grant insert, update, delete on core.secret_pages to service_role;

-- =============================================================================
-- FIM. Uma prateleira fechada, uma porta de leitura que valida o vínculo. O
-- conteúdo (nome, proposta) é do banco, inserido pelo dono — nunca do código.
-- A rota genérica `/p/[slug]` no portal chama `core.read_secret_page` sob a
-- sessão do usuário; sem login ou sem o slug exato, não há página.
-- =============================================================================
