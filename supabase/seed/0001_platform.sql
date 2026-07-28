-- =============================================================================
-- ALSHAM BUSINESS OS™ — seed/0001_platform.sql
-- O CATÁLOGO DA PLATAFORMA. Não é dado de cliente.
-- =============================================================================
--
-- ⚠️ A DIFERENÇA QUE ESTE ARQUIVO EXISTE PARA MARCAR:
--
--   CATÁLOGO  = o vocabulário da plataforma. Igual para todo tenant. Vive
--               aqui, é versionado, é reaplicável.
--   DADO DE   = tenant, usuário, extrato, título, aprovação. NUNCA vive aqui.
--   CLIENTE     Nasce em runtime, pela aplicação, com o cliente presente.
--
-- Por isso este arquivo insere **ZERO tenant, ZERO usuário, ZERO nome de
-- cliente** (Lei anti-viés). Se um dia alguém precisar de "um tenant de
-- exemplo", a resposta é um script de teste descartável, não este arquivo.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENTE POR CONTRATO
-- -----------------------------------------------------------------------------
-- Todo INSERT tem `on conflict do nothing`. Rodar duas vezes tem o mesmo
-- efeito de rodar uma. Isso não é conveniência: é o que permite reaplicar o
-- seed depois de acrescentar um módulo, sem medo e sem script de diferença.
--
-- Roda DEPOIS de 0001_core.sql e 0002_recon.sql. Ver docs/runbook/APLICAR.md.
--
-- ⚠️ Executar como `service_role` (ou dono do banco). As tabelas de catálogo
-- não têm policy de escrita para `authenticated` — de propósito.
-- =============================================================================

-- =============================================================================
-- 1. PAPÉIS DE SISTEMA
-- `tenant_id NULL` = papel idêntico em todo tenant. É o oposto de vazamento:
-- duplicar o papel `owner` em cada tenant é que quebraria o Sol Único.
-- -----------------------------------------------------------------------------
-- Só DOIS papéis nascem aqui, e é deliberado. `owner` e `admin` são o mínimo
-- para a plataforma funcionar. "Aprovador financeiro", "conciliador",
-- "auditor" — tudo isso é papel DE TENANT, criado por quem contrata, com as
-- permissões que aquela empresa quiser. Trazer o organograma de alguém para
-- cá seria o viés que a Lei 2 proíbe.
-- =============================================================================

insert into core.roles (tenant_id, key, name, description)
values
  (null, 'owner', 'Proprietário',
   'Controle total do tenant, incluindo cobrança e instalação de módulos.'),
  (null, 'admin', 'Administrador',
   'Administra membros, papéis e módulos. Não mexe em cobrança.')
on conflict (tenant_id, key) do nothing;

-- =============================================================================
-- 2. PERMISSÕES DO CORE NOS PAPÉIS DE SISTEMA
-- -----------------------------------------------------------------------------
-- As chaves espelham as policies de 0001_core.sql. Se uma policy citar uma
-- permissão que não existe aqui, ninguém consegue exercer a ação — e o
-- sintoma seria "o botão não faz nada", que é o pior tipo de bug.
-- =============================================================================

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.permission_key, 'core'
  from core.roles r
 cross join (values
   ('core.tenant.manage'),
   ('core.membership.manage'),
   ('core.role.manage'),
   ('core.module.install'),
   ('core.audit.read')
 ) as p(permission_key)
 where r.tenant_id is null
   and r.key = 'owner'
on conflict (role_id, permission_key) do nothing;

-- `admin` faz tudo do owner MENOS instalar módulo (que tem custo) — a
-- fronteira entre administrar e contratar.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.permission_key, 'core'
  from core.roles r
 cross join (values
   ('core.membership.manage'),
   ('core.role.manage'),
   ('core.audit.read')
 ) as p(permission_key)
 where r.tenant_id is null
   and r.key = 'admin'
on conflict (role_id, permission_key) do nothing;

-- =============================================================================
-- 3. O MÓDULO `recon` NO CATÁLOGO DA STORE
-- Transcrito de packages/finance-reconciliation/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Este bloco e o `MANIFEST` do pacote têm de andar juntos. Se divergirem,
-- a Store exibe uma coisa e o código faz outra — e o manifesto vira mentira.
-- Há um teste no CI que compara os dois.
--
-- `status = 'published'` porque as duas capacidades listadas ESTÃO
-- construídas (Lei 7). As outras 17 do Domain Financeiro não aparecem porque
-- não existem.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'recon',
  'Conciliação & Aprovações',
  '0.1.0',
  'Importa o extrato, sugere as baixas, e põe cada divergência numa fila com visto e trilha.',
  'domain', 'finance',
  '[
     {"key":"bank-reconciliation","canonicalName":"Conciliação bancária"},
     {"key":"financial-approvals","canonicalName":"Aprovações financeiras"}
   ]'::jsonb,
  '[
     {"key":"recon.statement.import","moduleId":"recon","description":"Importar extratos bancários e títulos a pagar."},
     {"key":"recon.match.manage","moduleId":"recon","description":"Criar, ajustar e desfazer casamentos entre lançamentos e títulos."},
     {"key":"recon.approval.decide","moduleId":"recon","description":"Aprovar ou rejeitar itens da fila de aprovação."}
   ]'::jsonb,
  '[
     {"type":"recon.reconciliation.completed","version":1,"description":"Um extrato foi fechado. Traz o total de linhas, quantas casaram e — o que interessa — quantas sobraram."},
     {"type":"recon.approval.decided","version":1,"description":"Um humano visou um item da fila: aprovado ou rejeitado, com quem, quando e por quê."},
     {"type":"recon.statement.discarded","version":1,"description":"Um extrato foi descartado — a ação destrutiva deste módulo. Some da operação, nunca da trilha."}
   ]'::jsonb,
  -- Vazio de propósito: o handler que consumiria `finance.payable.registered`
  -- está NÃO CONSTRUÍDO. Declarar consumo sem consumidor é promessa no ar.
  '[]'::jsonb,
  -- Nenhum agente embarcado ainda: o motor de IA é da Fase 8.
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do nothing;

-- =============================================================================
-- 4. ⛔ O BLOCO QUE SAIU — as permissões de módulo no papel de sistema
-- -----------------------------------------------------------------------------
-- Aqui existiam dois blocos que concediam as permissões de `recon` e de
-- `marketing` ao papel de SISTEMA `admin`, como ponte até o instalador em
-- runtime existir. O próprio bloco dizia: *"quando o instalador nascer, este
-- bloco sai"*.
--
-- **Ele nasceu (`0006_install.sql`), e o bloco saiu.**
--
-- O motivo não é simetria — é um vazamento. `core.has_permission()` casa
-- `rp.tenant_id is null OR rp.tenant_id = m.tenant_id`, então um papel de
-- sistema vale em **todo** tenant. Com aqueles blocos, qualquer tenant novo
-- cujo usuário fosse `admin` já nascia com as permissões dos dois módulos —
-- **sem instalar nada, e sem ocupar vaga no plano**. Com um tenant só,
-- ninguém vê; com o segundo, é o módulo inteiro de graça.
--
-- Por isso `core.install_module()` **recusa papel de sistema**: conceder ali
-- seria recriar o vazamento pela via oficial.
--
-- ⚠️ **Tirar daqui não apaga o que já existe.** Ambientes que aplicaram o seed
-- antes desta versão continuam com aquelas linhas, e a limpeza é ato do dono —
-- está em `docs/runbook/APLICAR.md §7.3`, com o aviso do que ela muda para
-- quem já usa.
--
-- A partir de agora, quem concede permissão de módulo é o instalador, num
-- papel DO TENANT, quando alguém clica em instalar.
-- =============================================================================
-- 4.1 O MÓDULO `marketing` NO CATÁLOGO DA STORE
-- Transcrito de packages/marketing/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra do `recon`: este bloco e o `MANIFEST` do pacote andam juntos,
-- e há teste no CI que compara os dois.
--
-- ⭐ **A diferença que este bloco marca:** `events_consumes` NÃO está vazio.
-- Este é o primeiro módulo do catálogo que escuta o fato de outro — e a Store
-- pode dizer isso ao cliente porque o handler existe e é testado (Lei 7).
--
-- `status = 'published'` com UMA capacidade só. As outras 12 do Domain
-- Marketing não aparecem porque não existem — e listá-las seria vender o que
-- não está construído.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'marketing',
  'Campanhas de Marketing',
  '0.1.0',
  'Planeja, agenda, publica e mede campanhas — e fica sabendo da verba aprovada sem ninguém precisar avisar.',
  'domain', 'marketing',
  '[
     {"key":"campaigns","canonicalName":"Campanhas"}
   ]'::jsonb,
  '[
     {"key":"marketing.campaign.manage","moduleId":"marketing","description":"Criar e editar campanhas, peças e agendamento."},
     {"key":"marketing.campaign.publish","moduleId":"marketing","description":"Pôr campanha no ar, encerrar e cancelar."},
     {"key":"marketing.result.record","moduleId":"marketing","description":"Registrar o resultado medido de uma campanha."}
   ]'::jsonb,
  '[
     {"type":"marketing.campaign.published","version":1,"description":"Uma campanha entrou no ar, com a verba e o público que tinha no momento."},
     {"type":"marketing.campaign.completed","version":1,"description":"Uma campanha cumpriu seu ciclo e foi encerrada."},
     {"type":"marketing.campaign.cancelled","version":1,"description":"Uma campanha foi cancelada — a ação destrutiva deste módulo. Some da operação, nunca da trilha."}
   ]'::jsonb,
  -- ⭐ O consumo declarado. Só está aqui porque o handler EXISTE.
  '[
     {"type":"recon.approval.decided","version":1,"description":"Uma decisão financeira foi visada por um humano. Quando a referência bate com a verba de uma campanha, a campanha fica sabendo."}
   ]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do nothing;

-- (As permissões do `marketing` também saíram daqui — ver o bloco 4.)

-- =============================================================================
-- 5. PLANOS-BASE
-- Minerado de: `plan_limits` (5 planos) do kraken-v2 (PROVADO em produção).
-- -----------------------------------------------------------------------------
-- ⚠️ SEM PREÇO, e isso é decisão de arquitetura, não esquecimento. Quanto
-- custa é assunto de `@alsham/billing`, que ainda NÃO EXISTE. Separar o que o
-- plano PERMITE do que o plano CUSTA é o que deixa mudar preço sem tocar em
-- limite — e vender o mesmo limite por preços diferentes por região ou
-- contrato.
--
-- Nomes genéricos de propósito: `free`, `starter`, `pro`. Nome de plano
-- espelhando um cliente seria viés.
--
-- ⚠️ Lei 7: os NÚMEROS abaixo são ponto de partida técnico, **NÃO
-- VERIFICADOS** contra custo real de operação. Nenhum deles vai a proposta,
-- site ou tabela de preço antes de ser medido. Estão aqui para que o motor de
-- limite tenha o que ler, não para prometer nada.
--
-- `on_exceed`: 'block' corta na hora; 'meter' deixa passar e mede para cobrar
-- depois (padrão `usage_ledger` do kraken-v2).
-- =============================================================================

insert into core.plan_limits (plan_code, metric, limit_value, on_exceed)
values
  -- free
  ('free',    'seats',            3,       'block'),
  ('free',    'modules',          1,       'block'),
  ('free',    'storage-mb',       500,     'block'),
  ('free',    'events-per-month', 10000,   'block'),
  -- starter
  ('starter', 'seats',            15,      'block'),
  ('starter', 'modules',          5,       'block'),
  ('starter', 'storage-mb',       10000,   'block'),
  ('starter', 'events-per-month', 250000,  'meter'),
  -- pro
  ('pro',     'seats',            null,    'meter'),
  ('pro',     'modules',          null,    'meter'),
  ('pro',     'storage-mb',       100000,  'meter'),
  ('pro',     'events-per-month', null,    'meter')
on conflict (plan_code, metric) do nothing;

-- =============================================================================
-- FIM.
-- Nenhum tenant. Nenhum usuário. Nenhum nome de cliente. Nenhum segredo.
-- Reaplicável: rodar de novo não muda nada.
-- =============================================================================
