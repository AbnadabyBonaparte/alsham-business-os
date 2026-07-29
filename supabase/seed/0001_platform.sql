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
-- ⭐ **A diferença que este bloco marca:** `events_emits` cheio e
-- `events_consumes` VAZIO — o espelho exato do `marketing`. Com este módulo, o
-- catálogo passa a mostrar o triângulo inteiro: `recon` emite e `marketing`
-- escuta; `ap` emite e `recon` escuta. Nenhum dos três conhece nenhum outro.
--
-- `status = 'published'` com UMA capacidade. As outras 18 do Domain Financeiro
-- não aparecem porque não existem.
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
  -- Vazio, e é Lei 7. Seria fácil declarar que este módulo escuta a baixa do
  -- Módulo 1 e se liquida sozinho — é a integração óbvia, e a primeira que um
  -- cliente pede. Mas o handler não existe, e consumo declarado sem consumidor
  -- faz o Core acordar um módulo que não sabe responder.
  '[]'::jsonb,
  -- Nenhum agente embarcado ainda.
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
