import type { CatalogEntry, TenantModuleRow } from '@alsham/permissions';

import { DataPortError } from './port';
import type { StorePort } from './store-port';

/**
 * Adapter MOCKADO da Store — a vitrine se prova sem banco no ar.
 *
 * ⚠️ Estes são os módulos REAIS da plataforma, transcritos do seed
 * (`supabase/seed/0001_platform.sql`), que por sua vez espelha os manifestos
 * de cada pacote. Não é dado fabricado de cliente: é o catálogo, o mesmo para
 * todo tenant. Nenhum nome de empresa, segmento ou praça — a Store é genérica
 * por lei (anti-viés). Quando o banco está no ar, `store-supabase.ts` carrega
 * exatamente estas linhas de `core.module_registry`.
 *
 * ⚠️ Mantido em ordem de roadmap, idêntica à do seed. A tela agrupa por
 * `domainKey`/`verticalKey` contra a Taxonomia (`store-taxonomy.ts`).
 */

const CATALOGO: CatalogEntry[] = [
  {
    moduleId: "recon",
    name: "Conciliação & Aprovações",
    version: "0.1.0",
    summary: "Importa o extrato, sugere as baixas, e põe cada divergência numa fila com visto e trilha.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "bank-reconciliation", canonicalName: "Conciliação bancária" },
      { key: "financial-approvals", canonicalName: "Aprovações financeiras" },
    ],
    permissions: [
      { key: "recon.statement.import", description: "Importar extratos bancários e títulos a pagar." },
      { key: "recon.match.manage", description: "Criar, ajustar e desfazer casamentos entre lançamentos e títulos." },
      { key: "recon.approval.decide", description: "Aprovar ou rejeitar itens da fila de aprovação." },
    ],
    emits: [
      { type: "recon.reconciliation.completed", description: "Um extrato foi fechado. Traz o total de linhas, quantas casaram e — o que interessa — quantas sobraram." },
      { type: "recon.approval.decided", description: "Um humano visou um item da fila: aprovado ou rejeitado, com quem, quando e por quê." },
      { type: "recon.statement.discarded", description: "Um extrato foi descartado — a ação destrutiva deste módulo. Some da operação, nunca da trilha." },
      { type: "recon.match.decided", description: "Um casamento (débito×payable ou crédito×receivable) foi confirmado ou rejeitado. Payload autossuficiente para o módulo de origem liquidar o título." },
    ],
    consumes: [
      { type: "ap.payable.registered", description: "Um título a pagar nasceu em outro módulo. Vira projeção local, com a origem que veio no envelope, e a mesa de conciliação passa a ter contra o que casar." },
      { type: "ap.payable.updated", description: "O valor, o vencimento ou a liquidação de um título mudaram na origem. A projeção acompanha." },
      { type: "ap.payable.cancelled", description: "Um título foi cancelado na origem. A projeção passa a cancelled — some da mesa, nunca do banco." },
      { type: "ar.receivable.registered", description: "Um título a receber nasceu em outro módulo. Vira projeção local em recon.receivables; a mesa passa a ter contra o que casar o crédito do extrato." },
      { type: "ar.receivable.updated", description: "O valor, o vencimento ou o recebimento de um título mudaram na origem. A projeção acompanha — inclusive receber a maior." },
      { type: "ar.receivable.cancelled", description: "Um título a receber foi cancelado na origem. A projeção passa a cancelled — some da mesa, nunca do banco." },
    ],
  },
  {
    moduleId: "marketing",
    name: "Campanhas de Marketing",
    version: "0.1.0",
    summary: "Planeja, agenda, publica e mede campanhas — e fica sabendo da verba aprovada sem ninguém precisar avisar.",
    layer: "domain",
    domainKey: "marketing",
    verticalKey: null,
    capabilities: [
      { key: "campaigns", canonicalName: "Campanhas" },
    ],
    permissions: [
      { key: "marketing.campaign.manage", description: "Criar e editar campanhas, peças e agendamento." },
      { key: "marketing.campaign.publish", description: "Pôr campanha no ar, encerrar e cancelar." },
      { key: "marketing.result.record", description: "Registrar o resultado medido de uma campanha." },
    ],
    emits: [
      { type: "marketing.campaign.published", description: "Uma campanha entrou no ar, com a verba e o público que tinha no momento." },
      { type: "marketing.campaign.completed", description: "Uma campanha cumpriu seu ciclo e foi encerrada." },
      { type: "marketing.campaign.cancelled", description: "Uma campanha foi cancelada — a ação destrutiva deste módulo. Some da operação, nunca da trilha." },
    ],
    consumes: [
      { type: "recon.approval.decided", description: "Uma decisão financeira foi visada por um humano. Quando a referência bate com a verba de uma campanha, a campanha fica sabendo." },
    ],
  },
  {
    moduleId: "ap",
    name: "Contas a Pagar",
    version: "0.1.0",
    summary: "Registra o que a empresa deve, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "accounts-payable", canonicalName: "Contas a pagar" },
    ],
    permissions: [
      { key: "ap.payable.manage", description: "Registrar e editar títulos a pagar." },
      { key: "ap.payable.cancel", description: "Cancelar um título — a ação destrutiva deste módulo." },
    ],
    emits: [
      { type: "ap.payable.registered", description: "Um título a pagar foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo." },
      { type: "ap.payable.updated", description: "Mudou algo que interessa a quem escuta: valor, vencimento, quanto já foi liquidado ou o estado." },
      { type: "ap.payable.cancelled", description: "Um título foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco." },
    ],
    consumes: [
      { type: "recon.match.decided", description: "Um casamento de débito foi confirmado ou rejeitado na conciliação. Confirmar liquida o título a pagar pelo externalRef; rejeitar só registra. Overpay é recusado." },
    ],
  },
  {
    moduleId: "crm",
    name: "Relacionamentos",
    version: "0.1.0",
    summary: "O cadastro de quem a empresa se relaciona — pessoas e organizações — e o histórico de contato com cada um, inteiro num lugar só.",
    layer: "domain",
    domainKey: "crm",
    verticalKey: null,
    capabilities: [
      { key: "crm", canonicalName: "CRM" },
    ],
    permissions: [
      { key: "crm.party.manage", description: "Cadastrar e editar contrapartes." },
      { key: "crm.interaction.record", description: "Registrar um contato no histórico de uma contraparte." },
      { key: "crm.party.archive", description: "Arquivar uma contraparte e trazê-la de volta — a ação destrutiva deste módulo." },
    ],
    emits: [
      { type: "crm.party.registered", description: "Uma contraparte entrou na carteira: pessoa ou organização, com identificador, contato e etiquetas." },
      { type: "crm.party.updated", description: "Mudou algo que interessa a quem escuta: nome, identificador fiscal, contato ou etiquetas." },
      { type: "crm.party.archived", description: "Uma contraparte saiu da carteira — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco." },
      { type: "crm.interaction.registered", description: "Um contato foi registrado no histórico de uma contraparte, com quando, por onde e o que ficou anotado." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "ar",
    name: "Contas a Receber",
    version: "0.1.0",
    summary: "Registra o que a empresa tem a receber, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "accounts-receivable", canonicalName: "Contas a receber" },
    ],
    permissions: [
      { key: "ar.receivable.manage", description: "Registrar e editar títulos a receber." },
      { key: "ar.receivable.cancel", description: "Cancelar um título a receber — a ação destrutiva deste módulo." },
    ],
    emits: [
      { type: "ar.receivable.registered", description: "Um título a receber foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo." },
      { type: "ar.receivable.updated", description: "Mudou algo que interessa a quem escuta: valor, vencimento, quanto já entrou ou o estado." },
      { type: "ar.receivable.cancelled", description: "Um título a receber foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco." },
    ],
    consumes: [
      { type: "recon.match.decided", description: "Um casamento de crédito foi confirmado ou rejeitado na conciliação. Confirmar liquida o título a receber pelo externalRef do payload; rejeitar só registra o fato." },
    ],
  },
  {
    moduleId: "po",
    name: "Compras (Pedidos)",
    version: "0.1.0",
    summary: "Registra pedidos de compra com itens em texto livre, envia ao fornecedor e confere o recebimento — sem catálogo, sem cotação e sem inventar organograma.",
    layer: "domain",
    domainKey: "procurement",
    verticalKey: null,
    capabilities: [
      { key: "purchase-orders", canonicalName: "Pedidos" },
      { key: "purchase-receipt", canonicalName: "Recebimento" },
    ],
    permissions: [
      { key: "po.order.manage", description: "Criar e editar rascunhos e enviar o pedido ao fornecedor." },
      { key: "po.order.cancel", description: "Cancelar um pedido — a ação destrutiva deste módulo." },
      { key: "po.order.receive", description: "Registrar quantidades recebidas. Comprador ≠ quem confere." },
    ],
    emits: [
      { type: "po.order.registered", description: "Um pedido nasceu (pode ser rascunho). Payload autossuficiente com itens." },
      { type: "po.order.updated", description: "Mudou fato do pedido: status, totais, itens ou quantidades recebidas." },
      { type: "po.order.cancelled", description: "O pedido foi cancelado. Continua no banco; nunca DELETE." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "ops",
    name: "Esteira de Produção",
    version: "0.1.0",
    summary: "A empresa desenha a própria esteira de trabalho e move cada ordem de serviço por ela, com trilha do que foi feito, do que foi pulado e por quê.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "work-orders", canonicalName: "Ordens de serviço" },
    ],
    permissions: [
      { key: "ops.pipeline.design", description: "Desenhar a esteira: criar etapas, ordená-las e dizer quais exigem aprovação ou podem ser puladas." },
      { key: "ops.order.manage", description: "Abrir ordens de serviço, movê-las pelas etapas comuns e registrar entregáveis." },
      { key: "ops.order.decide", description: "Decidir: passar de uma etapa que exige aprovação, pular uma etapa, devolver para refazer, concluir e cancelar." },
    ],
    emits: [
      { type: "ops.order.opened", description: "Uma ordem de serviço nasceu numa esteira do tenant, com título, prazo e a etapa em que começou — pelo NOME, não só pelo id." },
      { type: "ops.stage.advanced", description: "A OS passou para a próxima etapa da esteira, com de onde para onde e o que ficou anotado." },
      { type: "ops.stage.skipped", description: "Uma etapa foi PULADA, com quem pulou, quando e a razão. Pular nunca apaga a etapa da história da OS." },
      { type: "ops.order.sent-back", description: "A OS foi devolvida para uma etapa anterior com a instrução do que refazer. Devolver uma OS concluída a reabre." },
      { type: "ops.order.completed", description: "A OS saiu da esteira concluída." },
      { type: "ops.order.cancelled", description: "A OS foi cancelada — a ação destrutiva deste módulo. Some da esteira, nunca da trilha, e nunca do banco." },
      { type: "ops.deliverable.registered", description: "Um entregável foi registrado numa versão nova, com a instrução que a gerou. Refazer cria versão; nunca edita." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "inv",
    name: "Estoque",
    version: "0.1.0",
    summary: "O estoque como livro de movimentos imutável: entrada, saída e ajuste com razão. O saldo é a soma do livro — calculado, nunca editado.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "stock", canonicalName: "Estoque" },
    ],
    permissions: [
      { key: "inv.item.manage", description: "Cadastrar e editar itens, arquivá-los e reativá-los. Nunca apagar." },
      { key: "inv.movement.register", description: "Lançar entradas e saídas no livro de movimentos." },
      { key: "inv.movement.adjust", description: "Lançar AJUSTES — o movimento que reescreve a contagem, sempre com razão obrigatória." },
    ],
    emits: [
      { type: "inv.item.registered", description: "Um item entrou no catálogo do tenant, com descrição, unidade e SKU opcional." },
      { type: "inv.item.updated", description: "Mudou fato do item: descrição, unidade, SKU — ou ele voltou do arquivo (reativar não tem fato próprio)." },
      { type: "inv.item.archived", description: "O item foi arquivado — a ação destrutiva deste módulo. O livro dele continua inteiro; item arquivado não movimenta." },
      { type: "inv.movement.registered", description: "Uma linha entrou no livro: entrada, saída ou ajuste com razão, com o item pelo nome e o saldo resultante." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "quote",
    name: "Propostas",
    version: "0.1.0",
    summary: "Propostas e orçamentos com itens em texto livre e validade opcional. Aceite e recusa são atos registrados — quem e quando — e renegociar é documento novo.",
    layer: "domain",
    domainKey: "crm",
    verticalKey: null,
    capabilities: [
      { key: "proposals", canonicalName: "Propostas" },
      { key: "quotes", canonicalName: "Orçamentos" },
    ],
    permissions: [
      { key: "quote.proposal.manage", description: "Montar rascunhos, editar itens, enviar a proposta e registrar expiração." },
      { key: "quote.proposal.decide", description: "Registrar o aceite ou a recusa da contraparte — o ato fica carimbado com quem e quando." },
      { key: "quote.proposal.cancel", description: "Retirar a proposta da mesa — a ação destrutiva deste módulo." },
    ],
    emits: [
      { type: "quote.proposal.registered", description: "Uma proposta nasceu (rascunho), com itens em texto livre e contraparte neutra." },
      { type: "quote.proposal.updated", description: "Mudou fato do rascunho: itens, total, moeda, validade ou contraparte." },
      { type: "quote.proposal.sent", description: "A proposta foi posta na mesa. Daqui em diante o conteúdo não muda mais." },
      { type: "quote.proposal.accepted", description: "A contraparte aceitou — registrado por quem tem fé pública do ato, com quem e quando." },
      { type: "quote.proposal.declined", description: "A contraparte recusou. Terminal: renegociar é documento novo." },
      { type: "quote.proposal.expired", description: "A validade venceu e alguém registrou o calendário. Só existe com validade vencida." },
      { type: "quote.proposal.cancelled", description: "A proposta foi retirada da mesa — a ação destrutiva deste módulo. Nunca DELETE." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "deal",
    name: "Funil Comercial",
    version: "0.1.0",
    summary: "O funil que o tenant desenha: estágios livres, movimento livre com trilha imutável, e ganho e perda como atos com razão registrada.",
    layer: "domain",
    domainKey: "crm",
    verticalKey: null,
    capabilities: [
      { key: "pipeline", canonicalName: "Pipeline" },
    ],
    permissions: [
      { key: "deal.funnel.design", description: "Desenhar funis: criar estágios, nomeá-los e ordená-los." },
      { key: "deal.opportunity.manage", description: "Abrir negociações e movê-las livremente pelos estágios — toda mudança vira trilha." },
      { key: "deal.opportunity.decide", description: "Decidir o desfecho: ganhar ou perder. Perder exige a razão." },
    ],
    emits: [
      { type: "deal.opportunity.opened", description: "Uma negociação nasceu num funil do tenant, no estágio inicial — pelo nome." },
      { type: "deal.opportunity.moved", description: "A negociação mudou de estágio — em qualquer direção, com de-onde e para-onde pelo nome." },
      { type: "deal.opportunity.updated", description: "Mudou fato da negociação: valor, moeda, probabilidade, expectativa ou vínculo." },
      { type: "deal.opportunity.won", description: "A negociação foi GANHA — ato de quem decide, com nota opcional." },
      { type: "deal.opportunity.lost", description: "A negociação foi PERDIDA — ato de quem decide, com a razão OBRIGATÓRIA. Terminal." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "evt",
    name: "Eventos",
    version: "0.1.0",
    summary: "O evento universal do tenant: nome, quando, onde em texto livre, inscrições com contato neutro, presença como ato registrado e lotação honesta.",
    layer: "domain",
    domainKey: "marketing",
    verticalKey: null,
    capabilities: [
      { key: "events", canonicalName: "Eventos" },
    ],
    permissions: [
      { key: "evt.event.manage", description: "Criar e editar eventos — nome, quando, onde, capacidade." },
      { key: "evt.event.decide", description: "Decidir sobre o evento: publicar (abrir a lista), registrar como realizado e cancelar." },
      { key: "evt.registration.manage", description: "Inscrever, confirmar, cancelar inscrições e registrar presença — a presença carimba quem e quando." },
    ],
    emits: [
      { type: "evt.event.registered", description: "Um evento nasceu (rascunho), com nome, quando e onde em texto livre." },
      { type: "evt.event.updated", description: "Mudou fato do evento: nome, datas, local ou capacidade." },
      { type: "evt.event.published", description: "O evento foi publicado — a lista de inscrições abriu. Não volta a rascunho." },
      { type: "evt.event.held", description: "O evento foi registrado como REALIZADO — só depois de ter começado." },
      { type: "evt.event.cancelled", description: "O evento foi cancelado — o fato que todo inscrito pode escutar. Nunca DELETE." },
      { type: "evt.registration.registered", description: "Alguém se inscreveu — só em evento publicado, e a lotação recusa além do teto." },
      { type: "evt.registration.confirmed", description: "A inscrição foi confirmada." },
      { type: "evt.registration.cancelled", description: "A inscrição foi cancelada — a linha fica: a desistência é história do evento." },
      { type: "evt.registration.attended", description: "A presença foi registrada — ATO carimbado com quem e quando, pelo servidor." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "dun",
    name: "Régua de Cobrança",
    version: "0.1.0",
    summary: "A régua que o tenant desenha para os títulos vencidos: diz o que fazer, registra que foi feito — quem, quando, por qual canal. Não envia nada; a baixa na origem tira o título sozinho.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "collections", canonicalName: "Cobrança" },
    ],
    permissions: [
      { key: "dun.ruler.design", description: "Desenhar a régua: passos ordenados, dias após o vencimento, canal em texto livre." },
      { key: "dun.step.execute", description: "Executar um passo da régua sobre um título vencido — o ato fica registrado com quem, quando e por qual canal." },
    ],
    emits: [
      { type: "dun.title.entered", description: "Um título vencido e em aberto entrou na régua — decidido pelo mesmo fato que o trouxe, ou pelo primeiro passo executado." },
      { type: "dun.title.left", description: "O título saiu da régua — baixa, cancelamento ou vencimento renegociado NA ORIGEM. A régua não segura ninguém." },
      { type: "dun.step.executed", description: "Um passo foi executado: título, passo pelo nome, canal, dias de atraso e anotação. É o fato que uma integração de envio escutaria." },
    ],
    consumes: [
      { type: "ar.receivable.registered", description: "Um título a receber nasceu — se vencido e em aberto, entra na régua." },
      { type: "ar.receivable.updated", description: "O título mudou (recebimento, vencimento, valor) — a régua reprojetará e decide entrada/saída." },
      { type: "ar.receivable.cancelled", description: "O título foi cancelado na origem — sai da régua sozinho." },
    ],
  },
  {
    moduleId: "ctr",
    name: "Contratos",
    version: "0.1.0",
    summary: "A carteira de contratos do tenant: vigência, valor e partes com os termos originais congelados em vigor — o vigente é calculado dos atos registrados (reajuste, renovação). Rescindir exige razão; encerrar exige calendário.",
    layer: "domain",
    domainKey: "legal",
    verticalKey: null,
    capabilities: [
      { key: "contracts", canonicalName: "Contratos" },
    ],
    permissions: [
      { key: "ctr.contract.manage", description: "Registrar e editar contratos em rascunho, e pô-los em vigor." },
      { key: "ctr.contract.amend", description: "Registrar reajuste (índice em texto livre, valor novo) e renovação (estender a vigência) — atos imutáveis no mesmo contrato." },
      { key: "ctr.contract.decide", description: "Encerrar por prazo vencido ou rescindir com razão — o desfecho é terminal e carimbado pelo servidor." },
    ],
    emits: [
      { type: "ctr.contract.registered", description: "Um contrato nasceu (rascunho), com as partes pelo nome." },
      { type: "ctr.contract.updated", description: "O rascunho mudou no que é FATO: termos, partes, vigência." },
      { type: "ctr.contract.activated", description: "O contrato entrou em vigor — a partir daqui os termos mudam só por ato." },
      { type: "ctr.contract.adjusted", description: "Reajuste registrado: índice em texto livre, valor anterior e novo. O sistema registra; quem calcula é gente." },
      { type: "ctr.contract.renewed", description: "A vigência foi estendida por renovação — o MESMO contrato, prazo novo." },
      { type: "ctr.contract.ended", description: "Fim natural: a vigência venceu e o encerramento foi registrado." },
      { type: "ctr.contract.terminated", description: "Rescisão: ato com razão obrigatória, carimbado pelo servidor." },
      { type: "ctr.contract.cancelled", description: "O rascunho foi cancelado antes de entrar em vigor." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "cash",
    name: "Fluxo de Caixa",
    version: "0.1.0",
    summary: "O livro-caixa do tenant: lançamentos imutáveis (entrada, saída, ajuste com razão), categoria desenhada pelo tenant e saldo sempre calculado. Registra o realizado — previsão é Orçamento.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "cash-flow", canonicalName: "Fluxo de caixa" },
    ],
    permissions: [
      { key: "cash.entry.register", description: "Lançar entradas e saídas no livro-caixa — o sinal vem do tipo, nunca do operador." },
      { key: "cash.entry.adjust", description: "Lançar AJUSTE com razão obrigatória — o movimento que reescreve a conta." },
      { key: "cash.category.manage", description: "Desenhar as categorias do tenant: criar, renomear, arquivar e reativar." },
    ],
    emits: [
      { type: "cash.entry.registered", description: "Um lançamento entrou no livro — com o sinal do tipo, a categoria pelo nome e o dia em que o dinheiro moveu." },
      { type: "cash.category.registered", description: "Uma categoria nasceu no desenho do tenant." },
      { type: "cash.category.updated", description: "A categoria mudou (nome, ou reativação — que não é fato novo, é a mesma)." },
      { type: "cash.category.archived", description: "A categoria saiu de uso — o livro dela continua inteiro." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "care",
    name: "Atendimento",
    version: "0.1.0",
    summary: "O balcão de atendimento do tenant: casos com solicitante neutro, categoria e prioridade desenhadas pelo tenant, conversa imutável, resolução carimbada — e reabertura honesta: o caso que volta é o mesmo caso.",
    layer: "domain",
    domainKey: "cx",
    verticalKey: null,
    capabilities: [
      { key: "service-desk", canonicalName: "SAC" },
    ],
    permissions: [
      { key: "care.ticket.manage", description: "Abrir, editar, atribuir, mover e reabrir casos; registrar interações." },
      { key: "care.ticket.resolve", description: "Resolver e fechar casos — o ato fica carimbado com quem e quando, pelo servidor." },
      { key: "care.setup.manage", description: "Desenhar categorias e prioridades do tenant — nome livre, nunca enum do produto." },
    ],
    emits: [
      { type: "care.ticket.opened", description: "Um caso nasceu — solicitante, classificação pelo nome, prazo se houver." },
      { type: "care.ticket.updated", description: "O caso mudou no que é FATO: assunto, classificação, responsável, prazo, andamento." },
      { type: "care.ticket.resolved", description: "O caso foi dado por resolvido — ato carimbado, com a nota de resolução." },
      { type: "care.ticket.reopened", description: "O MESMO caso voltou: o solicitante disse que não resolveu. O carimbo anterior fica na trilha." },
      { type: "care.ticket.closed", description: "O caso fechou — terminal. Quem volta depois é caso novo." },
      { type: "care.interaction.recorded", description: "Uma interação entrou na conversa — imutável, com canal em texto livre." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "occ",
    name: "Ocorrências",
    version: "0.1.0",
    summary: "O livro do que aconteceu: registro imutável do fato consumado, gravidade desenhada pelo tenant, tratativa em atos eternos e encerramento com desfecho escrito — terminal.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "incident-log", canonicalName: "Ocorrências" },
    ],
    permissions: [
      { key: "occ.occurrence.register", description: "Registrar o fato consumado — o registro nasce imutável." },
      { key: "occ.occurrence.treat", description: "Registrar tratativas — a cadeia de atos eternos sobre a ocorrência aberta." },
      { key: "occ.occurrence.close", description: "Encerrar com o desfecho escrito — ato carimbado e terminal." },
      { key: "occ.setup.manage", description: "Desenhar a régua de gravidade do tenant — nome livre e posição, nunca enum." },
    ],
    emits: [
      { type: "occ.occurrence.registered", description: "Um fato foi registrado — relato, local, envolvidos e gravidade pelo nome." },
      { type: "occ.occurrence.treated", description: "Uma tratativa entrou na cadeia — o que foi feito, por quem, quando." },
      { type: "occ.occurrence.closed", description: "A ocorrência foi encerrada — ato carimbado, com o desfecho escrito. Terminal." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "mnt",
    name: "Manutenção",
    version: "0.1.0",
    summary: "As ordens de manutenção do tenant: corretiva e preventiva, alvo em texto livre, prioridade desenhada pelo tenant, conclusão com relato carimbado — e a preventiva com recorrência e a próxima devida sempre calculada.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "maintenance", canonicalName: "Manutenção" },
    ],
    permissions: [
      { key: "mnt.order.manage", description: "Abrir, editar, atribuir e mover ordens de manutenção." },
      { key: "mnt.order.complete", description: "Concluir (com o relato do que foi feito) e cancelar ordens — atos carimbados." },
      { key: "mnt.setup.manage", description: "Desenhar a régua de prioridade do tenant — nome livre e posição, nunca enum." },
    ],
    emits: [
      { type: "mnt.order.opened", description: "Uma ordem nasceu — corretiva ou preventiva, com o alvo em texto." },
      { type: "mnt.order.updated", description: "A ordem mudou no que é FATO: alvo, prioridade, responsável, custo, andamento." },
      { type: "mnt.order.completed", description: "O serviço foi concluído — com o relato do que foi feito, carimbado." },
      { type: "mnt.order.reopened", description: "O MESMO serviço voltou à bancada — a vistoria reprovou o reparo." },
      { type: "mnt.order.cancelled", description: "A ordem foi cancelada — terminal. A falha nova é ordem nova." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "pat",
    name: "Patrimônio",
    version: "0.1.0",
    summary: "O livro de bens do tenant: etiqueta única, categoria desenhada pelo tenant, localização vigente calculada do livro de transferências — e a baixa terminal, com razão escrita e carimbo do servidor.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "assets", canonicalName: "Patrimônio" },
    ],
    permissions: [
      { key: "pat.asset.manage", description: "Cadastrar e editar bens, e registrar transferências de localização." },
      { key: "pat.asset.decide", description: "Baixar bens (alienação, perda, sucata) — ato terminal, com razão escrita." },
      { key: "pat.setup.manage", description: "Desenhar as categorias de bens do tenant — nome livre, nunca enum." },
    ],
    emits: [
      { type: "pat.asset.registered", description: "Um bem entrou no livro — com etiqueta, categoria e onde nasceu." },
      { type: "pat.asset.updated", description: "O bem mudou no que é FATO: nome, etiqueta, categoria, valor, data." },
      { type: "pat.asset.transferred", description: "O bem mudou de lugar — de onde (carimbado pelo servidor) para onde." },
      { type: "pat.asset.retired", description: "O bem foi baixado — terminal, com a razão escrita. O que volta é aquisição nova." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "chk",
    name: "Checklists",
    version: "0.1.0",
    summary: "Os checklists do tenant: o modelo é desenho livre (itens ordenados, texto livre); executar congela o modelo daquele momento; cada resposta é ato carimbado que não se rasura — e concluir exige tudo respondido.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "checklists", canonicalName: "Checklist" },
    ],
    permissions: [
      { key: "chk.run.execute", description: "Abrir execuções, responder itens (ato carimbado), concluir e abandonar com razão." },
      { key: "chk.setup.manage", description: "Desenhar os modelos de checklist do tenant — itens ordenados, texto livre." },
    ],
    emits: [
      { type: "chk.run.started", description: "Uma execução abriu — com o modelo congelado daquele momento." },
      { type: "chk.run.completed", description: "A execução foi concluída — tudo respondido, com as contagens no envelope. Terminal." },
      { type: "chk.run.abandoned", description: "A execução foi abandonada — com a razão escrita. A inspeção refeita é outra inspeção." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "spc",
    name: "Reserva de Espaços",
    version: "0.1.0",
    summary: "Os espaços do tenant e a agenda deles: período meio-aberto, conflito recusado pelo BANCO (exclusion constraint — a cancelada libera sozinha), o passado permitido como fato consumado e o cancelamento com razão escrita.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "space-booking", canonicalName: "Reserva de espaços" },
    ],
    permissions: [
      { key: "spc.reservation.manage", description: "Reservar períodos, remarcar e cancelar com razão escrita." },
      { key: "spc.setup.manage", description: "Desenhar os espaços do tenant — nome livre, capacidade opcional; arquivado volta." },
    ],
    emits: [
      { type: "spc.reservation.booked", description: "Um período foi prometido — espaço pelo nome, início e fim no envelope." },
      { type: "spc.reservation.updated", description: "A reserva mudou no que é FATO: período, finalidade, espaço." },
      { type: "spc.reservation.cancelled", description: "A reserva foi cancelada — terminal, com a razão escrita. O período ficou livre sozinho." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "vis",
    name: "Visitas",
    version: "0.1.0",
    summary: "O livro da portaria: visitante neutro, destino em texto livre, entrada e saída carimbadas pelo servidor, agendamento opcional antes — e o registro que não se rasura: corrigir é registrar de novo, apontando o errado.",
    layer: "domain",
    domainKey: "operations",
    verticalKey: null,
    capabilities: [
      { key: "visitor-log", canonicalName: "Visitas" },
    ],
    permissions: [
      { key: "vis.visit.register", description: "Operar a cancela: registrar entrada (walk-in), saída e o não-comparecimento." },
      { key: "vis.visit.schedule", description: "Agendar visitas e desmarcá-las com razão escrita." },
    ],
    emits: [
      { type: "vis.visit.scheduled", description: "Uma visita foi agendada — nome e destino no envelope; o documento fica na portaria." },
      { type: "vis.visit.arrived", description: "O visitante entrou — carimbo do servidor no ato." },
      { type: "vis.visit.departed", description: "O visitante saiu — o segundo carimbo fecha a passagem. Terminal." },
      { type: "vis.visit.missed", description: "O agendado não veio — observação da cancela. Terminal." },
      { type: "vis.visit.cancelled", description: "O agendamento foi desmarcado — com a razão escrita. Terminal." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "lead",
    name: "Leads",
    version: "0.1.0",
    summary: "A fila de entrada do comercial: origem em TEXTO LIVRE (o dado que a fila existe para guardar), ciclo curto com a volta à fila permitida, desfechos terminais com carimbo — e o vínculo SOLTO com a contraparte e o negócio de quem qualificou.",
    layer: "domain",
    domainKey: "crm",
    verticalKey: null,
    capabilities: [
      { key: "leads", canonicalName: "Leads" },
    ],
    permissions: [
      { key: "lead.lead.manage", description: "Registrar leads, atender, devolver à fila e atribuir responsável." },
      { key: "lead.lead.decide", description: "Qualificar (carimbando os vínculos soltos) e descartar com razão — atos terminais." },
    ],
    emits: [
      { type: "lead.lead.created", description: "Um interesse entrou na fila — nome, origem e interesse no envelope; o contato fica." },
      { type: "lead.lead.updated", description: "O lead mudou no que é FATO: atendimento, devolução à fila, responsável, origem." },
      { type: "lead.lead.qualified", description: "Qualificado — terminal, com os vínculos soltos carimbados (contraparte, negócio)." },
      { type: "lead.lead.discarded", description: "Descartado — terminal, com a razão escrita. Quem volta é lead novo." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "goal",
    name: "Metas",
    version: "0.1.0",
    summary: "A ambição declarada do tenant: métrica em texto livre, alvo opcional que congela na ativação, check-ins como atos imutáveis — e o progresso sempre como o último check-in, calculado. Bater ou perder é decisão de gente, carimbada.",
    layer: "domain",
    domainKey: "bi",
    verticalKey: null,
    capabilities: [
      { key: "goals", canonicalName: "Metas" },
    ],
    permissions: [
      { key: "goal.goal.manage", description: "Declarar metas, editar o rascunho, ativar e atribuir dono." },
      { key: "goal.goal.report", description: "Registrar check-ins — o número na mesa, ato carimbado e imutável." },
      { key: "goal.goal.decide", description: "Fechar a época: batida, perdida (com check-in na mesa) ou cancelada com razão." },
    ],
    emits: [
      { type: "goal.goal.opened", description: "Uma ambição foi declarada — no rascunho, ainda sem correr." },
      { type: "goal.goal.activated", description: "A meta passou a correr — alvo, métrica e período congelaram." },
      { type: "goal.goal.updated", description: "A meta mudou no que segue vivo: título, dono, descrição." },
      { type: "goal.goal.reported", description: "Um check-in entrou no livro — o número, a nota e o carimbo." },
      { type: "goal.goal.achieved", description: "A época fechou BATIDA — decisão de gente, com número na mesa. Terminal." },
      { type: "goal.goal.missed", description: "A época fechou PERDIDA — decisão de gente, com número na mesa. Terminal." },
      { type: "goal.goal.cancelled", description: "A ambição foi desistida — com a razão escrita. Terminal." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "comm",
    name: "Comunicados",
    version: "0.1.0",
    summary: "O mural oficial do tenant: publicar congela a palavra dada; corrigir é comunicado novo referenciando o antigo; a ciência é ato próprio, único e eterno — e a cobertura conta quem leu enquanto a palavra esteve de pé.",
    layer: "domain",
    domainKey: "hr",
    verticalKey: null,
    capabilities: [
      { key: "notices", canonicalName: "Comunicados" },
    ],
    permissions: [
      { key: "comm.notice.manage", description: "Redigir rascunhos, publicar (dar a palavra) e arquivar comunicados." },
      { key: "comm.notice.ack", description: "Dar a PRÓPRIA ciência em comunicado publicado — ato único, carimbado, que não se retira." },
    ],
    emits: [
      { type: "comm.notice.drafted", description: "Um comunicado nasceu no rascunho — ainda sem dar a palavra." },
      { type: "comm.notice.published", description: "A palavra foi dada — título e audiência no envelope; o corpo mora no mural." },
      { type: "comm.notice.archived", description: "Saiu do mural — a história e as ciências ficam. Terminal." },
      { type: "comm.notice.acked", description: "Um membro deu ciência — ato próprio, único, carimbado." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "edcal",
    name: "Calendário Editorial",
    version: "0.1.0",
    summary: "O calendário da produção de conteúdo: canal como dado do tenant, fluxo editorial como desenho do tenant (Lei das Etapas), a pauta com o par de datas — planejada × real — e dois fins terminais: publicada (ato registrado, data do servidor) ou descartada (com razão).",
    layer: "domain",
    domainKey: "marketing",
    verticalKey: null,
    capabilities: [
      { key: "editorial-calendar", canonicalName: "Calendário" },
    ],
    permissions: [
      { key: "edcal.design.manage", description: "Desenhar o calendário do tenant: canais (criar, arquivar, devolver) e etapas do fluxo editorial." },
      { key: "edcal.piece.manage", description: "Planejar pautas, editar e reagendar o plano, e mover a pauta pelo fluxo (com trilha)." },
      { key: "edcal.piece.decide", description: "Registrar o fim da pauta: publicada (a data real é do servidor) ou descartada (com razão). Terminal." },
    ],
    emits: [
      { type: "edcal.piece.planned", description: "Uma pauta nasceu no calendário — canal, etapa e data planejada no envelope." },
      { type: "edcal.piece.moved", description: "A pauta mudou de etapa no fluxo do tenant — de/para pelo NOME carimbado." },
      { type: "edcal.piece.published", description: "O ATO de ter ido ao ar foi registrado — a data real ao lado da planejada. Terminal." },
      { type: "edcal.piece.dropped", description: "A pauta morreu, com a razão escrita. Terminal." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "media",
    name: "Biblioteca de Mídia",
    version: "0.1.0",
    summary: "O catálogo do acervo de mídia: cada ativo é um registro que diz onde a obra vive (texto livre — catálogo, não cofre), com tipo livre e etiquetas do tenant; o acervo volta do arquivo; e o uso é livro imutável, carimbado, com vínculo solto.",
    layer: "domain",
    domainKey: "marketing",
    verticalKey: null,
    capabilities: [
      { key: "media-library", canonicalName: "Mídia" },
    ],
    permissions: [
      { key: "media.asset.manage", description: "Catalogar ativos, editar o registro, etiquetar, arquivar e devolver ao acervo." },
      { key: "media.usage.record", description: "Registrar um USO do ativo — ato imutável, carimbado pelo servidor, com vínculo solto opcional." },
    ],
    emits: [
      { type: "media.asset.cataloged", description: "Uma obra entrou no acervo — título, tipo e o onde-vive no envelope." },
      { type: "media.asset.archived", description: "A obra saiu do acervo vivo — o catálogo e o livro de usos ficam." },
      { type: "media.asset.restored", description: "A obra voltou ao acervo — a MESMA obra, com a história inteira (o DIVERGE do pat)." },
      { type: "media.usage.recorded", description: "Um uso foi registrado no livro — em quê, quando e por quem, com vínculo solto." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "nps",
    name: "Pesquisas",
    version: "0.1.0",
    summary: "A voz do cliente em rodadas de medição: a pergunta é do tenant e a régua 0–10 é do método; cada resposta é ato imutável no livro; o placar (%promotores − %detratores) é sempre calculado, nunca guardado; e a rodada fechada não reabre — a que volta é pesquisa nova.",
    layer: "domain",
    domainKey: "cx",
    verticalKey: null,
    capabilities: [
      { key: "surveys", canonicalName: "Pesquisas NPS/CSAT" },
    ],
    permissions: [
      { key: "nps.survey.manage", description: "Redigir rodadas, abrir a coleta (congela a pergunta) e encerrar a medição. Terminal." },
      { key: "nps.response.record", description: "Registrar uma resposta na rodada ABERTA — ato imutável, nota 0–10, carimbado pelo servidor." },
    ],
    emits: [
      { type: "nps.survey.drafted", description: "Uma rodada nasceu no rascunho — a pergunta ainda é plano." },
      { type: "nps.survey.opened", description: "A coleta abriu — a pergunta congelou." },
      { type: "nps.survey.closed", description: "A medição encerrou — o placar está lido. Terminal." },
      { type: "nps.response.recorded", description: "Uma voz entrou no livro — a NOTA no envelope; comentário e respondente ficam em casa." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "cc",
    name: "Centros de Custo & Rateio",
    version: "0.1.0",
    summary: "Os centros de custo do tenant (que voltam do arquivo), as regras de rateio que fecham 100% ao ativar, e a execução como ato de gente: lançamentos imutáveis, um por centro, sem perder centavo — com a origem por id solto e nome carimbado.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "cost-centers", canonicalName: "Centros de custo" },
      { key: "cost-allocation", canonicalName: "Rateio" },
    ],
    permissions: [
      { key: "cc.center.manage", description: "Cadastrar centros de custo, arquivar e devolver ao ativo." },
      { key: "cc.rule.design", description: "Desenhar as regras de rateio: centros e percentuais; ativar (exige 100%) e arquivar." },
      { key: "cc.rateio.execute", description: "Executar uma regra ativa sobre um valor, gerando os lançamentos de rateio (ato de gente)." },
    ],
    emits: [
      { type: "cc.center.registered", description: "Um centro de custo entrou no cadastro." },
      { type: "cc.center.archived", description: "Um centro saiu de uso — a história e as execuções ficam." },
      { type: "cc.rule.activated", description: "Uma regra fechou 100% e passou a ratear." },
      { type: "cc.rateio.executed", description: "Um rateio foi executado — a regra, a origem pelo nome e o total no envelope; os valores por centro ficam no livro." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "bud",
    name: "Orçamentos",
    version: "0.1.0",
    summary: "O teto de gasto por categoria e período. Ativar congela a trave (categoria, período, teto); o realizado é a soma do livro do Fluxo de Caixa que casa a categoria — calculado, nunca digitado. O período fechado é terminal.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "budgeting", canonicalName: "Orçamento" },
    ],
    permissions: [
      { key: "bud.budget.manage", description: "Criar, editar e ativar orçamentos. Ativar congela a trave — categoria, período e teto param de mudar." },
      { key: "bud.budget.close", description: "Fechar o período de um orçamento — ato terminal: o período vira história e o próximo é orçamento novo." },
    ],
    emits: [
      { type: "bud.budget.opened", description: "Um orçamento nasceu no rascunho — categoria, período e teto ainda editáveis." },
      { type: "bud.budget.activated", description: "O orçamento foi ativado — a trave congelou; a partir daqui só o nome muda." },
      { type: "bud.budget.closed", description: "O período do orçamento foi fechado — terminal; o próximo período é orçamento novo." },
    ],
    consumes: [
      { type: "cash.entry.registered", description: "Um lançamento entrou no livro do Fluxo de Caixa — se for desembolso na categoria e no período de um orçamento, entra no realizado." },
    ],
  },
  {
    moduleId: "bank",
    name: "Contas Bancárias",
    version: "0.1.0",
    summary: "As contas do tenant (que voltam do arquivo) e o livro de movimentos por conta, imutável. O saldo é a soma do livro — pode ser negativo (cheque especial). A transferência é atômica: duas pernas, uma transação. Não refaz a conciliação (é do recon).",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "bank-accounts", canonicalName: "Bancos" },
    ],
    permissions: [
      { key: "bank.account.manage", description: "Cadastrar contas bancárias, arquivar e devolver ao ativo." },
      { key: "bank.movement.register", description: "Lançar entrada/saída no livro de uma conta e transferir entre contas." },
      { key: "bank.movement.adjust", description: "Ajustar o saldo de uma conta — ato com razão obrigatória, de quem confere." },
    ],
    emits: [
      { type: "bank.account.registered", description: "Uma conta bancária entrou no cadastro." },
      { type: "bank.account.archived", description: "Uma conta saiu de uso — o livro dela continua inteiro." },
      { type: "bank.movement.registered", description: "Um movimento entrou no livro de uma conta — com o sinal do tipo e a competência." },
      { type: "bank.transfer.executed", description: "Uma transferência entre duas contas foi executada — as duas pernas ligadas pelo transfer_id." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "invest",
    name: "Investimentos",
    version: "0.1.0",
    summary: "Os investimentos do tenant (que voltam do arquivo) e o livro de atos imutáveis: aplicação, rendimento e resgate. A posição é a soma dos atos — sem cotação de mercado. Resgatar mais que a posição é recusado.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "investments", canonicalName: "Investimentos" },
    ],
    permissions: [
      { key: "invest.holding.manage", description: "Cadastrar investimentos, arquivar e devolver ao ativo." },
      { key: "invest.movement.register", description: "Registrar atos: aplicação, rendimento e resgate (resgate não passa da posição)." },
    ],
    emits: [
      { type: "invest.holding.registered", description: "Um investimento entrou no cadastro." },
      { type: "invest.holding.archived", description: "Um investimento saiu de uso — o livro dele continua inteiro." },
      { type: "invest.movement.registered", description: "Um ato entrou no livro — aplicação, rendimento ou resgate, com o sinal e a competência." },
    ],
    consumes: [

    ],
  },
  {
    moduleId: "dre",
    name: "DRE Gerencial",
    version: "0.1.0",
    summary: "A leitura gerencial do resultado (não fiscal): as linhas que o tenant desenha, com os valores nascendo dos livros do Fluxo de Caixa e dos Rateios — projetados por evento. Totais e subtotais são calculados; linha sem lançamento não aparece.",
    layer: "domain",
    domainKey: "finance",
    verticalKey: null,
    capabilities: [
      { key: "income-statement", canonicalName: "DRE" },
    ],
    permissions: [
      { key: "dre.line.manage", description: "Desenhar o plano de linhas da DRE: nome, natureza (receita/custo/despesa) e a categoria que casa." },
      { key: "dre.statement.read", description: "Ler o demonstrativo e o resultado — sem poder alterar o plano." },
    ],
    emits: [
      { type: "dre.line.registered", description: "Uma linha entrou no plano da DRE." },
      { type: "dre.line.archived", description: "Uma linha saiu do plano — o histórico dela continua nos livros." },
    ],
    consumes: [
      { type: "cash.entry.registered", description: "Um lançamento de caixa — vira valor da linha que casa a categoria." },
      { type: "cc.rateio.executed", description: "Um custo rateado — vira valor (negativo) da linha que casa a origem do rateio." },
    ],
  },
];

export function createStoreMockPort(): StorePort {
  // Em memória, some a cada requisição — é demonstração, não banco. Alguns
  // módulos já instalados, em domínios diferentes, para a vitrine mostrar as
  // seções vivas com estado real.
  const instalados: TenantModuleRow[] = [
    { moduleId: 'recon', status: 'active', version: '0.1.0', installedAt: '2026-07-28T00:00:00.000Z' },
    { moduleId: 'crm', status: 'active', version: '0.1.0', installedAt: '2026-07-28T00:00:00.000Z' },
    { moduleId: 'ops', status: 'active', version: '0.1.0', installedAt: '2026-07-28T00:00:00.000Z' },
    { moduleId: 'cash', status: 'suspended', version: '0.1.0', installedAt: '2026-07-28T00:00:00.000Z' },
  ];

  return {
    kind: 'mock',
    async loadCatalog() {
      return CATALOGO;
    },
    async loadTenantModules() {
      return instalados;
    },
    async listCorePermissions() {
      return new Set(['core.module.install']);
    },
    async loadTenantRoles() {
      return [{ key: 'operacao', name: 'Operação' }];
    },
    async loadModuleLimit() {
      return 8;
    },
    async install({ moduleId, roleKey }) {
      if (!roleKey) throw new DataPortError('Escolha o papel que vai receber as permissões.');
      const existente = instalados.find((i) => i.moduleId === moduleId);
      if (existente) {
        instalados[instalados.indexOf(existente)] = { ...existente, status: 'active' };
        return;
      }
      instalados.push({
        moduleId,
        status: 'active',
        version: '0.1.0',
        installedAt: '2026-07-28T00:00:00.000Z',
      });
    },
    async uninstall({ moduleId }) {
      const i = instalados.findIndex((x) => x.moduleId === moduleId);
      if (i < 0) throw new DataPortError('Este módulo não está instalado.');
      // Espelha o banco: vira `uninstalled`, a linha NÃO some.
      instalados[i] = { ...instalados[i]!, status: 'uninstalled' };
    },
  };
}
