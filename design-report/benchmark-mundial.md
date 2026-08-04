# Benchmark Mundial × Auditoria Canônica — Relatório da FASE 1

> **Mandato:** *"Nós não inventamos a roda. Nós a rodamos."* Toda tela do Business OS que entrega **menos** do que o melhor sistema de gestão validado do mundo é um GAP — a mapear, documentar e (depois, com aprovação) fechar.
>
> **Natureza:** auditoria de **completude funcional**, não de estética. A pergunta de cada tela é: *ela mostra tudo que um usuário real precisa para confiar na sua decisão?*
>
> **Status:** FASE 1 (investigação) **concluída**. ⛔ **Nenhuma correção de UI foi escrita.** Este documento é para revisão do dono **antes** de qualquer código.

---

## 0. O gap-modelo — a Mesa de Conciliação (`/conciliacao`)

O disparador do mandato, e o molde de como ler todos os outros. Hoje a mesa mostra **descrição + valor + um badge genérico "sem correspondência"** e para aí. Ela **não** mostra:

- **de qual CONTA BANCÁRIA** a linha veio — o schema tem `recon.bank_statements` (com a conta de origem), mas o loader (`loadStatementLines`) seleciona só `statement_lines` e **não faz o join** com o extrato;
- **por que** divergiu — não distingue "nunca vai casar" (órfã de verdade) de "quase casou, a um clique" (parcial? data fora da janela?);
- a linha **não é clicável/expansível** — sem extrato original, sem histórico de tentativa de match, sem motivo da divergência;
- as sugestões são **recomputadas no cliente** (`suggestMatches`), **não** lidas do `recon.reconciliation_matches` já gravado (que tem score/estratégia/origem) — então o histórico de match armazenado nunca aparece.

O benchmark abaixo (§1) mostra que **todo líder mundial** quantifica a divergência (campo *Difference* que precisa zerar), nomeia o porquê, e deixa a linha abrir para o detalhe. É o padrão que a mesa precisa alcançar.

---

## Método

Para cada categoria funcional: (1) pesquisei como os **líderes mundiais** resolvem — com **fonte citada** (qual sistema, o que faz), nunca "sistemas em geral"; (2) audI­tei **a tela contra o canônico** (`docs/canon/` + migration): o que o schema/física sabe e a UI não mostra. Cada gap é concreto: *"o banco tem X, a tela não mostra X"*.

⚠️ **Regra de honestidade:** nunca inventar dado que o banco não tem. Se o benchmark mostra algo que **nosso schema não captura** (ex.: anexo de documento), isso é um **GAP DE SCHEMA**, registrado à parte — nunca uma tela que mente.

---

# PARTE I — BENCHMARK MUNDIAL (por categoria, com fontes)

## 1. Conciliação bancária

O benchmark mundial de telas de conciliação converge num padrão de **duas colunas** (linha do extrato à esquerda × transação/candidato do sistema à direita), com sugestão automática, botão de confirmação por linha, busca manual quando a sugestão falha, tratamento explícito de divergência de valor (split/baixa parcial) e trilha de quem conciliou.

### Xero — a aba "Reconcile"
- **Duas listas por linha.** Statement line à esquerda × *suggested match* à direita; por linha do extrato: **Date, Payee (contact), Description, Reference, Spent/Received**. ([Xero Central](https://central.xero.com/s/guide/a5B3m00000F5CItEAN/complete-your-bank-reconciliation))
- **Match sugerido com botão OK** quando há mesmo valor + data próxima + descrição plausível; o motor concilia sozinho só em alta confiança e **sugere** caso contrário.
- **Quatro ações por linha:** Match, Create, Transfer, Discuss (comentar a linha em dúvida). ([Xero — comment on a bank line](https://central.xero.com/s/article/Add-a-comment-to-a-bank-statement-line))
- **Find & Match** (uma linha → várias faturas) e **Split** (baixa parcial com recálculo até "OK to match").
- **Divergência/histórico por linha + Unreconcile / Remove & Redo** (desfaz sem apagar). ([Xero — Unreconcile](https://central.xero.com/0/article/Unreconcile-an-account-transaction))

### QuickBooks Online — "For Review" + Reconcile
- Linha do feed: **Date, Description, Payee, Spent/Received, Category or Match** com "matches found". ([QBO — Match online bank transactions](https://quickbooks.intuit.com/learn-support/en-global/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_ROW_en))
- **Suggested matches** (mesmo valor + data próxima); **Find other matches**; split entre fatura e conta.
- **Divergência explicada:** `Difference = ending balance − cleared`, só finaliza com **Difference = $0.00**; o artigo oficial **nomeia o porquê** — transação faltando, duplicada, valor errado, período anterior alterado. ([QBO — Fix issues at the end of a reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/fix-issues-end-reconciliation-quickbooks-online/L3mZimyAb_US_en_US))
- **Reconciliation report** + **Undo** (reverte o lote).

### NetSuite — "Match Bank Data"
- Duas grades (**Imported Bank Data** × **Account Transactions**), topo com **Account, Subsidiary, Bank Balance**. ([Oracle NetSuite — Matching Bank Data](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4843222719.html))
- Subtabs **To Be Matched / Review**, campo **Difference** que zera para habilitar **Match**; ícone **Cash-In-Transit**.
- **Intelligent Transaction Matching** por regras + (2026.2) **AI matching assistant** com **prediction confidence score** e *rationale*. ([NetSuite 2026.2 AI reconciliation](https://www.netsuite.com/portal/resource/articles/financial-management/netsuite-2026-2-adds-ai-capabilities-for-smarter-bank-reconciliation-close-management-labor-insights-and-more.shtml))
- Saídas do não-casado: matching manual, **Mark as cleared**, **Exclude**, quick-add, auto-create rule.

### Conta Azul — Conciliação bancária (Brasil)
- Linha do extrato (OFX/integração) × lançamento; filtros por **data, tipo, descrição/valor**. ([Conta Azul — como fazer](https://ajuda.contaazul.com/hc/pt-br/articles/7452788480141))
- **Sugestão automática** por data+valor próximos; **Buscar lançamento** quando falha. ([Conta Azul — buscar lançamento](https://ajuda.contaazul.com/hc/pt-br/articles/19122488789901))
- **Split N:1 com quadro de diferença** (Valor bancário × Total na Conta Azul × **Diferença**), botão desabilitado até zerar; baixa parcial + juros/multa/tarifa/desconto. ([Conta Azul — várias movimentações](https://ajuda.contaazul.com/hc/pt-br/articles/7454101596429))

### O padrão consolidado
Uma tela séria mostra, no mínimo: **(1)** linha do extrato completa (data, valor com sinal, contraparte, descrição) lado a lado com o candidato; **(2)** match sugerido por "mesmo valor + data próxima + descrição plausível" com **confiança** e confirmação de 1 tecla; **(3)** busca manual + split/baixa parcial; **(4)** **divergência sempre quantificada** (campo *Difference* que zera), e o QBO vai além **nomeando o porquê**; **(5)** saídas explícitas para o não-conciliado (criar/excluir/transferir/regra); **(6)** seleção por **conta bancária**; **(7)** trilha e reversibilidade por linha (abrir, ver a que foi ligada, desfazer sem apagar, comentar).

---

## 2. Contas a pagar / a receber

Padrão dos líderes: uma **lista com aging bucketizado** como porta de entrada, e um **detalhe de título que é um dossiê** — documento de origem, cadeia (pedido→recebimento→título→baixa), trilha de auditoria de quem mudou o quê, trilha de aprovação por alçada, e histórico de baixas parciais amarrado à conciliação.

### NetSuite (Vendor Bills / Customer Invoices)
- **A/P Aging Detail:** Vendor, Transaction Type, Date, **Due Date, Age (dias em atraso), Amount Due**; aging por vencimento **ou** por data da transação (configurável). ([Oracle — A/P Aging Detail](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1529840.html))
- **A/R Aging Summary:** faixas **Current, 1–30, 31–60, 61–90, >90**, parametrizáveis (Interval/Duration). ([Oracle — A/R Aging Summary](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1531392.html))
- Detalhe: **open balance**, **GL Impact** (partida dobrada), **System Notes** (auditoria com **Old/New Value**), ligação a PO/receipt/bill payment. ([SuiteRep — System Notes](https://suiterep.com/2022/08/23/track-changes-to-netsuite-records/))

### SAP Business One (A/P & A/R Invoice)
- **Vendor Liabilities / Customer Receivables Aging** por antiguidade. ([SAP Help](https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/d71937a2513444dea6f1fcdc3f656143.html))
- Detalhe em abas: **Contents, Accounting, Electronic Documents (NF-e), Attachments** (anexos do documento). ([FireBear — SAP B1 AP review](https://firebearstudio.com/blog/sap-business-one-in-depth-review-purchasing-and-accounts-payable-documents.html))
- **Three-way match** PO→GRPO→A/P Invoice→Payment; **Change Log** (quem criou/alterou); **Approval Procedures** com originador/autorizador; **documento lançado é imutável** (corrige-se por documento novo).

### TOTVS Protheus (SIGAFIN)
- Grid com **legenda de cor por situação** (ex.: baixa parcial em azul); relatório **AGING**. ([TDN — Rastreamento FINA250](https://tdn.totvs.com/pages/viewpage.action?pageId=485854439))
- **FINR130** analítico/sintético com **Dias Atr.** (dias de atraso). ([FINR130 — Mastersiga](https://mastersiga.tomticket.com/kb/financeiro/titulos-a-receber-finr130))
- **Rastreamento (FINA250)** — reconstrói a **cadeia de origem** do título (FI7/FI8); **Posição de Cliente** com movimentos de baixa, motivo de cancelamento e estorno; baixa (FINA460) com conta, data de recebimento/crédito.

### O padrão consolidado
**(1)** Lista com **aging bucketizado** (Current/1–30/31–60/61–90/>90) + **dias exatos** de atraso + **cor de status**; **(2)** detalhe = **dossiê**: documento/anexos, cadeia de relacionamento, **trilha de auditoria (quem/quando, old/new value)**, **trilha de aprovação**, **histórico de baixas parciais**; **(3)** **imutabilidade do fato contábil** (lançado não se edita; corrige-se por estorno); **(4)** **baixa amarrada à conciliação** (conta + data, reconcilia com extrato).

---

## 3. CRM / Funil comercial

O que separa um CRM de classe mundial de um cadastro é uma ideia só: **o registro de negócio e o de contato não são fichas estáticas, são linhas do tempo de interações.**

### Salesforce (Sales Cloud)
- **Opportunity + Path:** trilha de estágios com **Probability + Forecast Category** por estágio, campos-âncora **Amount, Close Date, Stage, Probability**. ([Salesforce — Sales Paths](https://help.salesforce.com/s/articleView?id=005228988&language=en_US&type=1))
- **Activity Timeline:** e-mails (com status aberto/clicado/bounce), ligações, reuniões, tarefas — cronológico, com **passado separado de próximos passos (Next Steps)**, filtros, "View All". ([Weflow — Salesforce Activity Timeline](https://www.weflow.ai/blog/salesforce-activity-timeline))
- **Aging:** **Age** (dias desde criação), **Stage Duration** (dias no estágio), **Last Activity Date** para achar "não tocado há X dias". ([SimplySfdc — Age & Stage Duration](https://www.simplysfdc.com/2014/12/salesforce-opportunity-age-and-stage.html))
- **Auditoria:** **Opportunity History** (From/To Stage automático) + **Field History Tracking** (até 20 campos, old/new/quem/quando). ([Salesforce Ben](https://www.salesforceben.com/salesforce-opportunity-history-vs-opportunity-field-history/))

### HubSpot (Sales Hub)
- Registro em 3 colunas; meio tabulado **About / Activities / Revenue**. ([HubSpot — record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout))
- **Activity timeline:** notas, e-mails, ligações, reuniões, tarefas + **mudanças de estágio do pipeline** na própria timeline; filtros por tipo/data/owner. ([HubSpot — work with records](https://knowledge.hubspot.com/records/work-with-records))
- **Aging/inatividade:** date-stamp por estágio, **Last contacted**, cards **inativos** (14 dias padrão) e **stalled** (≥20% acima da média do estágio). ([Lupo Digital — inactive deals](https://www.lupodigital.com/blog/a-guide-to-hubspot-sales-pipeline-active-inactive-deals-cards))

### O padrão consolidado
Nos dois líderes, **o coração do funil é a linha do tempo de interações, não a ficha do negócio**: estágio/probabilidade/valor/data no topo, e abaixo uma **cronologia de toda ligação/e-mail/reunião/nota**, com próximos passos separados, filtros, e **sinais de aging** (dias no estágio, Last Activity, "sem atividade há N dias", cards inativos/stalled). Sobre isso, **histórico de estágio + auditoria de campo**, e um **contato que também é timeline**. **A ficha estática é a lacuna.**

---

## 4. Gestão de shopping / Locação de lojistas

Categoria dominada no Brasil por **TOTVS** (Gestão de Shopping Center) e **Group Software** (Group Shopping), e globalmente por **MRI** e **Yardi**. O objeto central não é um "contrato" genérico: é o **contrato de locação de shopping** com física própria.

### TOTVS — Gestão de Shopping Center
- **Duas naturezas de aluguel na ficha:** **aluguel mínimo** (fixo) + **aluguel sobre faturamento** (% sobre vendas); quando o % supera o mínimo, cobra **aluguel complementar** automático. ([totvs.com](https://www.totvs.com/construcao/totvs-construcao-gestao-de-shopping-center/); [TDN](https://tdn.totvs.com/pages/releaseview.action?pageId=641464976))
- **Ciclo completo:** reajustes (por índice), **aditivos**, encerramento; **Portal do Faturamento Diário** (o lojista declara vendas que alimentam o complementar); **condomínio + fundo promocional (FPP)** na mesma ficha; módulo de **inadimplência** com negociação de juros/multa por competência.

### Group Software — Group Shopping
- **Contrato de alta complexidade** com múltiplas classes de cobrança; **régua de cobrança** por estágio de vencimento + dashboards de **aging**. ([groupsoftware.com.br](https://www.groupsoftware.com.br/administracao-de-shoppings/))
- **Group GED** (documentação do lojista), **declaração de vendas + auditoria**, **mapas inteligentes** (vacância/receita sobre a planta).

### Referência global — MRI / Yardi
- **Lease abstraction** com datas críticas e **trilha de auditoria ligando cada valor à cláusula**; **percentage rent** com **breakpoint** e **auditoria da receita declarada**; recuperação de CAM com reconciliação estimado × realizado. ([MRI](https://www.mrisoftware.com/solutions/lease-abstraction-software/); [Yardi — Percentage Rent](https://www.yardi.com/blog/news/percentage-rent-model/29164.html))

### O padrão consolidado
A ficha do lojista é um **contrato de locação com múltiplas classes de cobrança**: mínimo + percentual sobre **faturamento declarado pelo lojista** (dado de primeira classe — dele depende o aluguel), condomínio e FPP no mesmo documento, **vigência/aditivos/reajuste por índice**, **inadimplência com régua e acordo**, **documentos anexados**, e **ocupação/vacância** sobre a planta.

⚠️ **Nota de fronteira canônica:** parte disso é, no nosso mapa, **outro módulo** por decisão de Sol Único — vigência/reajuste/renovação são do `ctr`; a régua de cobrança é o `dun`; o fundo de promoção é o `fund`; o espaço físico é o `spc`. O `lease` é a **camada comercial fina** (termo sobre vendas + relatório mensal de vendas). O gap não é "construir tudo no lease", e sim **mostrar o que já existe e ligar por id solto** o que mora nos vizinhos.

---

# PARTE II — AUDITORIA CANÔNICA (tela × schema)

Formato por tela: **loader** (colunas que busca) × **tela** (o que exibe) × **schema/canon** (o que o banco captura e a UI não mostra) → **gaps**.

### recon — Mesa de Conciliação (`/conciliacao`) — *prioridade 1*
- **LOADER:** `loadStatementLines` seleciona `statement_lines` (id, statement_id, posted_at, amount_cents, description, counterparty_name, external_id, status…). **NÃO faz join** com `recon.bank_statements` → **a conta de origem não chega à mesa**. As sugestões são **recomputadas** por `suggestMatches`, **não** lidas de `recon.reconciliation_matches`.
- **TELA:** por linha mostra descrição + valor; casadas mostram score + estratégia; divergências mostram **só** `Badge "sem correspondência"`. **Não expansível.**
- **SCHEMA/CANON tem (não mostrado):** `bank_statements.account_ref` (conta de origem), `reconciliation_matches` (origin auto/manual, **score, strategy**, status suggested/confirmed/rejected), `approval_queue` (histórico de decisão), o campo *Difference* quantificável.
- **GAPS:** (1) conta bancária de origem invisível (sem join); (2) histórico de match armazenado não lido (recomputa no cliente); (3) divergência sem motivo e sem quantificação — não distingue órfã de quase-casada; (4) linha não abre para extrato original / tentativas de match.

### ap — Contas a Pagar (`/contas-a-pagar`)
- **LOADER:** `ap.payables` → id, external_ref, due_date, amount_cents, **settled_amount_cents**, currency, supplier_name, tax_id, description, payment_method, status, created_at. **Omite** `created_by`, `updated_at`.
- **TELA:** tabela Fornecedor+ref, Vence, Valor, Saldo, Situação (+`vencido`); **linhas expansíveis** → descrição, devido/liquidado, método, taxId, cancelar em 2 passos. Sem histórico, sem "quem".
- **SCHEMA/CANON tem (não mostrado):** `created_by`, `updated_at`; o trilho de mudança vive em `core.event_outbox` (`ap.payable.registered/settled/cancelled`) — nunca lido pela tela. Sem tabela de histórico de baixas parciais (só total corrido) = **gap de schema**.
- **GAPS:** (1) sem auditoria quem/quando (`created_by`/`updated_at` existem, não exibidos); (2) sem trilha de status/cancelamento na tela (eventos no outbox, não lidos); (3) baixa parcial é total único, sem histórico por pagamento (schema); (4) sem link visível título→conciliação (dado no `recon`).

### ar — Contas a Receber (`/contas-a-receber`)
- **LOADER:** `ar.receivables` → …, **received_amount_cents**, payer_name, settlement_method, status, created_at. **Omite** `created_by`, `updated_at`.
- **TELA:** Pagador+ref, Vence, Valor, Saldo, Situação (+`vencido` + **`recebido a maior`**); expansível → recebido, método, taxId, **bloco em prosa do overpay** (`overpaidCents`). ⭐ **Overpay corretamente distinguido — NÃO é gap.**
- **SCHEMA/CANON tem (não mostrado):** `created_by`, `updated_at`; trilha `ar.receivable.*` no outbox, não lida; sem histórico por recebimento (total corrido) = gap de schema.
- **GAPS:** (1) sem auditoria quem/quando; (2) sem trilha de recebimentos na tela; (3) sem histórico por recebimento (schema).

### crm — Relacionamentos (`/relacionamentos`)
- **LOADER:** `crm.parties` (id, kind, display_name, tax_id, email, phone, tags, note, status, created_at) + `crm.interactions` (party_id, occurred_at, channel, note, created_at) em lote.
- **TELA:** tabela de contraparte; **linha expansível** com nota, editar, arquivar/restaurar e ⭐ **a TIMELINE cronológica de interações** (canal, nota, occurred_at, "registrado em"). **O coração do CRM está presente.**
- **SCHEMA/CANON tem (não mostrado):** o **autor** de cada interação (quem registrou o contato); auditoria de party (`created_by`/`updated_at`).
- **GAPS:** (1) autoria da interação não exibida (o "quem" do log imutável); (2) auditoria de party não exibida. **A tela mais completa das seis — o requisito da timeline é atendido.**

### deal — Funil (`/funil`)
- **LOADER:** `deal.funnels` + `funnel_stages` + `deal.opportunities` (current_stage_id, title, description, value_cents, probability, expected_close_date, party_name, tags, status, outcome_reason, created_at). ⭐ **Sem método para `deal.opportunity_events`** — a trilha imutável de movimentação **nunca é buscada**.
- **TELA:** `funnel-board` kanban; cards mostram título, party, valor, **probability%**, badge "expectativa vencida", tags, mover, ganhar/perder. **`buildFunnelBoard` exclui oportunidades fechadas** → ganhas/perdidas e seu `outcome_reason` **não renderizam em lugar nenhum**. Sem trilha, sem aging, sem datas, sem descrição.
- **SCHEMA/CANON tem (não mostrado):** a tabela inteira `deal.opportunity_events` (kind opened/moved/won/lost, from/to_stage_name, note, occurred_at, **actor_user_id**); `outcome_reason`, `description`, `created_at` (aging), `expected_close_date` (só como boolean). Oportunidades fechadas ausentes da UI.
- **GAPS:** (1) **trilha de estágio invisível** (`opportunity_events` capturada, nunca lida — o "stage history" do benchmark falta); (2) sem aging/"sem atividade há N dias" (dados existem, sem cálculo); (3) **ganhas/perdidas e o motivo da perda somem do board** — não há como ver um deal fechado; (4) `expected_close_date` só como badge; data e `description` carregadas, nunca exibidas.

### mall — Lojistas (`/lojistas`) — *pós-#66*
- **LOADER (`mall-supabase.ts`):** `id, store_name, segment, space_name, status`. **Omite** `space_id`, `created_at`, `created_by`, `updated_at`.
- **TELA:** lista básica de lojistas por segmento/unidade/status (tela-âncora entregue pelo #66; **semeada** nesta sessão — 16 ativos + 2 arquivados).
- **SCHEMA/CANON tem (não mostrado):** `space_id` (id solto ao `spc` — a unidade física real), auditoria `created_at/by`, `updated_at`; e o que o **benchmark de shopping** pede e mora nos vizinhos por id solto: contrato (`ctr`), **relatório de vendas mensal** (`lease.sales_reports`), inadimplência/régua (`dun`), fundo (`fund`).
- **GAPS:** (1) o link à unidade física (`space_id`) não é resolvido/mostrado; (2) o lojista não abre para o painel do vizinho (contrato vigente, vendas declaradas, inadimplência) — hoje é cadastro plano; (3) sem "desde"/auditoria.

### catalog — Catálogo (`/catalogo`) — *pós-#66*
- **LOADER:** `id, name, sku, price_cents, currency, status`. **Omite** `created_at/by`, `updated_at`.
- **TELA:** lista de produtos (nome, SKU, preço, status); **semeada** (20 ativos + 2 descontinuados).
- **SCHEMA/CANON tem (não mostrado):** auditoria `created_at/by`, `updated_at`. Preço de venda efetivo vive no item do cupom (`pdv`) — por design.
- **GAPS:** (1) sem "quando cadastrado/alterado"; (2) sem histórico de preço (o schema não versiona preço = **gap de schema** a registrar, coerente com o benchmark de catálogo que mantém histórico de preço de tabela).

### plant + genreading — Usinas + Geração (`/usinas`) — *pós-#66*
- **LOADER:** plants `id, name, location, capacity_kwp, plant_type, status`; readings `id, plant_name, generated_kwh, unit, reference_on` **LIMIT 10**.
- **TELA:** lista de usinas + últimas leituras; **semeada** (3 usinas + 90 leituras de 30 dias variando com clima).
- **SCHEMA/CANON tem (não mostrado):** leituras têm `note` (ex.: "céu encoberto, chuva") e `recorded_by` — **não** selecionados; o loader corta em **10 leituras**, então os **30 dias semeados não aparecem inteiros** e **não há série/curva** (o benchmark de geração pede tendência, não um retângulo de 10 linhas).
- **GAPS:** (1) `note` da leitura (o "porquê" do dia fraco) não exibido; (2) LIMIT 10 esconde a série de 30 dias — sem gráfico/tendência de geração; (3) sem performance ratio / comparação com a capacidade (parte é gap de schema, declarado FORA no canon).

### lease — Locação (`/locacao`) — *gap de tela inteiro*
- **LOADER:** **NÃO EXISTE** (`lease-supabase.ts`/`lease-port.ts`/`lease-mock.ts` ausentes; sem `getLeasePort`). O #66 entregou mall/catalog/plant, **não** o lease.
- **TELA:** placeholder `EmptyState` — zero dado.
- **SCHEMA/CANON tem (não mostrado):** `lease.agreements` (contract_id+ref id solto ao `ctr`, store_id+nome, **revenue_share** texto livre, status active/ended, end_reason, ended_at/by) e o **imutável `lease.sales_reports`** (competency mensal, reported_amount_cents, note, reported_by) — **o "faturamento declarado pelo lojista" do benchmark, capturado no schema e sem nenhuma tela**.
- **GAPS:** (1) **schema existe, UI não** — a camada comercial de locação está inteira sem front-end; (2) o **livro mensal de vendas declaradas** (o dado de primeira classe do benchmark de shopping) não tem tela alguma.

---

# PARTE III — MATRIZ CONSOLIDADA DE GAPS + PRIORIDADE SUGERIDA

Prioridade combina **criticidade do benchmark** (quão central é o que falta) × **quanto o cliente usa** (o dono sinalizou: *conciliação é uso pesado*).

| # | Tela | Gap-núcleo (o que o líder mostra e nós não) | Origem do dado | Tipo | Prioridade |
|---|---|---|---|---|---|
| 1 | **Conciliação** | Conta de origem + motivo/quantificação da divergência + histórico de match, linha expansível | join `bank_statements` + ler `reconciliation_matches` | UI (dado existe) | **P0 — primeiro** |
| 2 | **Funil (deal)** | Trilha de estágio + aging + ver deals fechados e motivo da perda | `opportunity_events` + campos já carregados | UI (dado existe) | **P1** |
| 3 | **Contas a Pagar** | Auditoria quem/quando + trilha de status na tela | `created_by`/`updated_at` + outbox | UI + leitura outbox | **P1** |
| 4 | **Contas a Receber** | Auditoria quem/quando + trilha de recebimento | idem ap | UI + leitura outbox | **P2** |
| 5 | **Locação (lease)** | Tela inteira + **livro de vendas declaradas** (dado de 1ª classe do benchmark) | schema existe, **sem UI** | UI nova (porta+tela) | **P1** (alto valor vertical) |
| 6 | **Lojistas (mall)** | Abrir o lojista para contrato/vendas/inadimplência do vizinho (id solto) | `ctr`/`lease`/`dun` por id solto | UI de composição | **P2** |
| 7 | **Usinas/Geração** | Série de 30 dias + `note` + curva de geração (hoje LIMIT 10, sem gráfico) | remover LIMIT + `note` + viz | UI (dado existe) | **P2** |
| 8 | **CRM** | Autor da interação na timeline | coluna de autor no log | UI menor | **P3** |

**Gaps de SCHEMA (registrados à parte — não são tela que mente, são física a decidir com o dono):**
- ap/ar: **histórico de baixas/recebimentos parciais** (hoje total corrido, sem livro por pagamento).
- catalog: **histórico de preço** (preço de tabela não versionado).
- Nenhum desses deve virar tela antes de o dono decidir se a física entra — inventar a linha seria mentir.

---

## PARE

⛔ **Nenhuma correção de UI escrita.** Este relatório é o entregável da Fase 1. Aguardo revisão e aprovação do dono antes de tocar em qualquer tela. Quando autorizado, a ordem sugerida é **Conciliação primeiro** (P0, uso pesado), depois pela criticidade do benchmark acima — cada correção reaproveitando o padrão de **linha expansível com detalhe completo** já provado no Mandato de Beleza (Contas a Pagar, Contratos, Propostas), nunca mostrando menos informação que o líder de mercado.
