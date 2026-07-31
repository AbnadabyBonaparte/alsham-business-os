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

-- =============================================================================
-- 4.4b ONDA DEZ — completar o Domain Compras (Módulos 43–47, domain_key
-- 'procurement'). Cinco cartões novos, ao lado do `po`. Todos `consumes` vazio.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'vendor',
  'Fornecedores',
  '0.1.0',
  'O cadastro de fornecedores da empresa: nome e segmento em texto livre (vocabulário de cada compra), e o ciclo active ↔ archived — o fornecedor é relação comercial que volta (o DIVERGE do hr, onde o desligamento é terminal). Homologação formal e catálogo do fornecedor ficam de fora.',
  'domain', 'procurement',
  '[
     {"key":"suppliers","canonicalName":"Fornecedores"}
   ]'::jsonb,
  '[
     {"key":"vendor.supplier.manage","moduleId":"vendor","description":"Cadastrar e editar fornecedores (nome e segmento em texto livre)."},
     {"key":"vendor.supplier.decide","moduleId":"vendor","description":"Arquivar ou reativar um fornecedor — a relação comercial que sai e volta."}
   ]'::jsonb,
  '[
     {"type":"vendor.supplier.registered","version":1,"description":"Um fornecedor nasceu no cadastro (sempre ativo)."},
     {"type":"vendor.supplier.updated","version":1,"description":"Mudou o nome ou o segmento do fornecedor."},
     {"type":"vendor.supplier.archived","version":1,"description":"O fornecedor foi arquivado. Continua no banco; nunca DELETE."},
     {"type":"vendor.supplier.reopened","version":1,"description":"O fornecedor arquivado voltou ao cadastro vivo — a mesma relação."}
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

-- ---------------------------------------------------------------------------
-- 4.4c O MÓDULO `rfq` (Cotações) — o 44º cartão. Transcrito do manifesto.
-- ---------------------------------------------------------------------------
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'rfq',
  'Cotações',
  '0.1.0',
  'O pedido de cotação (RFQ): a empresa pergunta ao mercado o que precisa (itens em texto livre) e, ao final, PREMIA um fornecedor vencedor ou cancela sem vencedor. Enviar congela o conteúdo; premiar e cancelar são terminais. O DIVERGE do quote: aqui quem decide é o comprador (awarded), não o cliente. Coleta estruturada de preços por fornecedor fica de fora.',
  'domain', 'procurement',
  '[
     {"key":"quotations","canonicalName":"Cotações"}
   ]'::jsonb,
  '[
     {"key":"rfq.request.manage","moduleId":"rfq","description":"Criar e editar a cotação em rascunho, incluir itens, enviar ao mercado e cancelar."},
     {"key":"rfq.request.award","moduleId":"rfq","description":"Premiar o fornecedor vencedor — a decisão de compra da cotação."}
   ]'::jsonb,
  '[
     {"type":"rfq.request.registered","version":1,"description":"Uma cotação nasceu (sempre em rascunho)."},
     {"type":"rfq.request.opened","version":1,"description":"A cotação foi enviada ao mercado (aberta para cotação) — o conteúdo congelou."},
     {"type":"rfq.request.awarded","version":1,"description":"O comprador premiou um fornecedor vencedor. Terminal."},
     {"type":"rfq.request.cancelled","version":1,"description":"A cotação foi encerrada sem vencedor, com razão. Terminal."}
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

-- ---------------------------------------------------------------------------
-- 4.4d O MÓDULO `recv` (Recebimento) — o 45º cartão. Transcrito do manifesto.
-- ---------------------------------------------------------------------------
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'recv',
  'Recebimento',
  '0.1.0',
  'O livro de recebimentos da empresa: cada recebimento é um ato pontual imutável — o que chegou (texto livre), quanto e quando. Receber a maior é permitido (a sobra é fato, a mesma física do overpay do ar); o módulo não lê o pedido, então não há quantidade pedida para comparar. O vínculo com o pedido é por id solto + referência. Conciliação recebimento→pedido/AP fica de fora.',
  'domain', 'procurement',
  '[
     {"key":"goods-receipt","canonicalName":"Recebimento"}
   ]'::jsonb,
  '[
     {"key":"recv.receipt.record","moduleId":"recv","description":"Registrar um recebimento — o que chegou, quanto e quando."}
   ]'::jsonb,
  '[
     {"type":"recv.receipt.recorded","version":1,"description":"Um recebimento foi registrado. Ato pontual, imutável desde o instante 1."}
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

-- ---------------------------------------------------------------------------
-- 4.4e O MÓDULO `vperf` (Avaliação de Fornecedores) — o 46º cartão.
-- ---------------------------------------------------------------------------
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'vperf',
  'Avaliação de Fornecedores',
  '0.1.0',
  'A avaliação PONTUAL do fornecedor pelo comprador: nota 0–100 obrigatória (a régua do método), parecer em texto livre e a origem em texto livre (recebimento, cotação). Ato imutável, carimbado pelo servidor — diferente da avaliação de desempenho de gente, que pertence a um ciclo. Scorecard estruturado e homologação formal ficam de fora.',
  'domain', 'procurement',
  '[
     {"key":"supplier-appraisals","canonicalName":"Avaliação de fornecedores"}
   ]'::jsonb,
  '[
     {"key":"vperf.appraisal.record","moduleId":"vperf","description":"Registrar avaliações de fornecedor — ato imutável, com nota 0–100 e o avaliador carimbado pelo servidor."}
   ]'::jsonb,
  '[
     {"type":"vperf.appraisal.recorded","version":1,"description":"Uma avaliação de fornecedor foi registrada — fornecedor (id solto + nome), nota e origem no envelope. O parecer não vai no correio."}
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

-- ---------------------------------------------------------------------------
-- 4.4f O MÓDULO `reorder` (Estoque Mínimo) — o 47º cartão. Fecha a Onda Dez.
-- ---------------------------------------------------------------------------
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'reorder',
  'Estoque Mínimo',
  '0.1.0',
  'A configuração do ponto de reabastecimento: produto em texto livre + quantidade mínima, com vínculo solto ao item de estoque. A comparação com o saldo é da tela — este módulo não lê o estoque. Ciclo active ↔ archived — a regra é configuração que volta (o DIVERGE do hr, onde o desligamento é terminal). Lote econômico, lead time e geração de pedido ficam de fora.',
  'domain', 'procurement',
  '[
     {"key":"reorder-rules","canonicalName":"Estoque mínimo"}
   ]'::jsonb,
  '[
     {"key":"reorder.rule.manage","moduleId":"reorder","description":"Cadastrar e editar regras de estoque mínimo (produto e quantidade mínima)."},
     {"key":"reorder.rule.decide","moduleId":"reorder","description":"Arquivar ou reativar uma regra — a configuração que sai e volta."}
   ]'::jsonb,
  '[
     {"type":"reorder.rule.registered","version":1,"description":"Uma regra de estoque mínimo nasceu no cadastro (sempre ativa)."},
     {"type":"reorder.rule.updated","version":1,"description":"Mudou o produto, o vínculo com o item ou a quantidade mínima da regra."},
     {"type":"reorder.rule.archived","version":1,"description":"A regra foi arquivada. Continua no banco; nunca DELETE."},
     {"type":"reorder.rule.reopened","version":1,"description":"A regra arquivada voltou ao cadastro vivo — a mesma configuração."}
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

-- ⛔ Onze módulos de Compras+ no catálogo, zero permissão concedida pelo seed.

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

-- -----------------------------------------------------------------------------
-- 4.14 O MÓDULO `occ` NO CATÁLOGO DA STORE — o 16º cartão
-- -----------------------------------------------------------------------------
-- Ocorrências (Domain operations — capacidade *Ocorrências*). O livro do
-- fato consumado: registro imutável desde o nascimento (a física que diverge
-- do care), tratativa em atos eternos, encerramento com desfecho — terminal.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'occ',
  'Ocorrências',
  '0.1.0',
  'O livro do que aconteceu: registro imutável do fato consumado, gravidade desenhada pelo tenant, tratativa em atos eternos e encerramento com desfecho escrito — terminal.',
  'domain', 'operations',
  '[
     {"key":"incident-log","canonicalName":"Ocorrências"}
   ]'::jsonb,
  '[
     {"key":"occ.occurrence.register","moduleId":"occ","description":"Registrar o fato consumado — o registro nasce imutável."},
     {"key":"occ.occurrence.treat","moduleId":"occ","description":"Registrar tratativas — a cadeia de atos eternos sobre a ocorrência aberta."},
     {"key":"occ.occurrence.close","moduleId":"occ","description":"Encerrar com o desfecho escrito — ato carimbado e terminal."},
     {"key":"occ.setup.manage","moduleId":"occ","description":"Desenhar a régua de gravidade do tenant — nome livre e posição, nunca enum."}
   ]'::jsonb,
  '[
     {"type":"occ.occurrence.registered","version":1,"description":"Um fato foi registrado — relato, local, envolvidos e gravidade pelo nome."},
     {"type":"occ.occurrence.treated","version":1,"description":"Uma tratativa entrou na cadeia — o que foi feito, por quem, quando."},
     {"type":"occ.occurrence.closed","version":1,"description":"A ocorrência foi encerrada — ato carimbado, com o desfecho escrito. Terminal."}
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
-- 4.15 O MÓDULO `mnt` NO CATÁLOGO DA STORE — o 17º cartão
-- -----------------------------------------------------------------------------
-- Manutenção (Domain operations — capacidade *Manutenção*). Corretiva e
-- preventiva (física do domínio); done volta (trabalho tem identidade por
-- serviço); recorrência do tenant com a próxima devida calculada por data.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'mnt',
  'Manutenção',
  '0.1.0',
  'As ordens de manutenção do tenant: corretiva e preventiva, alvo em texto livre, prioridade desenhada pelo tenant, conclusão com relato carimbado — e a preventiva com recorrência e a próxima devida sempre calculada.',
  'domain', 'operations',
  '[
     {"key":"maintenance","canonicalName":"Manutenção"}
   ]'::jsonb,
  '[
     {"key":"mnt.order.manage","moduleId":"mnt","description":"Abrir, editar, atribuir e mover ordens de manutenção."},
     {"key":"mnt.order.complete","moduleId":"mnt","description":"Concluir (com o relato do que foi feito) e cancelar ordens — atos carimbados."},
     {"key":"mnt.setup.manage","moduleId":"mnt","description":"Desenhar a régua de prioridade do tenant — nome livre e posição, nunca enum."}
   ]'::jsonb,
  '[
     {"type":"mnt.order.opened","version":1,"description":"Uma ordem nasceu — corretiva ou preventiva, com o alvo em texto."},
     {"type":"mnt.order.updated","version":1,"description":"A ordem mudou no que é FATO: alvo, prioridade, responsável, custo, andamento."},
     {"type":"mnt.order.completed","version":1,"description":"O serviço foi concluído — com o relato do que foi feito, carimbado."},
     {"type":"mnt.order.reopened","version":1,"description":"O MESMO serviço voltou à bancada — a vistoria reprovou o reparo."},
     {"type":"mnt.order.cancelled","version":1,"description":"A ordem foi cancelada — terminal. A falha nova é ordem nova."}
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
-- 4.16 O MÓDULO `pat` NO CATÁLOGO DA STORE — o 18º cartão
-- -----------------------------------------------------------------------------
-- Patrimônio (Domain operations — capacidade *Patrimônio*). A localização
-- vigente é calculada do livro de transferências (nunca coluna); a baixa é
-- terminal com razão escrita. A ponte do mnt (`asset_id`) continua SOLTA.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'pat',
  'Patrimônio',
  '0.1.0',
  'O livro de bens do tenant: etiqueta única, categoria desenhada pelo tenant, localização vigente calculada do livro de transferências — e a baixa terminal, com razão escrita e carimbo do servidor.',
  'domain', 'operations',
  '[
     {"key":"assets","canonicalName":"Patrimônio"}
   ]'::jsonb,
  '[
     {"key":"pat.asset.manage","moduleId":"pat","description":"Cadastrar e editar bens, e registrar transferências de localização."},
     {"key":"pat.asset.decide","moduleId":"pat","description":"Baixar bens (alienação, perda, sucata) — ato terminal, com razão escrita."},
     {"key":"pat.setup.manage","moduleId":"pat","description":"Desenhar as categorias de bens do tenant — nome livre, nunca enum."}
   ]'::jsonb,
  '[
     {"type":"pat.asset.registered","version":1,"description":"Um bem entrou no livro — com etiqueta, categoria e onde nasceu."},
     {"type":"pat.asset.updated","version":1,"description":"O bem mudou no que é FATO: nome, etiqueta, categoria, valor, data."},
     {"type":"pat.asset.transferred","version":1,"description":"O bem mudou de lugar — de onde (carimbado pelo servidor) para onde."},
     {"type":"pat.asset.retired","version":1,"description":"O bem foi baixado — terminal, com a razão escrita. O que volta é aquisição nova."}
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
-- 4.17 O MÓDULO `chk` NO CATÁLOGO DA STORE — o 19º cartão
-- -----------------------------------------------------------------------------
-- Checklists (Domain operations — capacidade *Checklist*). O modelo é
-- desenho do tenant; executar CONGELA o modelo por cópia (gatilho); a
-- resposta é ato imutável; concluir exige tudo respondido.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'chk',
  'Checklists',
  '0.1.0',
  'Os checklists do tenant: o modelo é desenho livre (itens ordenados, texto livre); executar congela o modelo daquele momento; cada resposta é ato carimbado que não se rasura — e concluir exige tudo respondido.',
  'domain', 'operations',
  '[
     {"key":"checklists","canonicalName":"Checklist"}
   ]'::jsonb,
  '[
     {"key":"chk.run.execute","moduleId":"chk","description":"Abrir execuções, responder itens (ato carimbado), concluir e abandonar com razão."},
     {"key":"chk.setup.manage","moduleId":"chk","description":"Desenhar os modelos de checklist do tenant — itens ordenados, texto livre."}
   ]'::jsonb,
  '[
     {"type":"chk.run.started","version":1,"description":"Uma execução abriu — com o modelo congelado daquele momento."},
     {"type":"chk.run.completed","version":1,"description":"A execução foi concluída — tudo respondido, com as contagens no envelope. Terminal."},
     {"type":"chk.run.abandoned","version":1,"description":"A execução foi abandonada — com a razão escrita. A inspeção refeita é outra inspeção."}
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
-- 4.18 O MÓDULO `spc` NO CATÁLOGO DA STORE — o 20º cartão
-- -----------------------------------------------------------------------------
-- Reserva de Espaços (Domain operations — Facilities). O conflito é recusado
-- pelo BANCO (exclusion constraint, parcial: a cancelada libera sozinha); o
-- passado é permitido — fato consumado; cancelar exige razão.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'spc',
  'Reserva de Espaços',
  '0.1.0',
  'Os espaços do tenant e a agenda deles: período meio-aberto, conflito recusado pelo BANCO (exclusion constraint — a cancelada libera sozinha), o passado permitido como fato consumado e o cancelamento com razão escrita.',
  'domain', 'operations',
  '[
     {"key":"space-booking","canonicalName":"Reserva de espaços"}
   ]'::jsonb,
  '[
     {"key":"spc.reservation.manage","moduleId":"spc","description":"Reservar períodos, remarcar e cancelar com razão escrita."},
     {"key":"spc.setup.manage","moduleId":"spc","description":"Desenhar os espaços do tenant — nome livre, capacidade opcional; arquivado volta."}
   ]'::jsonb,
  '[
     {"type":"spc.reservation.booked","version":1,"description":"Um período foi prometido — espaço pelo nome, início e fim no envelope."},
     {"type":"spc.reservation.updated","version":1,"description":"A reserva mudou no que é FATO: período, finalidade, espaço."},
     {"type":"spc.reservation.cancelled","version":1,"description":"A reserva foi cancelada — terminal, com a razão escrita. O período ficou livre sozinho."}
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
-- 4.19 O MÓDULO `vis` NO CATÁLOGO DA STORE — o 21º cartão
-- -----------------------------------------------------------------------------
-- Visitas (Domain operations — a portaria é operação; a Visitas do CRM é a
-- do vendedor). Entrada e saída carimbadas pelo servidor; o registro não se
-- rasura (correção é registro novo); o documento não passeia pelo correio.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'vis',
  'Visitas',
  '0.1.0',
  'O livro da portaria: visitante neutro, destino em texto livre, entrada e saída carimbadas pelo servidor, agendamento opcional antes — e o registro que não se rasura: corrigir é registrar de novo, apontando o errado.',
  'domain', 'operations',
  '[
     {"key":"visitor-log","canonicalName":"Visitas"}
   ]'::jsonb,
  '[
     {"key":"vis.visit.register","moduleId":"vis","description":"Operar a cancela: registrar entrada (walk-in), saída e o não-comparecimento."},
     {"key":"vis.visit.schedule","moduleId":"vis","description":"Agendar visitas e desmarcá-las com razão escrita."}
   ]'::jsonb,
  '[
     {"type":"vis.visit.scheduled","version":1,"description":"Uma visita foi agendada — nome e destino no envelope; o documento fica na portaria."},
     {"type":"vis.visit.arrived","version":1,"description":"O visitante entrou — carimbo do servidor no ato."},
     {"type":"vis.visit.departed","version":1,"description":"O visitante saiu — o segundo carimbo fecha a passagem. Terminal."},
     {"type":"vis.visit.missed","version":1,"description":"O agendado não veio — observação da cancela. Terminal."},
     {"type":"vis.visit.cancelled","version":1,"description":"O agendamento foi desmarcado — com a razão escrita. Terminal."}
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
-- 4.20 O MÓDULO `lead` NO CATÁLOGO DA STORE — o 22º cartão
-- -----------------------------------------------------------------------------
-- Leads (Domain crm — capacidade *Leads*). A fila de entrada: origem TEXTO
-- LIVRE, ciclo curto com desfechos terminais (o lead é a manifestação de
-- interesse — quem volta é lead novo), vínculos SOLTOS carimbados pela tela.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'lead',
  'Leads',
  '0.1.0',
  'A fila de entrada do comercial: origem em TEXTO LIVRE (o dado que a fila existe para guardar), ciclo curto com a volta à fila permitida, desfechos terminais com carimbo — e o vínculo SOLTO com a contraparte e o negócio de quem qualificou.',
  'domain', 'crm',
  '[
     {"key":"leads","canonicalName":"Leads"}
   ]'::jsonb,
  '[
     {"key":"lead.lead.manage","moduleId":"lead","description":"Registrar leads, atender, devolver à fila e atribuir responsável."},
     {"key":"lead.lead.decide","moduleId":"lead","description":"Qualificar (carimbando os vínculos soltos) e descartar com razão — atos terminais."}
   ]'::jsonb,
  '[
     {"type":"lead.lead.created","version":1,"description":"Um interesse entrou na fila — nome, origem e interesse no envelope; o contato fica."},
     {"type":"lead.lead.updated","version":1,"description":"O lead mudou no que é FATO: atendimento, devolução à fila, responsável, origem."},
     {"type":"lead.lead.qualified","version":1,"description":"Qualificado — terminal, com os vínculos soltos carimbados (contraparte, negócio)."},
     {"type":"lead.lead.discarded","version":1,"description":"Descartado — terminal, com a razão escrita. Quem volta é lead novo."}
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
-- 4.21 O MÓDULO `goal` NO CATÁLOGO DA STORE — o 23º cartão
-- -----------------------------------------------------------------------------
-- Metas (Domain bi — capacidade *Metas*). O alvo congela na ativação; o
-- progresso é o último check-in (view, nunca coluna); bater ou perder é
-- decisão de gente com número na mesa; os fins são terminais.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'goal',
  'Metas',
  '0.1.0',
  'A ambição declarada do tenant: métrica em texto livre, alvo opcional que congela na ativação, check-ins como atos imutáveis — e o progresso sempre como o último check-in, calculado. Bater ou perder é decisão de gente, carimbada.',
  'domain', 'bi',
  '[
     {"key":"goals","canonicalName":"Metas"}
   ]'::jsonb,
  '[
     {"key":"goal.goal.manage","moduleId":"goal","description":"Declarar metas, editar o rascunho, ativar e atribuir dono."},
     {"key":"goal.goal.report","moduleId":"goal","description":"Registrar check-ins — o número na mesa, ato carimbado e imutável."},
     {"key":"goal.goal.decide","moduleId":"goal","description":"Fechar a época: batida, perdida (com check-in na mesa) ou cancelada com razão."}
   ]'::jsonb,
  '[
     {"type":"goal.goal.opened","version":1,"description":"Uma ambição foi declarada — no rascunho, ainda sem correr."},
     {"type":"goal.goal.activated","version":1,"description":"A meta passou a correr — alvo, métrica e período congelaram."},
     {"type":"goal.goal.updated","version":1,"description":"A meta mudou no que segue vivo: título, dono, descrição."},
     {"type":"goal.goal.reported","version":1,"description":"Um check-in entrou no livro — o número, a nota e o carimbo."},
     {"type":"goal.goal.achieved","version":1,"description":"A época fechou BATIDA — decisão de gente, com número na mesa. Terminal."},
     {"type":"goal.goal.missed","version":1,"description":"A época fechou PERDIDA — decisão de gente, com número na mesa. Terminal."},
     {"type":"goal.goal.cancelled","version":1,"description":"A ambição foi desistida — com a razão escrita. Terminal."}
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
-- 4.22 O MÓDULO `comm` NO CATÁLOGO DA STORE — o 24º cartão
-- -----------------------------------------------------------------------------
-- Comunicados (Domain hr — comunicação interna; o vertical Condomínios
-- nomeia o recorte). Publicar congela a palavra dada; corrigir é comunicado
-- novo; a ciência é ato próprio, único e eterno; arquivado é terminal.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'comm',
  'Comunicados',
  '0.1.0',
  'O mural oficial do tenant: publicar congela a palavra dada; corrigir é comunicado novo referenciando o antigo; a ciência é ato próprio, único e eterno — e a cobertura conta quem leu enquanto a palavra esteve de pé.',
  'domain', 'hr',
  '[
     {"key":"notices","canonicalName":"Comunicados"}
   ]'::jsonb,
  '[
     {"key":"comm.notice.manage","moduleId":"comm","description":"Redigir rascunhos, publicar (dar a palavra) e arquivar comunicados."},
     {"key":"comm.notice.ack","moduleId":"comm","description":"Dar a PRÓPRIA ciência em comunicado publicado — ato único, carimbado, que não se retira."}
   ]'::jsonb,
  '[
     {"type":"comm.notice.drafted","version":1,"description":"Um comunicado nasceu no rascunho — ainda sem dar a palavra."},
     {"type":"comm.notice.published","version":1,"description":"A palavra foi dada — título e audiência no envelope; o corpo mora no mural."},
     {"type":"comm.notice.archived","version":1,"description":"Saiu do mural — a história e as ciências ficam. Terminal."},
     {"type":"comm.notice.acked","version":1,"description":"Um membro deu ciência — ato próprio, único, carimbado."}
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

-- =============================================================================
-- 4.23 O MÓDULO `edcal` NO CATÁLOGO DA STORE — o 25º cartão
-- -----------------------------------------------------------------------------
-- Calendário Editorial (Domain marketing — capacidade *Calendário*, a
-- leitura editorial). Canal é dado do tenant; o fluxo é desenho do tenant
-- (Lei das Etapas, 4ª aplicação); a pauta carrega o par de datas — a
-- planejada (plano) e a real (carimbo do servidor); os dois fins terminais.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'edcal',
  'Calendário Editorial',
  '0.1.0',
  'O calendário da produção de conteúdo: canal como dado do tenant, fluxo editorial como desenho do tenant (Lei das Etapas), a pauta com o par de datas — planejada × real — e dois fins terminais: publicada (ato registrado, data do servidor) ou descartada (com razão).',
  'domain', 'marketing',
  '[
     {"key":"editorial-calendar","canonicalName":"Calendário"}
   ]'::jsonb,
  '[
     {"key":"edcal.design.manage","moduleId":"edcal","description":"Desenhar o calendário do tenant: canais (criar, arquivar, devolver) e etapas do fluxo editorial."},
     {"key":"edcal.piece.manage","moduleId":"edcal","description":"Planejar pautas, editar e reagendar o plano, e mover a pauta pelo fluxo (com trilha)."},
     {"key":"edcal.piece.decide","moduleId":"edcal","description":"Registrar o fim da pauta: publicada (a data real é do servidor) ou descartada (com razão). Terminal."}
   ]'::jsonb,
  '[
     {"type":"edcal.piece.planned","version":1,"description":"Uma pauta nasceu no calendário — canal, etapa e data planejada no envelope."},
     {"type":"edcal.piece.moved","version":1,"description":"A pauta mudou de etapa no fluxo do tenant — de/para pelo NOME carimbado."},
     {"type":"edcal.piece.published","version":1,"description":"O ATO de ter ido ao ar foi registrado — a data real ao lado da planejada. Terminal."},
     {"type":"edcal.piece.dropped","version":1,"description":"A pauta morreu, com a razão escrita. Terminal."}
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

-- =============================================================================
-- 4.24 O MÓDULO `media` NO CATÁLOGO DA STORE — o 26º cartão
-- -----------------------------------------------------------------------------
-- Biblioteca de Mídia (Domain marketing — capacidade *Mídia*). CATÁLOGO,
-- não cofre: o ativo diz onde a obra vive (texto livre — Storage do Core
-- não construído); o acervo volta do arquivo (o DIVERGE assinado do pat);
-- o uso é livro imutável com vínculo solto.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'media',
  'Biblioteca de Mídia',
  '0.1.0',
  'O catálogo do acervo de mídia: cada ativo é um registro que diz onde a obra vive (texto livre — catálogo, não cofre), com tipo livre e etiquetas do tenant; o acervo volta do arquivo; e o uso é livro imutável, carimbado, com vínculo solto.',
  'domain', 'marketing',
  '[
     {"key":"media-library","canonicalName":"Mídia"}
   ]'::jsonb,
  '[
     {"key":"media.asset.manage","moduleId":"media","description":"Catalogar ativos, editar o registro, etiquetar, arquivar e devolver ao acervo."},
     {"key":"media.usage.record","moduleId":"media","description":"Registrar um USO do ativo — ato imutável, carimbado pelo servidor, com vínculo solto opcional."}
   ]'::jsonb,
  '[
     {"type":"media.asset.cataloged","version":1,"description":"Uma obra entrou no acervo — título, tipo e o onde-vive no envelope."},
     {"type":"media.asset.archived","version":1,"description":"A obra saiu do acervo vivo — o catálogo e o livro de usos ficam."},
     {"type":"media.asset.restored","version":1,"description":"A obra voltou ao acervo — a MESMA obra, com a história inteira (o DIVERGE do pat)."},
     {"type":"media.usage.recorded","version":1,"description":"Um uso foi registrado no livro — em quê, quando e por quem, com vínculo solto."}
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

-- =============================================================================
-- 4.25 O MÓDULO `nps` NO CATÁLOGO DA STORE — o 27º cartão
-- -----------------------------------------------------------------------------
-- Pesquisas (Domain cx — capacidade *Pesquisas NPS/CSAT*). A régua 0-10 é
-- física do método (CHECK argumentado); o placar é view calculada do
-- livro; abrir congela a pergunta; closed é terminal (o DIVERGE assinado
-- do care); anon não recebe nada — o link público é integração futura.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'nps',
  'Pesquisas',
  '0.1.0',
  'A voz do cliente em rodadas de medição: a pergunta é do tenant e a régua 0–10 é do método; cada resposta é ato imutável no livro; o placar (%promotores − %detratores) é sempre calculado, nunca guardado; e a rodada fechada não reabre — a que volta é pesquisa nova.',
  'domain', 'cx',
  '[
     {"key":"surveys","canonicalName":"Pesquisas NPS/CSAT"}
   ]'::jsonb,
  '[
     {"key":"nps.survey.manage","moduleId":"nps","description":"Redigir rodadas, abrir a coleta (congela a pergunta) e encerrar a medição. Terminal."},
     {"key":"nps.response.record","moduleId":"nps","description":"Registrar uma resposta na rodada ABERTA — ato imutável, nota 0–10, carimbado pelo servidor."}
   ]'::jsonb,
  '[
     {"type":"nps.survey.drafted","version":1,"description":"Uma rodada nasceu no rascunho — a pergunta ainda é plano."},
     {"type":"nps.survey.opened","version":1,"description":"A coleta abriu — a pergunta congelou."},
     {"type":"nps.survey.closed","version":1,"description":"A medição encerrou — o placar está lido. Terminal."},
     {"type":"nps.response.recorded","version":1,"description":"Uma voz entrou no livro — a NOTA no envelope; comentário e respondente ficam em casa."}
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

-- =============================================================================
-- 4.26 O MÓDULO `cc` NO CATÁLOGO DA STORE — o 28º cartão
-- -----------------------------------------------------------------------------
-- Centros de Custo & Rateio (Domain finance — o primeiro da Missão Sete, o
-- Bloco Financeiro). Centro é dado do tenant (volta do arquivo); a regra
-- fecha 100% ao ativar (física); a execução é ato de gente que gera
-- lançamentos imutáveis, com a origem por id solto + nome carimbado.
-- `consumes` vazio e honesto — quem executa é gente.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'cc',
  'Centros de Custo & Rateio',
  '0.1.0',
  'Os centros de custo do tenant (que voltam do arquivo), as regras de rateio que fecham 100% ao ativar, e a execução como ato de gente: lançamentos imutáveis, um por centro, sem perder centavo — com a origem por id solto e nome carimbado.',
  'domain', 'finance',
  '[
     {"key":"cost-centers","canonicalName":"Centros de custo"},
     {"key":"cost-allocation","canonicalName":"Rateio"}
   ]'::jsonb,
  '[
     {"key":"cc.center.manage","moduleId":"cc","description":"Cadastrar centros de custo, arquivar e devolver ao ativo."},
     {"key":"cc.rule.design","moduleId":"cc","description":"Desenhar as regras de rateio: centros e percentuais; ativar (exige 100%) e arquivar."},
     {"key":"cc.rateio.execute","moduleId":"cc","description":"Executar uma regra ativa sobre um valor, gerando os lançamentos de rateio (ato de gente)."}
   ]'::jsonb,
  '[
     {"type":"cc.center.registered","version":1,"description":"Um centro de custo entrou no cadastro."},
     {"type":"cc.center.archived","version":1,"description":"Um centro saiu de uso — a história e as execuções ficam."},
     {"type":"cc.rule.activated","version":1,"description":"Uma regra fechou 100% e passou a ratear."},
     {"type":"cc.rateio.executed","version":1,"description":"Um rateio foi executado — a regra, a origem pelo nome e o total no envelope; os valores por centro ficam no livro."}
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

-- ⛔ Vinte e oito módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.27 O MÓDULO `bud` NO CATÁLOGO DA STORE — o 29º cartão
-- -----------------------------------------------------------------------------
-- Orçamentos (Domain finance — o segundo da Missão Sete). O teto por categoria
-- e período; ativar CONGELA a trave (categoria, período, teto — a física do
-- goal no dinheiro); o realizado é a soma do livro do cash — calculado, nunca
-- coluna. ⭐ `consumes` NÃO é vazio: escuta `cash.entry.registered` com handler
-- construído (realized.ts) — esta onda EXIGE redeploy do apps/api.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'bud',
  'Orçamentos',
  '0.1.0',
  'O teto de gasto por categoria e período. Ativar congela a trave (categoria, período, teto); o realizado é a soma do livro do Fluxo de Caixa que casa a categoria — calculado, nunca digitado. O período fechado é terminal.',
  'domain', 'finance',
  '[
     {"key":"budgeting","canonicalName":"Orçamento"}
   ]'::jsonb,
  '[
     {"key":"bud.budget.manage","moduleId":"bud","description":"Criar, editar e ativar orçamentos. Ativar congela a trave — categoria, período e teto param de mudar."},
     {"key":"bud.budget.close","moduleId":"bud","description":"Fechar o período de um orçamento — ato terminal: o período vira história e o próximo é orçamento novo."}
   ]'::jsonb,
  '[
     {"type":"bud.budget.opened","version":1,"description":"Um orçamento nasceu no rascunho — categoria, período e teto ainda editáveis."},
     {"type":"bud.budget.activated","version":1,"description":"O orçamento foi ativado — a trave congelou; a partir daqui só o nome muda."},
     {"type":"bud.budget.closed","version":1,"description":"O período do orçamento foi fechado — terminal; o próximo período é orçamento novo."}
   ]'::jsonb,
  '[
     {"type":"cash.entry.registered","version":1,"description":"Um lançamento entrou no livro do Fluxo de Caixa — se for desembolso na categoria e no período de um orçamento, entra no realizado."}
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

-- ⛔ Vinte e nove módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.28 O MÓDULO `bank` NO CATÁLOGO DA STORE — o 30º cartão
-- -----------------------------------------------------------------------------
-- Contas Bancárias (Domain finance — o terceiro da Missão Sete). SOL ÚNICO: a
-- conciliação é do recon; aqui é o cadastro das contas (voltam do arquivo) e o
-- livro por conta. O saldo é view e PODE ser negativo (cheque especial); a
-- transferência é atômica. `consumes` vazio e honesto (dupla contagem).
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'bank',
  'Contas Bancárias',
  '0.1.0',
  'As contas do tenant (que voltam do arquivo) e o livro de movimentos por conta, imutável. O saldo é a soma do livro — pode ser negativo (cheque especial). A transferência é atômica: duas pernas, uma transação. Não refaz a conciliação (é do recon).',
  'domain', 'finance',
  '[
     {"key":"bank-accounts","canonicalName":"Bancos"}
   ]'::jsonb,
  '[
     {"key":"bank.account.manage","moduleId":"bank","description":"Cadastrar contas bancárias, arquivar e devolver ao ativo."},
     {"key":"bank.movement.register","moduleId":"bank","description":"Lançar entrada/saída no livro de uma conta e transferir entre contas."},
     {"key":"bank.movement.adjust","moduleId":"bank","description":"Ajustar o saldo de uma conta — ato com razão obrigatória, de quem confere."}
   ]'::jsonb,
  '[
     {"type":"bank.account.registered","version":1,"description":"Uma conta bancária entrou no cadastro."},
     {"type":"bank.account.archived","version":1,"description":"Uma conta saiu de uso — o livro dela continua inteiro."},
     {"type":"bank.movement.registered","version":1,"description":"Um movimento entrou no livro de uma conta — com o sinal do tipo e a competência."},
     {"type":"bank.transfer.executed","version":1,"description":"Uma transferência entre duas contas foi executada — as duas pernas ligadas pelo transfer_id."}
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

-- ⛔ Trinta módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.29 O MÓDULO `invest` NO CATÁLOGO DA STORE — o 31º cartão
-- -----------------------------------------------------------------------------
-- Investimentos (Domain finance — o quarto da Missão Sete). Livro de atos
-- imutáveis (aplicação, rendimento, resgate); a posição é a soma dos atos —
-- SEM cotação de mercado (Lei 3/7). ⭐ Resgatar mais que a posição é RECUSADO
-- (a terceira resposta: ar permite overpay, inv permite negativo). `consumes`
-- vazio — rendimento é ato de gente.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'invest',
  'Investimentos',
  '0.1.0',
  'Os investimentos do tenant (que voltam do arquivo) e o livro de atos imutáveis: aplicação, rendimento e resgate. A posição é a soma dos atos — sem cotação de mercado. Resgatar mais que a posição é recusado.',
  'domain', 'finance',
  '[
     {"key":"investments","canonicalName":"Investimentos"}
   ]'::jsonb,
  '[
     {"key":"invest.holding.manage","moduleId":"invest","description":"Cadastrar investimentos, arquivar e devolver ao ativo."},
     {"key":"invest.movement.register","moduleId":"invest","description":"Registrar atos: aplicação, rendimento e resgate (resgate não passa da posição)."}
   ]'::jsonb,
  '[
     {"type":"invest.holding.registered","version":1,"description":"Um investimento entrou no cadastro."},
     {"type":"invest.holding.archived","version":1,"description":"Um investimento saiu de uso — o livro dele continua inteiro."},
     {"type":"invest.movement.registered","version":1,"description":"Um ato entrou no livro — aplicação, rendimento ou resgate, com o sinal e a competência."}
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

-- ⛔ Trinta e um módulos no catálogo, zero permissão concedida pelo seed.

-- =============================================================================
-- 4.30 O MÓDULO `dre` NO CATÁLOGO DA STORE — o 32º cartão
-- -----------------------------------------------------------------------------
-- DRE Gerencial (Domain finance — o quinto e último da Missão Sete). ⛔ NÃO é
-- fiscal (Lei 3). O plano de linhas é desenho do tenant; ⭐⭐ os valores nascem
-- dos livros do cash E do cc, projetados por evento com handler real; totais
-- são views; linha sem lançamento não aparece. ⚠️ Consumidor — o apps/api
-- precisa de redeploy no apply.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'dre',
  'DRE Gerencial',
  '0.1.0',
  'A leitura gerencial do resultado (não fiscal): as linhas que o tenant desenha, com os valores nascendo dos livros do Fluxo de Caixa e dos Rateios — projetados por evento. Totais e subtotais são calculados; linha sem lançamento não aparece.',
  'domain', 'finance',
  '[
     {"key":"income-statement","canonicalName":"DRE"}
   ]'::jsonb,
  '[
     {"key":"dre.line.manage","moduleId":"dre","description":"Desenhar o plano de linhas da DRE: nome, natureza (receita/custo/despesa) e a categoria que casa."},
     {"key":"dre.statement.read","moduleId":"dre","description":"Ler o demonstrativo e o resultado — sem poder alterar o plano."}
   ]'::jsonb,
  '[
     {"type":"dre.line.registered","version":1,"description":"Uma linha entrou no plano da DRE."},
     {"type":"dre.line.archived","version":1,"description":"Uma linha saiu do plano — o histórico dela continua nos livros."}
   ]'::jsonb,
  '[
     {"type":"cash.entry.registered","version":1,"description":"Um lançamento de caixa — vira valor da linha que casa a categoria."},
     {"type":"cc.rateio.executed","version":1,"description":"Um custo rateado — vira valor (negativo) da linha que casa a origem do rateio."}
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

-- =============================================================================
-- 4.33 O MÓDULO `hr` NO CATÁLOGO DA STORE — o 33º cartão (Missão Oito)
-- -----------------------------------------------------------------------------
-- Cadastro de Colaboradores (Domain RH). Cargo/departamento texto livre;
-- on_leave volta, terminated é terminal com razão. Sem dado sensível.
-- `consumes` vazio por decisão de canon (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'hr',
  'Cadastro de Colaboradores',
  '0.1.0',
  'Quem trabalha na empresa: cargo e departamento TEXTO LIVRE (nunca enum). O afastamento (on_leave) volta; o desligamento (terminated) é TERMINAL e exige razão escrita — quem retorna é admissão nova, com vínculo solto ao registro anterior. Sem dado sensível.',
  'domain', 'hr',
  '[
     {"key":"admission","canonicalName":"Admissão"},
     {"key":"termination","canonicalName":"Demissão"}
   ]'::jsonb,
  '[
     {"key":"hr.employee.manage","moduleId":"hr","description":"Cadastrar colaboradores, editar dados e afastar/reintegrar (on_leave ↔ active)."},
     {"key":"hr.employee.decide","moduleId":"hr","description":"Desligar um colaborador — ato terminal, com razão escrita e carimbo do servidor."}
   ]'::jsonb,
  '[
     {"type":"hr.employee.hired","version":1,"description":"Um colaborador foi admitido — nome (dado neutro), cargo e data no envelope."},
     {"type":"hr.employee.updated","version":1,"description":"Os dados do colaborador mudaram (nome, cargo, departamento, admissão)."},
     {"type":"hr.employee.suspended","version":1,"description":"O colaborador foi afastado (on_leave) — reversível."},
     {"type":"hr.employee.reinstated","version":1,"description":"O colaborador afastado voltou (active)."},
     {"type":"hr.employee.terminated","version":1,"description":"O colaborador foi desligado — terminal, com a razão escrita."}
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

-- =============================================================================
-- 4.34 O MÓDULO `shift` NO CATÁLOGO DA STORE — o 34º cartão (Missão Oito)
-- -----------------------------------------------------------------------------
-- Escalas (Domain RH). Turno texto livre; vínculo com hr por id SOLTO + nome
-- carimbado. A física do spc reaproveitada: duas escalas não ocupam o MESMO
-- colaborador no MESMO período (exclusion constraint, parcial). Passado
-- permitido. `consumes` vazio (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'shift',
  'Escalas',
  '0.1.0',
  'A escala de trabalho do tenant: turno TEXTO LIVRE, vínculo com o colaborador por id solto + nome carimbado. Duas escalas não ocupam o mesmo colaborador no mesmo período — o conflito é recusado pelo BANCO (exclusion constraint; a cancelada libera sozinha). O passado é permitido (fato consumado).',
  'domain', 'hr',
  '[
     {"key":"schedules","canonicalName":"Escalas"}
   ]'::jsonb,
  '[
     {"key":"shift.schedule.manage","moduleId":"shift","description":"Escalar colaboradores em turnos e períodos, e remarcar enquanto não rodou."},
     {"key":"shift.schedule.decide","moduleId":"shift","description":"Cancelar uma escala — ato terminal, com razão escrita e carimbo do servidor."}
   ]'::jsonb,
  '[
     {"type":"shift.schedule.scheduled","version":1,"description":"Um turno foi escalado — colaborador (id solto + nome), turno e período no envelope."},
     {"type":"shift.schedule.updated","version":1,"description":"A escala foi remarcada no que é FATO: turno, período."},
     {"type":"shift.schedule.cancelled","version":1,"description":"A escala foi cancelada — terminal, com a razão. O período ficou livre sozinho."}
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

-- =============================================================================
-- 4.35 O MÓDULO `train` NO CATÁLOGO DA STORE — o 35º cartão (Missão Oito)
-- -----------------------------------------------------------------------------
-- Treinamentos (Domain RH). Programas e turmas desenho do tenant; a
-- identidade do evt reaproveitada: turma publicada abre inscrição, presença
-- é ato imutável carimbado, turma cancelada é terminal. Colaborador por id
-- solto. `consumes` vazio (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'train',
  'Treinamentos',
  '0.1.0',
  'Os programas de treinamento do tenant e as turmas deles: turma publicada abre inscrição; a presença é ato imutável carimbado pelo servidor (a física do evt); a conclusão por colaborador é ato registrado (data + nota opcional). Colaborador por id solto + nome. Sem certificado (Storage do Core, declarado FORA).',
  'domain', 'hr',
  '[
     {"key":"trainings","canonicalName":"Treinamentos"}
   ]'::jsonb,
  '[
     {"key":"train.setup.manage","moduleId":"train","description":"Desenhar programas e turmas: publicar (abre inscrição), concluir e cancelar a turma."},
     {"key":"train.enrollment.manage","moduleId":"train","description":"Inscrever colaboradores, registrar presença (ato imutável) e a conclusão do programa."}
   ]'::jsonb,
  '[
     {"type":"train.session.published","version":1,"description":"Uma turma abriu inscrição — programa, título e início no envelope."},
     {"type":"train.session.concluded","version":1,"description":"A turma foi concluída. Terminal."},
     {"type":"train.session.cancelled","version":1,"description":"A turma foi cancelada. Terminal."},
     {"type":"train.enrollment.registered","version":1,"description":"Um colaborador se inscreveu numa turma."},
     {"type":"train.attendance.recorded","version":1,"description":"A presença foi registrada — ato imutável, carimbado pelo servidor."},
     {"type":"train.enrollment.completed","version":1,"description":"O colaborador concluiu o programa — data e nota opcional."},
     {"type":"train.enrollment.cancelled","version":1,"description":"A inscrição foi cancelada. Terminal."}
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

-- =============================================================================
-- 4.36 O MÓDULO `perf` NO CATÁLOGO DA STORE — o 36º cartão (Missão Oito)
-- -----------------------------------------------------------------------------
-- Avaliação de Desempenho (Domain RH). NÃO confundir com goal (a ambição
-- que o próprio declara): perf é o JULGAMENTO de um avaliador sobre o
-- trabalho de um avaliado — dois papéis. Ciclo texto livre; avaliação é ato
-- imutável; ciclo fechado é terminal. `consumes` vazio (Lei 7) — spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'perf',
  'Avaliação de Desempenho',
  '0.1.0',
  'O julgamento do trabalho de alguém por outra pessoa — dois papéis (avaliador e avaliado), diferente da meta que o próprio declara. Ciclo TEXTO LIVRE (trimestral/anual); a avaliação é ato imutável, carimbado pelo servidor; o ciclo fechado é terminal — o próximo é ciclo novo. OKRs estruturados ficam FORA.',
  'domain', 'hr',
  '[
     {"key":"appraisals","canonicalName":"Avaliação"}
   ]'::jsonb,
  '[
     {"key":"perf.cycle.manage","moduleId":"perf","description":"Abrir e fechar ciclos de avaliação (o ciclo é dado do tenant)."},
     {"key":"perf.review.manage","moduleId":"perf","description":"Registrar avaliações — ato imutável, ligado ao ciclo, com o avaliador carimbado pelo servidor."}
   ]'::jsonb,
  '[
     {"type":"perf.cycle.opened","version":1,"description":"Um ciclo de avaliação foi aberto — nome e período no envelope."},
     {"type":"perf.cycle.closed","version":1,"description":"O ciclo foi fechado. Terminal — o próximo é ciclo novo."},
     {"type":"perf.review.recorded","version":1,"description":"Uma avaliação foi registrada — avaliado (id solto + nome), avaliador carimbado, nota opcional."}
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

-- =============================================================================
-- 4.37 O MÓDULO `pol` NO CATÁLOGO DA STORE — o 37º cartão (Missão Oito)
-- -----------------------------------------------------------------------------
-- Políticas (Domain RH — o mural fala com membros; a *Políticas* de GRC é o
-- HOMÔNIMO de compliance corporativo, declarado — como o comm declarou o
-- recorte de Condomínios). ⭐ DIVERGE do comm: política tem VERSÃO — a
-- ciência é por (política, versão): versão nova exige ciência de novo.
-- `consumes` vazio (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'pol',
  'Políticas',
  '0.1.0',
  'As políticas internas do tenant que os membros dão ciência — e o que a diferencia do mural: política tem VERSÃO. Publicar uma versão congela o corpo; a ciência é por (política, versão) — uma versão nova exige ciência de novo. Versão arquivada é terminal; a política volta com versão nova, nunca reabrindo a antiga.',
  'domain', 'hr',
  '[
     {"key":"policies","canonicalName":"Políticas"}
   ]'::jsonb,
  '[
     {"key":"pol.policy.manage","moduleId":"pol","description":"Redigir políticas, publicar versões (congela o corpo) e arquivar versões."},
     {"key":"pol.policy.ack","moduleId":"pol","description":"Dar a PRÓPRIA ciência de uma VERSÃO publicada — ato único por versão, carimbado, que não se retira."}
   ]'::jsonb,
  '[
     {"type":"pol.version.drafted","version":1,"description":"Uma versão de política nasceu no rascunho."},
     {"type":"pol.version.published","version":1,"description":"Uma versão foi publicada — o corpo congela; quem deu ciência da anterior precisa dar de novo."},
     {"type":"pol.version.archived","version":1,"description":"Uma versão saiu de circulação. Terminal."},
     {"type":"pol.version.acknowledged","version":1,"description":"Um membro deu ciência de uma versão — ato próprio, único por versão, carimbado."}
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

-- =============================================================================
-- 4.38 O MÓDULO `mall` — o 38º cartão · ⭐ O PRIMEIRO VERTICAL (Missão Nove)
-- -----------------------------------------------------------------------------
-- Gestão de Lojistas. ⭐ `layer='vertical'`, `vertical_key='shopping-centers'`
-- (VerticalKey do @alsham/core; a Store gradua a pill de Shopping Centers).
-- Segmento texto livre; unidade física por id solto ao spc; active ↔ archived
-- (o DIVERGE do hr). `consumes` vazio (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'mall',
  'Gestão de Lojistas',
  '0.1.0',
  'Os lojistas do shopping: segmento TEXTO LIVRE (nunca enum), a unidade física por id solto ao spc (não recria cadastro de espaço). O lojista é relação comercial que volta — active ↔ archived (o DIVERGE do hr).',
  'vertical', 'shopping-centers',
  '[
     {"key":"store-tenants","canonicalName":"Lojistas"}
   ]'::jsonb,
  '[
     {"key":"mall.store.manage","moduleId":"mall","description":"Cadastrar lojistas e editar dados (nome, segmento, unidade física por id solto)."},
     {"key":"mall.store.decide","moduleId":"mall","description":"Arquivar ou reabrir um lojista — tira/põe no mapa do mall."}
   ]'::jsonb,
  '[
     {"type":"mall.store.registered","version":1,"description":"Um lojista foi cadastrado — nome, segmento e a unidade pelo nome carimbado."},
     {"type":"mall.store.updated","version":1,"description":"Os dados do lojista mudaram."},
     {"type":"mall.store.archived","version":1,"description":"O lojista saiu do mapa do mall — reversível."},
     {"type":"mall.store.reopened","version":1,"description":"O lojista voltou ao mapa — a mesma relação comercial."}
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

-- =============================================================================
-- 4.39 O MÓDULO `lease` — o 39º cartão (Missão Nove) · vertical
-- -----------------------------------------------------------------------------
-- Locação de Lojistas. ⭐ CAMADA COMERCIAL sobre o `ctr` (a vigência/reajuste/
-- renovação são do ctr, por id solto — não se reescreve). Registra o termo
-- comercial sobre vendas (texto livre) e o relatório de vendas (ato imutável).
-- `consumes` vazio (Lei 7) — ver a spec §5.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'lease',
  'Locação de Lojistas',
  '0.1.0',
  'A camada comercial da locação do shopping: o contrato vive no ctr (id solto); aqui mora o termo comercial sobre vendas (percentual/regra em texto livre, dado do tenant) e o relatório mensal de vendas do lojista — ato imutável, registrado por gente (sem POS integrado).',
  'vertical', 'shopping-centers',
  '[
     {"key":"lease-agreements","canonicalName":"Contratos de locação"}
   ]'::jsonb,
  '[
     {"key":"lease.agreement.manage","moduleId":"lease","description":"Registrar a locação comercial (contrato por id solto, lojista por id solto, termo sobre vendas) e encerrá-la."},
     {"key":"lease.report.manage","moduleId":"lease","description":"Registrar o relatório mensal de vendas do lojista — ato imutável."}
   ]'::jsonb,
  '[
     {"type":"lease.agreement.registered","version":1,"description":"Uma locação comercial foi registrada — contrato e lojista por id solto, termo sobre vendas."},
     {"type":"lease.agreement.ended","version":1,"description":"A locação comercial foi encerrada. Terminal."},
     {"type":"lease.report.recorded","version":1,"description":"Um relatório de vendas do lojista foi registrado — ato imutável, com competência e valor."}
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

-- =============================================================================
-- 4.40 O MÓDULO `fund` — o 40º cartão (Missão Nove) · vertical
-- -----------------------------------------------------------------------------
-- Fundo de Promoção. ⭐ Livro próprio de contribuições e gastos (autossuficiente
-- — não importa o cc). ⭐⭐ O SALDO NUNCA fica negativo — o DIVERGE do bank/inv
-- (que permitem): fundo é dinheiro coletivo de terceiros. `consumes` vazio.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'fund',
  'Fundo de Promoção',
  '0.1.0',
  'O caixa coletivo do shopping: contribuições dos lojistas (id solto) e gastos com promoção — livro próprio, ato imutável. O saldo NUNCA fica negativo (o DIVERGE do bank/inv): gastar mais do que arrecadou não é produto financeiro, é descontrole — a constraint recusa.',
  'vertical', 'shopping-centers',
  '[
     {"key":"promotion-fund","canonicalName":"Fundo de promoção"}
   ]'::jsonb,
  '[
     {"key":"fund.contribution.manage","moduleId":"fund","description":"Registrar contribuições dos lojistas ao fundo — ato imutável."},
     {"key":"fund.expense.manage","moduleId":"fund","description":"Registrar gastos do fundo (com razão) — recusados se estouram o saldo."}
   ]'::jsonb,
  '[
     {"type":"fund.contribution.recorded","version":1,"description":"Uma contribuição ao fundo foi registrada — lojista por id solto, competência e valor."},
     {"type":"fund.expense.recorded","version":1,"description":"Um gasto do fundo foi registrado — com razão; o saldo nunca fica negativo."}
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

-- =============================================================================
-- 4.41 O MÓDULO `park` — o 41º cartão (Missão Nove) · vertical
-- -----------------------------------------------------------------------------
-- Estacionamento. ⭐ A identidade do `vis` (portaria): veículo neutro
-- (placa/identificador texto livre), entrada e saída carimbadas PELO SERVIDOR;
-- correção é registro novo. Tarifa opcional (texto). `consumes` vazio.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'park',
  'Estacionamento',
  '0.1.0',
  'O livro do estacionamento do shopping: veículo NEUTRO (placa/identificador texto livre), entrada e saída carimbadas pelo servidor (nunca pela tela — a prudência do vis); correção é registro novo. Tarifa opcional em texto (o tenant decide se cobra). Sem cálculo de tarifa progressiva.',
  'vertical', 'shopping-centers',
  '[
     {"key":"parking","canonicalName":"Estacionamento"}
   ]'::jsonb,
  '[
     {"key":"park.entry.manage","moduleId":"park","description":"Registrar a ENTRADA de um veículo — o carimbo de entrada é do servidor."},
     {"key":"park.entry.close","moduleId":"park","description":"Registrar a SAÍDA de um veículo — o carimbo de saída é do servidor."}
   ]'::jsonb,
  '[
     {"type":"park.entry.registered","version":1,"description":"Um veículo entrou — placa/identificador e o carimbo de entrada do servidor."},
     {"type":"park.entry.closed","version":1,"description":"Um veículo saiu — o carimbo de saída do servidor, sobre a mesma entrada."}
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

-- =============================================================================
-- 4.42 O MÓDULO `sec` — o 42º cartão (Missão Nove) · ⭐ A ÚLTIMA PEÇA · vertical
-- -----------------------------------------------------------------------------
-- Segurança — Rondas. ⭐ NÃO reescreve o `occ` (o incidente é uma Ocorrência):
-- este módulo é só a RONDA — o percurso verificado, ato pontual imutável.
-- `consumes` vazio (Lei 7) — ver a spec §5. ⭐ 42/42 — campanha completa.
-- =============================================================================

insert into core.module_registry (
  module_id, name, version, summary,
  layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'sec',
  'Segurança — Rondas',
  '0.1.0',
  'A ronda de segurança do shopping: postos de verificação (texto livre, desenho do tenant) e o livro de rondas — quando se passou por qual posto, ato pontual imutável carimbado pelo servidor. O incidente NÃO mora aqui: incidente é Ocorrência (occ), que já existe.',
  'vertical', 'shopping-centers',
  '[
     {"key":"security-patrols","canonicalName":"Segurança"}
   ]'::jsonb,
  '[
     {"key":"sec.checkpoint.manage","moduleId":"sec","description":"Desenhar os postos de verificação do tenant (texto livre; voltam do arquivo)."},
     {"key":"sec.patrol.record","moduleId":"sec","description":"Registrar a passagem da ronda por um posto — ato imutável, carimbado pelo servidor."}
   ]'::jsonb,
  '[
     {"type":"sec.patrol.recorded","version":1,"description":"A ronda passou por um posto — o carimbo do servidor, ato pontual imutável."}
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

-- ⛔ Quarenta e dois módulos no catálogo (37 domain + 5 vertical), zero
-- permissão concedida pelo seed. ⭐ Campanha das 6 Ondas COMPLETA (30/07/2026).

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
