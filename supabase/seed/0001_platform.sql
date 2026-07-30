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
     {"type":"recon.statement.discarded","version":1,"description":"Um extrato foi descartado — a ação destrutiva deste módulo. Some da operação, nunca da trilha."},
     {"type":"recon.match.decided","version":1,"description":"Um casamento (débito×payable ou crédito×receivable) foi confirmado ou rejeitado. Payload autossuficiente para o módulo de origem liquidar o título."}
   ]'::jsonb,
  -- ⭐ DEIXOU DE SER VAZIO NA ETAPA 10 — e a ordem importa.
  --
  -- Da Etapa 2 até a Etapa 9 esta linha era `'[]'` com o comentário: *"o
  -- handler que consumiria o título de outro módulo está NÃO CONSTRUÍDO;
  -- declarar consumo sem consumidor é promessa no ar"*. O handler foi
  -- construído (`packages/finance-reconciliation/src/external-payable.ts`), e
  -- só por isso a lista mudou. Primeiro o código, depois a promessa.
  --
  -- ⚠️ **O que a Store passa a exibir, e a segunda metade da frase honesta.**
  -- Este campo é o que a vitrine usa para dizer *"este módulo reage ao seu
  -- contas a pagar"*. A verdade completa é: **só reage se o módulo de Contas a
  -- Pagar estiver instalado**. Sem ele, ninguém emite `ap.*`, o consumidor
  -- nunca é acordado, e este módulo funciona inteiro do mesmo jeito — os
  -- títulos entram por importação, como sempre entraram.
  '[
     {"type":"ap.payable.registered","version":1,"description":"Um título a pagar nasceu em outro módulo. Vira projeção local, com a origem que veio no envelope, e a mesa de conciliação passa a ter contra o que casar."},
     {"type":"ap.payable.updated","version":1,"description":"O valor, o vencimento ou a liquidação de um título mudaram na origem. A projeção acompanha."},
     {"type":"ap.payable.cancelled","version":1,"description":"Um título foi cancelado na origem. A projeção passa a cancelled — some da mesa, nunca do banco."},
     {"type":"ar.receivable.registered","version":1,"description":"Um título a receber nasceu em outro módulo. Vira projeção local em recon.receivables; a mesa passa a ter contra o que casar o crédito do extrato."},
     {"type":"ar.receivable.updated","version":1,"description":"O valor, o vencimento ou o recebimento de um título mudaram na origem. A projeção acompanha — inclusive receber a maior."},
     {"type":"ar.receivable.cancelled","version":1,"description":"Um título a receber foi cancelado na origem. A projeção passa a cancelled — some da mesa, nunca do banco."}
   ]'::jsonb,
  -- Nenhum agente embarcado ainda: o motor de IA é da Fase 8.
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  -- ⚠️ `do update`, e NÃO `do nothing` — mudou na Etapa 10, por necessidade.
  --
  -- Até a Etapa 9 todo bloco do catálogo era `do nothing`, e estava certo
  -- enquanto o catálogo só CRESCIA. Na Etapa 10 uma linha existente precisou
  -- mudar: o `recon` passou a declarar que escuta `ap.*`, e o dono já tem esse
  -- módulo registrado em produção desde a Etapa 3.
  --
  -- Com `do nothing`, reaplicar o seed não faria nada, a Store continuaria
  -- exibindo o catálogo antigo **para sempre**, e ninguém veria erro nenhum.
  -- Catálogo defasado em silêncio é a Lei 7 com o sinal trocado.
  --
  -- Isto continua idempotente: rodar duas vezes tem o mesmo efeito de rodar
  -- uma. O que muda é que agora o seed é a FONTE do catálogo, não só a semente
  -- dele — reaplicar traz a linha para a verdade do manifesto.
  --
  -- ⚠️ Consequência que é preciso saber: se alguém tiver editado o catálogo à
  -- mão no banco (mudado `status` para `deprecated`, por exemplo), a
  -- reaplicação do seed desfaz a edição. É o preço de ter uma fonte só, e é o
  -- lado certo do trade-off: catálogo é vocabulário de plataforma, versionado
  -- aqui. Depreciar um módulo se faz mudando este arquivo.
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

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
on conflict (module_id) do update set
  -- ⚠️ `do update`, e NÃO `do nothing` — mudou na Etapa 10, por necessidade.
  --
  -- Até a Etapa 9 todo bloco do catálogo era `do nothing`, e estava certo
  -- enquanto o catálogo só CRESCIA. Na Etapa 10 uma linha existente precisou
  -- mudar: o `recon` passou a declarar que escuta `ap.*`, e o dono já tem esse
  -- módulo registrado em produção desde a Etapa 3.
  --
  -- Com `do nothing`, reaplicar o seed não faria nada, a Store continuaria
  -- exibindo o catálogo antigo **para sempre**, e ninguém veria erro nenhum.
  -- Catálogo defasado em silêncio é a Lei 7 com o sinal trocado.
  --
  -- Isto continua idempotente: rodar duas vezes tem o mesmo efeito de rodar
  -- uma. O que muda é que agora o seed é a FONTE do catálogo, não só a semente
  -- dele — reaplicar traz a linha para a verdade do manifesto.
  --
  -- ⚠️ Consequência que é preciso saber: se alguém tiver editado o catálogo à
  -- mão no banco (mudado `status` para `deprecated`, por exemplo), a
  -- reaplicação do seed desfaz a edição. É o preço de ter uma fonte só, e é o
  -- lado certo do trade-off: catálogo é vocabulário de plataforma, versionado
  -- aqui. Depreciar um módulo se faz mudando este arquivo.
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- (As permissões do `marketing` também saíram daqui — ver o bloco 4.)

-- =============================================================================
-- 4.2 O MÓDULO `ap` NO CATÁLOGO DA STORE
-- Transcrito de packages/accounts-payable/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra dos outros dois: este bloco e o `MANIFEST` do pacote andam
-- juntos, e há teste no CI que compara os dois campo a campo.
--
-- ⚠️ **`module_id` é `ap`, não `accounts-payable`.** O CORE-SPEC define o tipo
-- de evento como `<moduleId>.<agregado>.<fato>`, e o cinto de `ap.emit_event()`
-- confere esse prefixo. Com eventos e permissões em `ap.*`, qualquer outro id
-- faria a porta de saída do módulo recusar os próprios eventos dele. O nome
-- legível é "Contas a Pagar"; o pacote é `@alsham/accounts-payable`. Só o
-- identificador é curto, e é ele que o contrato exige que seja o prefixo.
--
-- ⭐ **A diferença que este bloco marca:** `events_consumes` DEIXOU DE SER
-- VAZIO — fechamento do ciclo do débito (`recon.match.decided` + `0014`).
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'ap',
  'Contas a Pagar',
  '0.1.0',
  'Registra o que a empresa deve, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.',
  'domain', 'finance',
  '[
     {"key":"accounts-payable","canonicalName":"Contas a pagar"}
   ]'::jsonb,
  '[
     {"key":"ap.payable.manage","moduleId":"ap","description":"Registrar e editar títulos a pagar."},
     {"key":"ap.payable.cancel","moduleId":"ap","description":"Cancelar um título — a ação destrutiva deste módulo."}
   ]'::jsonb,
  '[
     {"type":"ap.payable.registered","version":1,"description":"Um título a pagar foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo."},
     {"type":"ap.payable.updated","version":1,"description":"Mudou algo que interessa a quem escuta: valor, vencimento, quanto já foi liquidado ou o estado."},
     {"type":"ap.payable.cancelled","version":1,"description":"Um título foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco."}
   ]'::jsonb,
  '[
     {"type":"recon.match.decided","version":1,"description":"Um casamento de débito foi confirmado ou rejeitado na conciliação. Confirmar liquida o título a pagar pelo externalRef; rejeitar só registra. Overpay é recusado."}
   ]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  -- Ver o comentário longo no bloco 3: catálogo é vocabulário de plataforma, e
  -- reaplicar o seed traz a linha para a verdade do manifesto.
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ E aqui NÃO entra nenhuma permissão de módulo, pelo mesmo motivo do bloco 4:
-- papel de sistema vale em todo tenant, e conceder `ap.payable.*` aqui daria o
-- módulo de graça a qualquer tenant novo. Quem concede é `core.install_module()`,
-- num papel DO TENANT, quando alguém clica em instalar na Store.

-- =============================================================================
-- 4.3 O MÓDULO `crm` NO CATÁLOGO DA STORE — o 4º cartão
-- Transcrito de packages/crm/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra dos outros três: este bloco e o `MANIFEST` do pacote andam
-- juntos, e há teste no CI que compara os dois campo a campo.
--
-- ⚠️ **UMA capacidade, e o Domain tem doze.** A Taxonomia §5 lista *CRM ·
-- Pipeline · Propostas · Orçamentos · Follow-up · Visitas · Clientes · Leads ·
-- WhatsApp · Ligações · Comissão · Metas*. Onze estão NÃO CONSTRUÍDAS.
--
-- ⚠️ **E uma delas nunca vira schema: `WhatsApp`.** A Taxonomia nomeia as
-- capacidades como o MERCADO as nomeia — é um mapa do que empresas fazem, não
-- um projeto de tabela. Congelar o instrumento de um país e de uma década numa
-- coluna faria o produto envelhecer junto com ele. O canal da interação é
-- texto livre, e é assim que a capacidade continua atendida.
--
-- ⭐ **O que este cartão marca no catálogo:** quatro módulos publicados, e
-- `events_consumes` vazio de novo — depois do `marketing` (consome 1) e do
-- `recon` (consome 3). A vitrine passa a mostrar que consumir é escolha de
-- cada módulo, não obrigação de nenhum.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'crm',
  'Relacionamentos',
  '0.1.0',
  'O cadastro de quem a empresa se relaciona — pessoas e organizações — e o histórico de contato com cada um, inteiro num lugar só.',
  'domain', 'crm',
  '[
     {"key":"crm","canonicalName":"CRM"}
   ]'::jsonb,
  '[
     {"key":"crm.party.manage","moduleId":"crm","description":"Cadastrar e editar contrapartes."},
     {"key":"crm.interaction.record","moduleId":"crm","description":"Registrar um contato no histórico de uma contraparte."},
     {"key":"crm.party.archive","moduleId":"crm","description":"Arquivar uma contraparte e trazê-la de volta — a ação destrutiva deste módulo."}
   ]'::jsonb,
  '[
     {"type":"crm.party.registered","version":1,"description":"Uma contraparte entrou na carteira: pessoa ou organização, com identificador, contato e etiquetas."},
     {"type":"crm.party.updated","version":1,"description":"Mudou algo que interessa a quem escuta: nome, identificador fiscal, contato ou etiquetas."},
     {"type":"crm.party.archived","version":1,"description":"Uma contraparte saiu da carteira — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco."},
     {"type":"crm.interaction.registered","version":1,"description":"Um contato foi registrado no histórico de uma contraparte, com quando, por onde e o que ficou anotado."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. A integração óbvia — o fornecedor de um título a pagar
  -- virar contraparte sozinho — daria tecnicamente hoje, porque o envelope do
  -- `ap` já carrega nome e identificador. Não entra porque o handler não
  -- existe, e porque QUANDO criar contraparte a partir de um pagamento é
  -- decisão de dono, que vira `settings` do tenant e nunca constante.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  -- Ver o comentário longo no bloco 3: catálogo é vocabulário de plataforma, e
  -- reaplicar o seed traz a linha para a verdade do manifesto.
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ E aqui também NÃO entra permissão de módulo. Quatro módulos no catálogo,
-- zero permissão concedida pelo seed. Quem concede é o instalador.

-- =============================================================================
-- 4.4 O MÓDULO `ar` NO CATÁLOGO DA STORE — o 5º cartão
-- Transcrito de packages/accounts-receivable/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra dos outros quatro: este bloco e o `MANIFEST` do pacote andam
-- juntos, e há teste no CI que compara os dois campo a campo.
--
-- ⚠️ **`module_id` é `ar`, não `accounts-receivable`** — o cinto de
-- `ar.emit_event()` confere o prefixo do evento. O pacote é
-- `@alsham/accounts-receivable`; só o identificador é curto.
--
-- ⭐ **O que este cartão marca:** o Domain `finance` passa a ter DOIS módulos no
-- catálogo (`ap` e `ar`), além do `recon`. Isso é o desenho funcionando —
-- Domain é classificação da Taxonomia, não fronteira de módulo. A Store mostra
-- três cartões do mesmo Domain, cada um instalável sozinho.
--
-- ⭐ **E `events_consumes` DEIXOU DE SER VAZIO** — o fechamento do ciclo.
-- Handler em `recon-settlement.ts` + `ar.apply_recon_match` (0013). A
-- conciliação de crédito (recon escuta ar.*) já existia na 0011; agora o AR
-- escuta a confirmação da baixa.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'ar',
  'Contas a Receber',
  '0.1.0',
  'Registra o que a empresa tem a receber, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.',
  'domain', 'finance',
  '[
     {"key":"accounts-receivable","canonicalName":"Contas a receber"}
   ]'::jsonb,
  '[
     {"key":"ar.receivable.manage","moduleId":"ar","description":"Registrar e editar títulos a receber."},
     {"key":"ar.receivable.cancel","moduleId":"ar","description":"Cancelar um título a receber — a ação destrutiva deste módulo."}
   ]'::jsonb,
  '[
     {"type":"ar.receivable.registered","version":1,"description":"Um título a receber foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo."},
     {"type":"ar.receivable.updated","version":1,"description":"Mudou algo que interessa a quem escuta: valor, vencimento, quanto já entrou ou o estado."},
     {"type":"ar.receivable.cancelled","version":1,"description":"Um título a receber foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco."}
   ]'::jsonb,
  '[
     {"type":"recon.match.decided","version":1,"description":"Um casamento de crédito foi confirmado ou rejeitado na conciliação. Confirmar liquida o título a receber pelo externalRef do payload; rejeitar só registra o fato."}
   ]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  -- Ver o comentário longo no bloco 3: catálogo é vocabulário de plataforma, e
  -- reaplicar o seed traz a linha para a verdade do manifesto.
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Cinco módulos no catálogo, zero permissão concedida pelo seed.
-- (O sexto cartão — `po` — é appended abaixo.)

-- =============================================================================
-- 4b. MÓDULO 6 — COMPRAS (PEDIDOS) · module_id = po
-- -----------------------------------------------------------------------------
-- Domain `procurement` (Taxonomia — Compras). Pedidos + Recebimento.
-- consumes VAZIO — integração com AP declarada NÃO CONSTRUÍDA no MODULO-PO-SPEC.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'po',
  'Compras (Pedidos)',
  '0.1.0',
  'Registra pedidos de compra com itens em texto livre, envia ao fornecedor e confere o recebimento — sem catálogo, sem cotação e sem inventar organograma.',
  'domain', 'procurement',
  '[
     {"key":"purchase-orders","canonicalName":"Pedidos"},
     {"key":"purchase-receipt","canonicalName":"Recebimento"}
   ]'::jsonb,
  '[
     {"key":"po.order.manage","moduleId":"po","description":"Criar e editar rascunhos e enviar o pedido ao fornecedor."},
     {"key":"po.order.cancel","moduleId":"po","description":"Cancelar um pedido — a ação destrutiva deste módulo."},
     {"key":"po.order.receive","moduleId":"po","description":"Registrar quantidades recebidas. Comprador ≠ quem confere."}
   ]'::jsonb,
  '[
     {"type":"po.order.registered","version":1,"description":"Um pedido nasceu (pode ser rascunho). Payload autossuficiente com itens."},
     {"type":"po.order.updated","version":1,"description":"Mudou fato do pedido: status, totais, itens ou quantidades recebidas."},
     {"type":"po.order.cancelled","version":1,"description":"O pedido foi cancelado. Continua no banco; nunca DELETE."}
   ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Seis módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.5 O MÓDULO `ops` NO CATÁLOGO DA STORE — o 7º cartão
-- Transcrito de packages/ops/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra dos outros cinco: este bloco e o `MANIFEST` do pacote andam
-- juntos, e há teste no CI que compara os dois campo a campo.
--
-- ⚠️ **`module_id` é `ops`, e NÃO `os`.** "OS" é uma CAMADA da Taxonomia (os 29
-- verticais da §6) e, pior, `os.` é um prefixo que casa dentro de `tenants.`,
-- `docs.` e de centenas de palavras — as guardas de CI deste repositório
-- procuram `<modulo>.` por grep, e uma guarda que acusa tudo é uma guarda
-- desligada. Ver o cabeçalho de `supabase/migrations/0018_ops.sql`.
--
-- ⭐ **O `domain_key` é `operations`, e este é o primeiro cartão fora de
-- `finance`/`crm`/`marketing`.** A etapa nasceu como "Marketing Ops" e é
-- justamente por isso que não pode ser do Domain Marketing: uma construtora,
-- uma oficina e um escritório de advocacia usam este módulo sem uma linha
-- diferente. A Taxonomia §5 põe *Ordens de serviço* como a primeira capacidade
-- de **🏭 Operações**, e é de lá que ele vem. A esteira de uma agência é
-- CONFIGURAÇÃO do tenant — linha em `ops.pipeline_stages` —, nunca schema.
--
-- ⭐ **`events_consumes` é VAZIO**, e é Lei 7. Ver a spec do módulo.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'ops',
  'Esteira de Produção',
  '0.1.0',
  'A empresa desenha a própria esteira de trabalho e move cada ordem de serviço por ela, com trilha do que foi feito, do que foi pulado e por quê.',
  'domain', 'operations',
  '[
     {"key":"work-orders","canonicalName":"Ordens de serviço"}
   ]'::jsonb,
  '[
     {"key":"ops.pipeline.design","moduleId":"ops","description":"Desenhar a esteira: criar etapas, ordená-las e dizer quais exigem aprovação ou podem ser puladas."},
     {"key":"ops.order.manage","moduleId":"ops","description":"Abrir ordens de serviço, movê-las pelas etapas comuns e registrar entregáveis."},
     {"key":"ops.order.decide","moduleId":"ops","description":"Decidir: passar de uma etapa que exige aprovação, pular uma etapa, devolver para refazer, concluir e cancelar."}
   ]'::jsonb,
  '[
     {"type":"ops.order.opened","version":1,"description":"Uma ordem de serviço nasceu numa esteira do tenant, com título, prazo e a etapa em que começou — pelo NOME, não só pelo id."},
     {"type":"ops.stage.advanced","version":1,"description":"A OS passou para a próxima etapa da esteira, com de onde para onde e o que ficou anotado."},
     {"type":"ops.stage.skipped","version":1,"description":"Uma etapa foi PULADA, com quem pulou, quando e a razão. Pular nunca apaga a etapa da história da OS."},
     {"type":"ops.order.sent-back","version":1,"description":"A OS foi devolvida para uma etapa anterior com a instrução do que refazer. Devolver uma OS concluída a reabre."},
     {"type":"ops.order.completed","version":1,"description":"A OS saiu da esteira concluída."},
     {"type":"ops.order.cancelled","version":1,"description":"A OS foi cancelada — a ação destrutiva deste módulo. Some da esteira, nunca da trilha, e nunca do banco."},
     {"type":"ops.deliverable.registered","version":1,"description":"Um entregável foi registrado numa versão nova, com a instrução que a gerou. Refazer cria versão; nunca edita."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. Ver o comentário acima e a spec do módulo.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();


-- ⛔ Sete módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.6 O MÓDULO `inv` NO CATÁLOGO DA STORE — o 8º cartão
-- Transcrito de packages/inventory/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⚠️ Mesma regra dos outros sete: este bloco e o `MANIFEST` do pacote andam
-- juntos, e há teste no CI que compara os dois campo a campo.
--
-- ⭐ **Domain `operations`, capacidade *Estoque*** — a nona da lista do
-- Domain na Taxonomia §5. *Almoxarifado* e *Inventário* NÃO são declaradas:
-- multi-depósito estruturado e contagem periódica com fechamento são
-- capacidades futuras, e listá-las seria vender o que não existe.
--
-- ⭐ **`events_consumes` é VAZIO**, e é Lei 7: o recebimento do `po` virar
-- entrada exigiria um fato com DELTA por linha e um vínculo linha↔item que o
-- `po` não tem (sem catálogo, por decisão de canon dele). Ver a spec §6.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'inv',
  'Estoque',
  '0.1.0',
  'O estoque como livro de movimentos imutável: entrada, saída e ajuste com razão. O saldo é a soma do livro — calculado, nunca editado.',
  'domain', 'operations',
  '[
     {"key":"stock","canonicalName":"Estoque"}
   ]'::jsonb,
  '[
     {"key":"inv.item.manage","moduleId":"inv","description":"Cadastrar e editar itens, arquivá-los e reativá-los. Nunca apagar."},
     {"key":"inv.movement.register","moduleId":"inv","description":"Lançar entradas e saídas no livro de movimentos."},
     {"key":"inv.movement.adjust","moduleId":"inv","description":"Lançar AJUSTES — o movimento que reescreve a contagem, sempre com razão obrigatória."}
   ]'::jsonb,
  '[
     {"type":"inv.item.registered","version":1,"description":"Um item entrou no catálogo do tenant, com descrição, unidade e SKU opcional."},
     {"type":"inv.item.updated","version":1,"description":"Mudou fato do item: descrição, unidade, SKU — ou ele voltou do arquivo (reativar não tem fato próprio)."},
     {"type":"inv.item.archived","version":1,"description":"O item foi arquivado — a ação destrutiva deste módulo. O livro dele continua inteiro; item arquivado não movimenta."},
     {"type":"inv.movement.registered","version":1,"description":"Uma linha entrou no livro: entrada, saída ou ajuste com razão, com o item pelo nome e o saldo resultante."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. Ver o comentário acima e a spec do módulo.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Oito módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.7 O MÓDULO `quote` NO CATÁLOGO DA STORE — o 9º cartão
-- Transcrito de packages/quotes/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⭐ **Domain `crm`, capacidades *Propostas* E *Orçamentos*** — o MESMO
-- artefato com os dois nomes do mercado (a agência propõe, a oficina orça).
-- *Pipeline* NÃO é declarada: é o Módulo 10.
--
-- ⭐ **`events_consumes` é VAZIO**, e é Lei 7: aceite não é fato financeiro —
-- virar título no `ar` exigiria decisão de FATURAMENTO (vencimento, parcelas)
-- que a proposta não carrega. Ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'quote',
  'Propostas',
  '0.1.0',
  'Propostas e orçamentos com itens em texto livre e validade opcional. Aceite e recusa são atos registrados — quem e quando — e renegociar é documento novo.',
  'domain', 'crm',
  '[
     {"key":"proposals","canonicalName":"Propostas"},
     {"key":"quotes","canonicalName":"Orçamentos"}
   ]'::jsonb,
  '[
     {"key":"quote.proposal.manage","moduleId":"quote","description":"Montar rascunhos, editar itens, enviar a proposta e registrar expiração."},
     {"key":"quote.proposal.decide","moduleId":"quote","description":"Registrar o aceite ou a recusa da contraparte — o ato fica carimbado com quem e quando."},
     {"key":"quote.proposal.cancel","moduleId":"quote","description":"Retirar a proposta da mesa — a ação destrutiva deste módulo."}
   ]'::jsonb,
  '[
     {"type":"quote.proposal.registered","version":1,"description":"Uma proposta nasceu (rascunho), com itens em texto livre e contraparte neutra."},
     {"type":"quote.proposal.updated","version":1,"description":"Mudou fato do rascunho: itens, total, moeda, validade ou contraparte."},
     {"type":"quote.proposal.sent","version":1,"description":"A proposta foi posta na mesa. Daqui em diante o conteúdo não muda mais."},
     {"type":"quote.proposal.accepted","version":1,"description":"A contraparte aceitou — registrado por quem tem fé pública do ato, com quem e quando."},
     {"type":"quote.proposal.declined","version":1,"description":"A contraparte recusou. Terminal: renegociar é documento novo."},
     {"type":"quote.proposal.expired","version":1,"description":"A validade venceu e alguém registrou o calendário. Só existe com validade vencida."},
     {"type":"quote.proposal.cancelled","version":1,"description":"A proposta foi retirada da mesa — a ação destrutiva deste módulo. Nunca DELETE."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. Ver o comentário acima e a spec do módulo.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Nove módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.8 O MÓDULO `deal` NO CATÁLOGO DA STORE — o 10º cartão
-- Transcrito de packages/deals/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⭐ **Domain `crm`, capacidade *Pipeline*** — "funil" e "oportunidade" não
-- existem na Taxonomia; a tela fala funil, o mapa fala Pipeline.
--
-- ⭐ A Lei das Etapas, segunda aplicação: os estágios são dado do tenant, o
-- movimento é LIVRE com trilha imutável, e `won`/`lost` são atos terminais
-- com razão. O vínculo com o crm é ID SOLTO + nome carimbado — nunca FK.
--
-- ⭐ **`events_consumes` é VAZIO** (Lei 7): fechar negociação pelo aceite da
-- proposta exigiria o vínculo proposta↔negociação, que não existe. Spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'deal',
  'Funil Comercial',
  '0.1.0',
  'O funil que o tenant desenha: estágios livres, movimento livre com trilha imutável, e ganho e perda como atos com razão registrada.',
  'domain', 'crm',
  '[
     {"key":"pipeline","canonicalName":"Pipeline"}
   ]'::jsonb,
  '[
     {"key":"deal.funnel.design","moduleId":"deal","description":"Desenhar funis: criar estágios, nomeá-los e ordená-los."},
     {"key":"deal.opportunity.manage","moduleId":"deal","description":"Abrir negociações e movê-las livremente pelos estágios — toda mudança vira trilha."},
     {"key":"deal.opportunity.decide","moduleId":"deal","description":"Decidir o desfecho: ganhar ou perder. Perder exige a razão."}
   ]'::jsonb,
  '[
     {"type":"deal.opportunity.opened","version":1,"description":"Uma negociação nasceu num funil do tenant, no estágio inicial — pelo nome."},
     {"type":"deal.opportunity.moved","version":1,"description":"A negociação mudou de estágio — em qualquer direção, com de-onde e para-onde pelo nome."},
     {"type":"deal.opportunity.updated","version":1,"description":"Mudou fato da negociação: valor, moeda, probabilidade, expectativa ou vínculo."},
     {"type":"deal.opportunity.won","version":1,"description":"A negociação foi GANHA — ato de quem decide, com nota opcional."},
     {"type":"deal.opportunity.lost","version":1,"description":"A negociação foi PERDIDA — ato de quem decide, com a razão OBRIGATÓRIA. Terminal."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. Ver o comentário acima e a spec do módulo.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Dez módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.9 O MÓDULO `evt` NO CATÁLOGO DA STORE — o 11º cartão
-- Transcrito de packages/event-management/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⭐ **`module_id` é `evt`, e NÃO `event`/`events`**: "evento" já é o
-- vocabulário do coração da plataforma (core.event_outbox, emit_event,
-- EventEnvelope). Sol Único — o argumento que derrubou `os` no Módulo 7.
--
-- ⭐ **Domain `marketing`, capacidade *Eventos*** — o evento UNIVERSAL. O
-- vertical 🎪 Eventos (Events OS™) é o OFÍCIO (ingresso, credenciamento,
-- line-up) e NÃO entrou: o perigo da pedreira events-os é importar promessa.
--
-- ⭐ **`events_consumes` é VAZIO** (Lei 7).
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'evt',
  'Eventos',
  '0.1.0',
  'O evento universal do tenant: nome, quando, onde em texto livre, inscrições com contato neutro, presença como ato registrado e lotação honesta.',
  'domain', 'marketing',
  '[
     {"key":"events","canonicalName":"Eventos"}
   ]'::jsonb,
  '[
     {"key":"evt.event.manage","moduleId":"evt","description":"Criar e editar eventos — nome, quando, onde, capacidade."},
     {"key":"evt.event.decide","moduleId":"evt","description":"Decidir sobre o evento: publicar (abrir a lista), registrar como realizado e cancelar."},
     {"key":"evt.registration.manage","moduleId":"evt","description":"Inscrever, confirmar, cancelar inscrições e registrar presença — a presença carimba quem e quando."}
   ]'::jsonb,
  '[
     {"type":"evt.event.registered","version":1,"description":"Um evento nasceu (rascunho), com nome, quando e onde em texto livre."},
     {"type":"evt.event.updated","version":1,"description":"Mudou fato do evento: nome, datas, local ou capacidade."},
     {"type":"evt.event.published","version":1,"description":"O evento foi publicado — a lista de inscrições abriu. Não volta a rascunho."},
     {"type":"evt.event.held","version":1,"description":"O evento foi registrado como REALIZADO — só depois de ter começado."},
     {"type":"evt.event.cancelled","version":1,"description":"O evento foi cancelado — o fato que todo inscrito pode escutar. Nunca DELETE."},
     {"type":"evt.registration.registered","version":1,"description":"Alguém se inscreveu — só em evento publicado, e a lotação recusa além do teto."},
     {"type":"evt.registration.confirmed","version":1,"description":"A inscrição foi confirmada."},
     {"type":"evt.registration.cancelled","version":1,"description":"A inscrição foi cancelada — a linha fica: a desistência é história do evento."},
     {"type":"evt.registration.attended","version":1,"description":"A presença foi registrada — ATO carimbado com quem e quando, pelo servidor."}
   ]'::jsonb,
  -- Vazio, e é Lei 7. Ver o comentário acima e a spec do módulo.
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Onze módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.10 O MÓDULO `dun` NO CATÁLOGO DA STORE — o 12º cartão
-- Transcrito de packages/dunning/src/manifest.ts.
-- -----------------------------------------------------------------------------
-- ⭐ **Domain `finance`, capacidade *Cobrança*** — a régua cobra O CLIENTE DO
-- TENANT; `billing` cobra o tenant. Duas "cobranças", donos diferentes.
--
-- ⭐⭐ **`events_consumes` NÃO É VAZIO — e o handler EXISTE** (Lei 7 do jeito
-- certo): `dun-title.ts` + `dun.record_external_receivable()` + inscrição na
-- composição + teste triangular. A régua só faz sentido escutando.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'dun',
  'Régua de Cobrança',
  '0.1.0',
  'A régua que o tenant desenha para os títulos vencidos: diz o que fazer, registra que foi feito — quem, quando, por qual canal. Não envia nada; a baixa na origem tira o título sozinho.',
  'domain', 'finance',
  '[
     {"key":"collections","canonicalName":"Cobrança"}
   ]'::jsonb,
  '[
     {"key":"dun.ruler.design","moduleId":"dun","description":"Desenhar a régua: passos ordenados, dias após o vencimento, canal em texto livre."},
     {"key":"dun.step.execute","moduleId":"dun","description":"Executar um passo da régua sobre um título vencido — o ato fica registrado com quem, quando e por qual canal."}
   ]'::jsonb,
  '[
     {"type":"dun.title.entered","version":1,"description":"Um título vencido e em aberto entrou na régua — decidido pelo mesmo fato que o trouxe, ou pelo primeiro passo executado."},
     {"type":"dun.title.left","version":1,"description":"O título saiu da régua — baixa, cancelamento ou vencimento renegociado NA ORIGEM. A régua não segura ninguém."},
     {"type":"dun.step.executed","version":1,"description":"Um passo foi executado: título, passo pelo nome, canal, dias de atraso e anotação. É o fato que uma integração de envio escutaria."}
   ]'::jsonb,
  -- ⭐ NÃO vazio — os três têm handler construído. Ver a spec §3.
  '[
     {"type":"ar.receivable.registered","version":1,"description":"Um título a receber nasceu — se vencido e em aberto, entra na régua."},
     {"type":"ar.receivable.updated","version":1,"description":"O título mudou (recebimento, vencimento, valor) — a régua reprojetará e decide entrada/saída."},
     {"type":"ar.receivable.cancelled","version":1,"description":"O título foi cancelado na origem — sai da régua sozinho."}
   ]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- -----------------------------------------------------------------------------
-- 4.11 O MÓDULO `ctr` NO CATÁLOGO DA STORE — o 13º cartão
-- -----------------------------------------------------------------------------
-- Contratos (Domain legal — capacidade *Contratos*). Os termos originais
-- congelam em vigor; o VIGENTE é calculado dos atos imutáveis (reajuste com
-- índice em texto livre, renovação que estende o MESMO contrato). `consumes`
-- vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'ctr',
  'Contratos',
  '0.1.0',
  'A carteira de contratos do tenant: vigência, valor e partes com os termos originais congelados em vigor — o vigente é calculado dos atos registrados (reajuste, renovação). Rescindir exige razão; encerrar exige calendário.',
  'domain', 'legal',
  '[
     {"key":"contracts","canonicalName":"Contratos"}
   ]'::jsonb,
  '[
     {"key":"ctr.contract.manage","moduleId":"ctr","description":"Registrar e editar contratos em rascunho, e pô-los em vigor."},
     {"key":"ctr.contract.amend","moduleId":"ctr","description":"Registrar reajuste (índice em texto livre, valor novo) e renovação (estender a vigência) — atos imutáveis no mesmo contrato."},
     {"key":"ctr.contract.decide","moduleId":"ctr","description":"Encerrar por prazo vencido ou rescindir com razão — o desfecho é terminal e carimbado pelo servidor."}
   ]'::jsonb,
  '[
     {"type":"ctr.contract.registered","version":1,"description":"Um contrato nasceu (rascunho), com as partes pelo nome."},
     {"type":"ctr.contract.updated","version":1,"description":"O rascunho mudou no que é FATO: termos, partes, vigência."},
     {"type":"ctr.contract.activated","version":1,"description":"O contrato entrou em vigor — a partir daqui os termos mudam só por ato."},
     {"type":"ctr.contract.adjusted","version":1,"description":"Reajuste registrado: índice em texto livre, valor anterior e novo. O sistema registra; quem calcula é gente."},
     {"type":"ctr.contract.renewed","version":1,"description":"A vigência foi estendida por renovação — o MESMO contrato, prazo novo."},
     {"type":"ctr.contract.ended","version":1,"description":"Fim natural: a vigência venceu e o encerramento foi registrado."},
     {"type":"ctr.contract.terminated","version":1,"description":"Rescisão: ato com razão obrigatória, carimbado pelo servidor."},
     {"type":"ctr.contract.cancelled","version":1,"description":"O rascunho foi cancelado antes de entrar em vigor."}
   ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- -----------------------------------------------------------------------------
-- 4.12 O MÓDULO `cash` NO CATÁLOGO DA STORE — o 14º cartão
-- -----------------------------------------------------------------------------
-- Fluxo de Caixa (Domain finance — capacidade *Fluxo de caixa*). O livro do
-- inv no dinheiro: lançamentos imutáveis, categoria do tenant, saldo em view,
-- CAIXA realizado (o futuro é recusado — previsão é Orçamento). `consumes`
-- vazio pela decisão contra a DUPLA CONTAGEM — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'cash',
  'Fluxo de Caixa',
  '0.1.0',
  'O livro-caixa do tenant: lançamentos imutáveis (entrada, saída, ajuste com razão), categoria desenhada pelo tenant e saldo sempre calculado. Registra o realizado — previsão é Orçamento.',
  'domain', 'finance',
  '[
     {"key":"cash-flow","canonicalName":"Fluxo de caixa"}
   ]'::jsonb,
  '[
     {"key":"cash.entry.register","moduleId":"cash","description":"Lançar entradas e saídas no livro-caixa — o sinal vem do tipo, nunca do operador."},
     {"key":"cash.entry.adjust","moduleId":"cash","description":"Lançar AJUSTE com razão obrigatória — o movimento que reescreve a conta."},
     {"key":"cash.category.manage","moduleId":"cash","description":"Desenhar as categorias do tenant: criar, renomear, arquivar e reativar."}
   ]'::jsonb,
  '[
     {"type":"cash.entry.registered","version":1,"description":"Um lançamento entrou no livro — com o sinal do tipo, a categoria pelo nome e o dia em que o dinheiro moveu."},
     {"type":"cash.category.registered","version":1,"description":"Uma categoria nasceu no desenho do tenant."},
     {"type":"cash.category.updated","version":1,"description":"A categoria mudou (nome, ou reativação — que não é fato novo, é a mesma)."},
     {"type":"cash.category.archived","version":1,"description":"A categoria saiu de uso — o livro dela continua inteiro."}
   ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- -----------------------------------------------------------------------------
-- 4.13 O MÓDULO `care` NO CATÁLOGO DA STORE — o 15º cartão
-- -----------------------------------------------------------------------------
-- Atendimento (Domain cx — capacidade *SAC*). O caso tem identidade pelo
-- PEDIDO: reabre de resolved (o mesmo caso), closed é terminal. Categoria e
-- prioridade são dado do tenant; a conversa é imutável. `consumes` vazio por
-- decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'care',
  'Atendimento',
  '0.1.0',
  'O balcão de atendimento do tenant: casos com solicitante neutro, categoria e prioridade desenhadas pelo tenant, conversa imutável, resolução carimbada — e reabertura honesta: o caso que volta é o mesmo caso.',
  'domain', 'cx',
  '[
     {"key":"service-desk","canonicalName":"SAC"}
   ]'::jsonb,
  '[
     {"key":"care.ticket.manage","moduleId":"care","description":"Abrir, editar, atribuir, mover e reabrir casos; registrar interações."},
     {"key":"care.ticket.resolve","moduleId":"care","description":"Resolver e fechar casos — o ato fica carimbado com quem e quando, pelo servidor."},
     {"key":"care.setup.manage","moduleId":"care","description":"Desenhar categorias e prioridades do tenant — nome livre, nunca enum do produto."}
   ]'::jsonb,
  '[
     {"type":"care.ticket.opened","version":1,"description":"Um caso nasceu — solicitante, classificação pelo nome, prazo se houver."},
     {"type":"care.ticket.updated","version":1,"description":"O caso mudou no que é FATO: assunto, classificação, responsável, prazo, andamento."},
     {"type":"care.ticket.resolved","version":1,"description":"O caso foi dado por resolvido — ato carimbado, com a nota de resolução."},
     {"type":"care.ticket.reopened","version":1,"description":"O MESMO caso voltou: o solicitante disse que não resolveu. O carimbo anterior fica na trilha."},
     {"type":"care.ticket.closed","version":1,"description":"O caso fechou — terminal. Quem volta depois é caso novo."},
     {"type":"care.interaction.recorded","version":1,"description":"Uma interação entrou na conversa — imutável, com canal em texto livre."}
   ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '0.0.x',
  'published'
)
on conflict (module_id) do update set
  name            = excluded.name,
  version         = excluded.version,
  summary         = excluded.summary,
  layer           = excluded.layer,
  domain_key      = excluded.domain_key,
  vertical_key    = excluded.vertical_key,
  capabilities    = excluded.capabilities,
  permissions     = excluded.permissions,
  events_emits    = excluded.events_emits,
  events_consumes = excluded.events_consumes,
  agents          = excluded.agents,
  requires_core   = excluded.requires_core,
  status          = excluded.status,
  updated_at      = now();

-- ⛔ Quinze módulos no catálogo, zero permissão concedida pelo seed.

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
-- 5.1 ⭐ A MÉTRICA DA FORJA — e por que ela existe em TODOS os planos
-- -----------------------------------------------------------------------------
-- `ai-generations-per-month` é a métrica que a IA Base consome (Etapa 14).
--
-- ⛔ **SEM MEDIÇÃO, SEM GERAÇÃO.** `checkLimit()` **nega por omissão**: um par
-- plano/métrica que não existe aqui devolve `no-limit-configured`, e a forja
-- responde com o estado `unmetered` — o botão de gerar nem aparece.
--
-- A consequência é que estas linhas **não são configuração opcional**: sem
-- elas, a geração fica desligada para todo mundo, em silêncio. Por isso há
-- teste de pacote que lê este arquivo e exige as três.
--
-- ⚠️ Lei 7: os números abaixo são ponto de partida técnico, **NÃO
-- VERIFICADOS** contra custo real de operação. Nenhum deles vai a proposta,
-- site ou tabela de preço antes de ser medido. O dossiê do kraken-v2 tem
-- economia unitária medida (78 execuções por R$ 29,57, em 22/07/2026), mas é
-- de OUTRO produto, com outro pipeline — herdar aquele número aqui seria
-- exatamente o que a Lei 7 proíbe.
--
-- ⭐ `free` bloqueia; `starter` bloqueia; `pro` mede e deixa passar. É a mesma
-- política suave do kraken (`lib/quota.ts`: enforcement duro só no gratuito),
-- e a razão é comercial: cortar quem paga no meio de um trabalho é pior do que
-- cobrar o excedente depois.
-- =============================================================================

insert into core.plan_limits (plan_code, metric, limit_value, on_exceed)
values
  ('free',    'ai-generations-per-month', 10,    'block'),
  ('starter', 'ai-generations-per-month', 500,   'block'),
  ('pro',     'ai-generations-per-month', null,  'meter')
on conflict (plan_code, metric) do nothing;

-- =============================================================================
-- FIM.
-- Nenhum tenant. Nenhum usuário. Nenhum nome de cliente. Nenhum segredo.
-- Reaplicável: rodar de novo não muda nada.
-- =============================================================================
