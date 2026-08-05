# CLAUDE.md — ALSHAM BUSINESS OS™

**Instruções permanentes para qualquer agente que abrir este repositório.**
Leia este arquivo inteiro antes de qualquer alteração. Se algo aqui contradisser `docs/canon/`, **os documentos de `docs/canon/` vencem.**

---

## 1. VERTEX — a planta antes da obra (inegociável)

Nenhuma linha de código, schema, configuração ou documento nasce aqui sem antes ler, nesta ordem:

1. `docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md` — o mapa canônico. É a ÚNICA taxonomia (Sol Único).
2. `docs/canon/ROADMAP-TECNICO-V1.md` — a ordem de engenharia. Core primeiro, sempre.
3. `docs/canon/CORE-SPEC.md` — o contrato do Lego: como um módulo nasce, se registra, é instalado e conversa. **Se você vai escrever um módulo, esta é a lei.**
4. `docs/canon/IDENTIDADE-VISUAL.md` — a direção de arte e os tokens `--bos-*`. **Nada de UI nasce fora destes tokens: nenhum HEX solto em componente.**
   Se você vai escrever um módulo NOVO, leia também `docs/canon/MODULO-MARKETING-SPEC.md` (o Módulo 2, que mostra como um módulo **consome** o fato de outro sem conhecê-lo) e `docs/canon/MODULO-CRM-SPEC.md` (o Módulo 4, que mostra o teste anti-viés aplicado onde ele é mais difícil, e por que copiar o ciclo de vida do módulo anterior "por consistência" seria erro).
5. `README.md` — as 6 Leis do Projeto.

Se você vai mexer no módulo de conciliação, leia também `docs/canon/MODULO-RECON-SPEC.md`.

Antes de decidir de onde minerar uma peça, leia também:

6. `docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md` — o que o império já tem, com estado **PROVADO · DOSSIÊ · NÃO TEMOS**.
7. `docs/balancos/BALANCO-SUPABASE.md` — o que cada banco doa; o que é pedreira de schema e o que nunca se reutiliza.

`docs/historico/` é memória, não canon. Em divergência, o canon vence.

**Se a planta não foi lida, a obra não começa.**

---

## 1.5 ⭐⭐ O MEMORANDO DA DIVISÃO DE ÁGUAS — leitura obrigatória antes de qualquer decisão de arquitetura, produto ou posicionamento

**`docs/canon/MEMORANDO-DIVISAO-DE-AGUAS.md`** — decretado 04/08/2026. A tese: **inteligência artificial é a raiz da ALSHAM GLOBAL; qualquer sistema (ERP incluso) é o acessório, nunca o contrário.** Nasceu de uma apresentação onde um cliente de porte apontou a lacuna real (o Engenheiro do Business OS era reativo; o esperado era proativo) — e virou reposicionamento formal, não emocional (a formulação inicial, "lei marcial"/exército sem supervisão, foi corrigida no próprio documento).

**O que isso muda pra quem trabalha neste repositório:**
- Toda capacidade nova de IA (o Engenheiro, qualquer motor futuro) é avaliada primeiro pelo padrão de **proatividade real e provada** (Parte VII do memorando) — nunca por promessa de capacidade que ainda não existe (Lei 7 continua valendo com MAIS força, não menos: ver o precedente do Anexo A, o caso Quantum).
- O **modelo de decisão** do memorando (Parte IV) é o que já rege este repositório: decisão técnica não sobe para o dono; decisão de negócio, sim; o clique de merge continua do dono.
- A **estratégia fast-follower/Hunter** (Parte V e VI) é o filtro contra achismo de mercado — nenhuma tecnologia entra na conversa sem sinal FORTE (disponibilidade geral de líder de mercado, case nomeado com resultado medido), nunca hype cru.

Se você é um agente chegando neste repositório pela primeira vez, leia o memorando inteiro depois do VERTEX acima — ele é a lente por trás de toda decisão de produto daqui pra frente.

## 2. AS 6 LEIS DO PROJETO (resumo — texto integral no README.md)

1. **Lei 7 (fonte):** nenhum número ou promessa vai ao ar sem estar construído e provado.
2. **Lei anti-viés:** o cliente inaugural decide a ORDEM da fila de módulos, nunca o CONTEÚDO.
3. **Construir × INTEGRAR:** folha (eSocial), fiscal (NF/SPED/SAT) e PDV integram-se por padrão; construir só com decisão de dono explícita.
4. **Lei do Reaproveitamento:** nenhum Domain começa do zero se já existe peça no império. Consulte o Balanço de Tecnologia antes de escrever qualquer coisa nova.
5. **Propriedade:** IP 100% ALSHAM Global. O cliente usa; nunca detém o motor nem as chaves-mãe.
6. **Sol Único:** uma taxonomia, uma fonte de verdade. Dado canônico não se duplica — referencia-se a fonte.

---

## 3. PROIBIÇÕES

- ❌ **Nome de cliente** — nenhum nome, razão social, marca, CNPJ, endereço, contato ou apelido de cliente em nenhum arquivo, commit, branch, comentário ou nome de pasta. Escreva sempre "cliente inaugural" ou "o tenant".
- ❌ **Número sem fonte** — todo número precisa de origem verificável. O que não foi verificado se escreve, literalmente, **NÃO VERIFICADO**. Nunca estime, nunca arredonde para cima, nunca herde um número de um documento antigo sem reconferir.
- ❌ **Segredo em código** — nenhuma chave, token, secret, connection string ou `.env` com valor real. Só `.env.example` com placeholders.
- ❌ **Merge sem avaliação de risco** — trabalho que toca schema, dado de cliente real ou comportamento de produção **sempre** vai pro dono decidir o clique (é a Parte IV do MEMORANDO-DIVISAO-DE-AGUAS: o clique final marca **quem assume a responsabilidade**, não uma reavaliação do código). Trabalho docs-only, **zero SQL, zero código de produto** pode ser mergeado pelo próprio agente — contanto que isso seja dito **explicitamente no corpo do PR** (quem mergeou, por que era seguro, e a autorização do dono).
- ❌ **Taxonomia paralela** — não crie uma segunda organização de capacidades. Referencie a Taxonomia.
- ❌ **Módulo antes do Core** — nada da Fase 2 em diante nasce antes do Core da Fase 1 estar pronto.
- ❌ **Dependência direta entre módulos** — toda comunicação passa pelo Core.
- ❌ **Banco compartilhado entre sistemas** — lição paga (Balanço §5). Cada tenant com isolamento claro.
- ❌ **RLS aberta** — lição paga P0 (Balanço §5). Todo banco nasce com RLS ligada e policies reais, padrão Peritus/Forensic.

---

## 4. O TESTE ANTI-VIÉS (aplique a TODO requisito)

Antes de aceitar qualquer requisito, pergunte:

> **"Outra empresa do mesmo setor usaria isso exatamente como está?"**

- **Sim** → é produto. Constrói no Domain ou no OS/Vertical, como peça reutilizável.
- **Não** → **não entra no módulo.** Vira configuração do tenant, ou serviço cobrado à parte.

Corolário do roadmap: *cada linha de código escrita para um cliente deve aumentar o valor da plataforma para todos os clientes futuros.*

---

## 5. ESTADO ATUAL — ETAPA 13 (A ESTEIRA DO TENANT)

### 5.1 Stack — SELADA

A **Linha A** — **TypeScript + Next.js + Supabase/Postgres + Vercel**, monorepo com pnpm workspaces + turborepo — foi **SELADA pelo dono em 27/07/2026**. Deixa de ser recomendação (Balanço de Tecnologia §4, Balanço Supabase §3) e passa a ser a língua única da plataforma.

- Postgres é o banco. **Não se abre discussão de MySQL/Drizzle neste repositório.**
- Toda peça minerada vem da coluna PROVADO do Balanço, que é toda Postgres/Supabase.
- **Nota pendente:** a Carta Magna do ALSHAM Platform Framework™ (repo `alsham-events-os`) ainda descreve a Linha B (MySQL/Drizzle). A **emenda de stack na Carta Magna está pendente** e será feita naquele repositório, não neste.

### 5.2 VERSÃO-ALVO — escolhida pelo dono em 27/07/2026

Cravada para o SaaS não nascer defasado **e** para que subir de major no futuro seja decisão informada, nunca pânico.

| Camada | Versão-alvo | Observação |
|---|---|---|
| Framework | **Next.js 16.2.x** | linha estável atual. **NÃO 15** — é a geração anterior |
| UI | **React 19** | |
| Linguagem | **TypeScript 5.x**, `strict` | |
| Runtime | **Node 20+** | |
| Bundler | **Turbopack** | padrão na 16 |
| Deploy | **Vercel** | |
| Auth | **Supabase Auth** ou **Auth.js v5** | compatível com `proxy.ts`. **NUNCA construir auth próprio** |
| Dados (servidor) | **Server Actions** nativos | |
| Dados (cliente) | **TanStack Query v5** | |

⚠️ **Armadilha da 16:** o `middleware.ts` virou **`proxy.ts`**. Todo tutorial e toda resposta de IA treinada até a 15 vão te mandar criar `middleware.ts`. Não crie.

**Revisar quando sair o próximo major.** Esta tabela é uma decisão datada, não uma verdade eterna: quem a atualizar troca a data e diz por quê.

### 5.3 ⭐ A REGRA DE OURO DA LONGEVIDADE

> **Lógica de negócio vive em `packages/` — TypeScript puro e SQL. NUNCA em `apps/`.**
>
> **O Next.js é a PELE, não o coração. A tela consome; nunca decide.**

É a regra mais importante deste arquivo, e a mais fácil de quebrar sem perceber — basta uma validação escrita direto no Server Action "porque era mais rápido".

Onde vai cada coisa:

| Vai em `packages/` (o coração) | Vai em `apps/` (a pele) |
|---|---|
| regra de negócio, cálculo, decisão | rota, layout, componente |
| tipos e contratos (`@alsham/core`) | formulário, tabela, estado de tela |
| motor de domínio (ex.: `suggestMatches`) | Server Action que **chama** o motor |
| schema, RLS, policy, trigger | leitura e apresentação do resultado |

**Teste de bolso:** *se eu apagar `apps/` inteiro, perco alguma regra de negócio?* Se a resposta for sim, a regra está no lugar errado.

É isto — e só isto — que permite trocar o framework em 2028 sem tocar no schema nem na regra de negócio. Framework é aluguel; schema e domínio são patrimônio.

### 5.4 O que existe hoje

- `packages/config` e `packages/core` são pacotes reais. **`packages/core` é contrato puro: tipos TypeScript, zero runtime.**
- `packages/finance-reconciliation` é o **Módulo 1** — manifesto, tipos, motor de sugestão de baixa e o **parser de OFX/CSV**. Domínio puro: sem UI e sem banco.
- `packages/marketing` é o **Módulo 2** — campanhas. ⭐ **É ele que prova o Lego com dois módulos:** consome `recon.approval.decided` **sem importar o outro módulo, sem ler o schema dele e sem conhecer o correio**. Ver `docs/canon/MODULO-MARKETING-SPEC.md`.
- `packages/accounts-payable` é o **Módulo 3** — Contas a Pagar. ⭐ **É ele que fecha o TRIÂNGULO:** ele emite, e o **Módulo 1** — o mais antigo, o que ninguém escreveu para escutar — projeta o título em `recon.payables`. **Nenhuma linha do `0002_recon.sql` mudou para isso**: a tabela nasceu na Etapa 2 com `source='event'` e `source_module_id`, esperando um módulo que ainda não existia. Ver `docs/canon/MODULO-AP-SPEC.md`.
  ⚠️ O `module_id` é **`ap`**, não `accounts-payable`: o CORE-SPEC define o evento como `<moduleId>.<agregado>.<fato>` e o cinto de `emit_event()` confere esse prefixo. Com eventos em `ap.*`, qualquer outro id faria o módulo recusar os próprios eventos.
- `packages/crm` é o **Módulo 4** — Relacionamentos (CRM base): contrapartes e o histórico de contato. ⭐ **É ele que mostra o anti-viés onde ele é mais difícil:** a Taxonomia lista *WhatsApp* como capacidade do Domain, e o canal da interação é **texto livre** — congelar o instrumento de um país e de uma década numa coluna faria o produto envelhecer junto com ele. Ver `docs/canon/MODULO-CRM-SPEC.md`.
  ⚠️ **A interação é IMUTÁVEL em três camadas** (sem policy de UPDATE, sem GRANT, e um trigger que recusa até para o dono do banco). Fato consumado não se edita: corrigir é registrar outra.
  ⚠️ **O ciclo de vida dele DIFERE do `ap` de propósito:** `archived → active` existe, porque uma contraparte que volta é a MESMA pessoa e obrigá-la a nascer de novo partiria o histórico em dois. Copiar a regra do módulo anterior por consistência teria sido o erro.
- `packages/accounts-receivable` é o **Módulo 5** — Contas a Receber. ⭐ **É o ESPELHO CONSCIENTE do Módulo 3:** cada decisão do `ap` foi re-perguntada, e a resposta está escrita no cabeçalho do `0010_ar.sql` (quadro MANTIDO × DIVERGE). Ver `docs/canon/MODULO-AR-SPEC.md`.
  ⭐ **A divergência:** **receber a maior é PERMITIDO**, e o `ap` recusa pagar a maior. Pagar a mais é erro de quem paga, e o sistema que paga pode recusar; receber a mais é o que o pagador fez, e o dinheiro já está na conta — recusar obrigaria o operador a **mentir sobre o que entrou**. Há três guardas: teste de pacote que lê as duas migrations, teste SQL com os dois lados no mesmo banco, e guarda de CI contra as constraints aplicadas.
  ⭐ **`consumes` deixou de ser vazio:** escuta `recon.match.decided` (`recon-settlement.ts` + `0013`). O recon projeta `ar.*` (`0011`); o AR liquida na confirmação (`0012`/`0013`). O AP consome o mesmo evento (`0014`).
- `packages/purchase-orders` é o **Módulo 6** — Compras (Pedidos). ⭐ **`module_id` = `po`**. Domain `procurement` (Taxonomia — Compras). Pedidos + recebimento; **sem** cotação/catálogo/SKU. `consumes` **VAZIO** (integração pedido→AP declarada NÃO CONSTRUÍDA). Ver `docs/canon/MODULO-PO-SPEC.md` e `0017_po.sql`.
  ⚠️ **`consumes` é vazio, e é decisão de canon:** a conciliação de RECEBIMENTOS exigiria mudar o motor do Módulo 1, que recusa linha de crédito (`matching.ts`: `if (line.amountCents >= 0) return null;`) e cuja tabela de casamento tem `payable_id NOT NULL`. Está declarado NÃO CONSTRUÍDO com o que falta.
- `packages/ops` é o **Módulo 7** — Esteira de Produção: a empresa desenha a própria esteira de trabalho e move cada ordem de serviço por ela. ⭐ **É ele que prova que o produto não é de ninguém em particular.** Ver `docs/canon/MODULO-OPS-SPEC.md`.
  ⭐ **A LEI DAS ETAPAS: as etapas são DADO DO TENANT, jamais enum do produto.** Não existe `create type ops.stage as enum`, nem tipo com nome de etapa em `@alsham/ops` — a lei vive no pacote **por ausência**. O teste SQL escreve a esteira de uma agência (`abertura → briefing → criação → revisão → aprovação → veiculação`) e a de uma manutenção predial (`chamado → vistoria → execução`) **na mesma tabela**, sem uma linha de código diferente.
  ⚠️ **O `module_id` é `ops`, não `os`:** "OS" é uma CAMADA da Taxonomia (os 29 verticais da §6), e `os` é o artigo definido plural do idioma deste repositório — 129 ocorrências só no canon. Sol Único é a lei contra uma palavra querer dizer duas coisas.
  ⚠️ **O `domain_key` é `operations`, não `marketing`.** A etapa se chamava "Marketing Ops"; é justamente por isso. Uma construtora, uma oficina e um escritório de advocacia usam este módulo sem uma linha diferente, e a Taxonomia §5 põe *Ordens de serviço* como a primeira capacidade de 🏭 Operações.
  ⭐ **Pular é ATO REGISTRADO** — quem, quando e **por quê**, numa linha imutável da trilha. Uma etapa pulada em silêncio é indistinguível de uma cumprida.
  ⭐ **A permissão depende do DESENHO, nunca do nome:** passar de uma etapa marcada `requires_approval` exige `ops.order.decide`. O produto **não** procura a palavra "aprovação" — uma esteira em espanhol funciona igual.
  ⭐ **A divergência: `done → in_progress` EXISTE.** O `ap` tem `settled` terminal; aqui a OS concluída volta a andar. Dinheiro tem identidade por documento; **trabalho tem identidade por serviço**. `cancelled` continua terminal, e copiar ali foi decisão.
  ⚠️ **A trilha carimba o NOME da etapa** e guarda o id solto, sem FK — é a única coisa que a faz sobreviver ao redesenho da esteira. Há cenário de teste que APAGA uma etapa percorrida e confere que a história continua legível.
  ⛔ **Sem upload de arquivo, e a ausência é declarada:** *Storage & Arquivos* é capacidade do **Core** (Taxonomia §3) e está NÃO CONSTRUÍDA. `reference` é texto.
- `packages/ai` é **A FORJA — a IA Base do Core**, e **NÃO é módulo**: *Inteligência Artificial* é capacidade do Core (Taxonomia §3), escreve em `core`, **não aparece na Store**, e qualquer módulo pede geração sem conhecê-la. Ver `0019_forge.sql` e runbook §13.
  ⚖️ **A LEI DO MOTOR é estrutural, não uma lembrança:** o tipo `EngineLabel` **não tem campo** para o nome do fornecedor — a tela não teria onde pô-lo mesmo querendo. O cliente vê o **motor ALSHAM**. Nome de fornecedor só em `apps/api/src/forge-adapters.ts`, env e docs de engenharia; há guarda de CI, sabotada de três formas antes de entrar.
  ⛔ **SEM MEDIÇÃO, SEM GERAÇÃO — o botão nem aparece.** Sem teto declarado para `ai-generations-per-month`, `checkLimit()` nega por omissão e a seção explica em vez de prometer. Geração que não vira linha no `usage_ledger` é custo invisível.
  ⛔ **O prompt NUNCA vai ao envelope.** O fato carrega o tamanho do prompt, nunca o texto — nem o que a marca proíbe, nem qual adaptador respondeu.
  ⚠️ **A geração é SÍNCRONA nesta etapa**, e está escrito por quê. Se um dia for assíncrona, a fila é o **correio do Core** — jamais uma segunda.
  ⚠️ **O modo demonstração se liga por `ALSHAM_FORGE_DEMO`, e só por ela** — nunca deduzido de "a chave está faltando". A linha nasce com `is_mock` (minerado do `usage_ledger` do kraken-v2) e fica **fora da conta**.
- **O PAINEL EXECUTIVO** (`apps/portal/src/app/page.tsx` + `0021_tenant_panel.sql`) é a home do tenant. **Core, não módulo:** sem manifesto, fora do catálogo. **Zero número decorativo** — cada um sai de um `count()` ou de `core.plan_limits`.
- ⭐⭐ **O INSIGHT PROATIVO** (`core.tenant_insights` + `0116_tenant_insights.sql`; `runInsightOnce` no `apps/api`; observador puro em `packages/engineer`) é **a primeira prova de cognição que age SEM ser provocada** — a PRÓXIMA AÇÃO PUBLICÁVEL que o `MEMORANDO-DIVISAO-DE-AGUAS` cobra. **Core, não módulo** (como o Painel/Forja): sem manifesto, fora da Store. O observador agendado (cron do `0117`, comentado) lê os recebíveis VENCIDOS que já existem, o motor puro decide se há aviso (⛔ **nunca inventa número; zero vencidos não é aviso; sem leitura ≠ zero**), e grava em `core.tenant_insights` — o quadro que o Painel lê. ⭐ **A frase é DETERMINÍSTICA** (a Forja/voz-de-marca seria refino futuro, medido à parte — o aviso do 0019 vale). ⭐ **Recompute-e-substitui:** problema resolvido some do quadro (não mente sobre o hoje). ⛔ Escreve só o `service_role` (record/clear); lê só o próprio tenant (o vínculo checado, molde do 0021); a tabela nua é fechada. ⚠️ O `apps/api` ganhou `@alsham/engineer` como dependência.
  - ⭐⭐ **DO AVISADOR AO ANALISTA** (`core.tenant_insight_history` + `0118_tenant_insight_history.sql`): o `tenant_insights` (0116) é recompute-e-substitui — não guarda rastro, então não dá pra comparar. O `tenant_insight_history` é o OPOSTO: **livro append-only, IMUTÁVEL em 2 camadas** (nem o dono edita/apaga; a física do `crm`/`pcost`/`timesheet`), uma linha por (tenant, tipo, recorte) a cada rodada. É a **memória-além-da-janela** (o mecanismo mais barato do `design-report/pesquisa-agentes-2026.md`): o motor puro ganha um 2º parâmetro (a **média das leituras recentes**, CONTADA do livro por `core.insight_history_baseline`, só `service_role`) e a frase passa de "3 vencidos" para "3 vencidos — 40% acima da média recente (2 nas últimas 5 leituras)" — os **dois números reais expostos**, nunca cálculo escondido (Lei 7). ⛔ **"Devedor repetido" fica DECLARADO FORA:** o `ar.receivables` não tem vínculo estruturado com o `crm` (sem `party_id`; só `payer_name`/`counterparty_tax_id` opcionais em texto livre) — não se inventa coluna pra viabilizar. Escopo pequeno de propósito: UM mecanismo (tendência agregada), não enxame/framework/debate.
  ⛔ **`core.courier_status()` continua FECHADA.** Ela conta a fila inteira da plataforma; concedê-la ao tenant contaria o volume de negócio do vizinho. O Painel lê `core.tenant_courier_summary()`: o veredito em texto, os números só deste tenant.
  ⚠️ **Nunca inventa "OK".** Leitura que falha diz que falhou — veredito falso é pior do que veredito nenhum, porque faz quem opera parar de olhar.
- ⭐ **A MISSÃO TRINA entregou os Módulos 8–12 num PR só, um commit por módulo** (migrations `0023`–`0027`, ARQUIVO — apply do dono, runbook §16):
  - `packages/inventory` é o **Módulo 8 — Estoque** (`inv`, Domain `operations`): o estoque é LIVRO de movimentos imutável; o saldo é view com `security_invoker`, nunca coluna. ⭐ **Saldo NEGATIVO é permitido** (o overpay do `ar` re-perguntado para o físico); o AJUSTE exige razão E permissão própria. Ver `MODULO-INV-SPEC`.
  - `packages/quotes` é o **Módulo 9 — Propostas** (`quote`, Domain `crm`, capacidades *Propostas* e *Orçamentos*): identidade por DOCUMENTO — a mesa congela o conteúdo após o envio, aceite/recusa carimbam quem/quando pelo servidor, e os quatro fins são terminais. Expirar só com validade vencida. Ver `MODULO-QUOTE-SPEC`.
  - `packages/deals` é o **Módulo 10 — Funil Comercial** (`deal`, Domain `crm`, capacidade *Pipeline*): a Lei das Etapas, SEGUNDA aplicação — estágios do tenant, movimento LIVRE com trilha imutável, `won`/`lost` terminais com razão obrigatória na perda. ⭐ O vínculo com o crm é ID SOLTO + nome carimbado — nunca FK (a guarda da matriz reprovaria). Ver `MODULO-DEAL-SPEC`.
  - `packages/event-management` é o **Módulo 11 — Eventos** (`evt`, Domain `marketing`, capacidade *Eventos*): o evento UNIVERSAL, não o vertical. ⚠️ **`module_id` é `evt`, nunca `event`/`events`** — "evento" já é vocabulário do Core (Sol Único). Lotação recusa claro; presença é ato carimbado; publicado não volta a rascunho. Ver `MODULO-EVT-SPEC`.
  - `packages/dunning` é o **Módulo 12 — Régua de Cobrança** (`dun`, Domain `finance`, capacidade *Cobrança*): ⭐⭐ **o quarto consumidor** — projeta `ar.receivable.*` (padrão E10, `envelope.producedBy`), a baixa na origem tira o título da régua SOZINHA, e executar passo é ato carimbado. A régua é desenho do tenant (Lei das Etapas, terceira aplicação), UMA ativa por tenant. ⚠️ **O módulo NÃO ENVIA nada** — e `dun` cobra o cliente do tenant; `billing` cobra o tenant. Ver `MODULO-DUN-SPEC`. ⚠️ Exige REDEPLOY do `apps/api` no apply.
- ⭐ **A MISSÃO QUADRA entregou os Módulos 13–17 num PR só, um commit por módulo** (migrations `0028`–`0032`, ARQUIVO — apply do dono, runbook §17), a Onda 1 de 6 da campanha aprovada pelo dono em 30/07/2026:
  - `packages/contracts` é o **Módulo 13 — Contratos** (`ctr`, Domain `legal`): ⭐ **o termo vigente NÃO é coluna** — os termos originais congelam em vigor e o vigente é calculado dos ATOS imutáveis (reajuste com índice TEXTO LIVRE e sem cálculo; renovação que estende o MESMO contrato — o DIVERGE consciente do `quote`). Encerrar é calendário; rescindir exige razão. ⚠️ `module_id` é `ctr`, nunca `contract` — "contrato" é vocabulário do CORAÇÃO do canon (Sol Único). Ver `MODULO-CTR-SPEC`.
  - `packages/cashflow` é o **Módulo 14 — Fluxo de Caixa** (`cash`, Domain `finance`): o livro do `inv` NO DINHEIRO — lançamentos imutáveis, sinal do TIPO, categoria como DADO DO TENANT (sem categoria é permitido e honesto), saldo sempre view. ⭐ **CAIXA realizado: o FUTURO é recusado** (previsão é Orçamento — o DIVERGE consciente do `inv`, com teste de contraste). ⭐ `consumes` vazio pela **decisão contra a DUPLA CONTAGEM** (três portas para o mesmo dinheiro sem regra de exclusividade de fonte). Ver `MODULO-CASH-SPEC`.
  - `packages/care` é o **Módulo 15 — Atendimento** (`care`, Domain `cx`): ⭐ **a TERCEIRA identidade** — o caso reabre de `resolved` (o pedido é o mesmo — o argumento do `ops`) mas `closed` é terminal (o argumento do `quote`); teste EXIGE o contraste TRIPLO. Categoria E prioridade são dado do tenant (a prioridade com POSIÇÃO — a fila é `orderTickets()` do pacote); a conversa é imutável em 3 camadas; resolver carimba pelo servidor e reabrir LIMPA o carimbo. Ver `MODULO-CARE-SPEC`.
  - `packages/occurrences` é o **Módulo 16 — Ocorrências** (`occ`, Domain `operations`): ⭐⭐ **a outra física, de propósito** — a ocorrência é FATO CONSUMADO: o registro NASCE imutável (nem o dono do banco reescreve o relato; corrigir é TRATATIVA em linha eterna), o encerramento exige DESFECHO escrito e é terminal, o futuro é recusado. Gravidade é dado do tenant com posição. Teste EXIGE o contraste care×occ. Ver `MODULO-OCC-SPEC`.
  - `packages/maintenance` é o **Módulo 17 — Manutenção** (`mnt`, Domain `operations`): ⭐ corretiva/preventiva é **CHECK argumentado** (física do domínio, não vocabulário de casa); `done → in_progress` **MANTIDO do ops com teste que ASSINA a decisão** (manutenção é trabalho); recorrência do tenant com a **PRÓXIMA DEVIDA calculada** (identidade da rotina = título+alvo carimbados; sem cron fingido — gerar ordem por relógio é futuro declarado); concluir exige o relato. Vínculo com o futuro Patrimônio (Onda 2) já nasce SOLTO (`asset_id`). Ver `MODULO-MNT-SPEC`.
- ⭐ **A MISSÃO PENTA entregou os Módulos 18–22 num PR só, um commit por módulo** (migrations `0033`–`0037`, ARQUIVO — apply do dono, runbook §18), a Onda 2 de 6 da campanha:
  - `packages/assets` é o **Módulo 18 — Patrimônio** (`pat`, Domain `operations`): ⭐ **a localização vigente NÃO é coluna** — o termo vigente do `ctr` re-perguntado para o LUGAR: o cadastro congela a original; mudar de lugar é ATO em livro imutável com o "de onde" carimbado pelo SERVIDOR (o digitado é descartado); a vigente é view calculada (`security_invoker`). ⭐ **A BAIXA É TERMINAL** — o DIVERGE consciente do `crm` (a contraparte volta; o bem baixado é aquisição nova), com razão obrigatória e teste que assina o contraste. A ponte do `mnt` (`asset_id`) continua SOLTA. ⚠️ o evento da baixa é `pat.asset.retired` — o formato do outbox recusa underscore no fato. Ver `MODULO-PAT-SPEC`.
  - `packages/checklists` é o **Módulo 19 — Checklists** (`chk`, Domain `operations`): ⭐ **executar CONGELA o modelo por CÓPIA, pelo gatilho** (o quote re-perguntado: o documento congela no envio; a inspeção, na ABERTURA — por valor, sem FK para o item de origem; o redesenho nunca alcança a história). ⭐ **A resposta dada NÃO SE RASURA** (física do occ, item a item; corrigir é abandonar com razão e executar de novo); `ok/not_ok/not_applicable` é CHECK argumentado (física da inspeção); **concluir exige tudo respondido** (o gatilho conta) e os dois fins são terminais. A prancheta não tem grant de INSERT: quem a escreve é o gatilho. Ver `MODULO-CHK-SPEC`.
  - `packages/spaces` é o **Módulo 20 — Reserva de Espaços** (`spc`, Domain `operations`, a leitura universal de *Facilities*): ⭐ **a física mora na CONSTRAINT** — EXCLUSION (gist, `btree_gist` criado na migration, argumentado) sobre (espaço, período), meio-aberto, **PARCIAL**: a cancelada libera o período SOZINHA. ⭐ **Reserva no PASSADO é PERMITIDA** — o DIVERGE consciente do `cash` (registrar o uso ocorrido é fato consumado; a agenda que recusa o passado mente sobre a ocupação), assinado em teste. Cancelar exige razão e é terminal; o ESPAÇO volta do arquivo (o argumento do crm). Ver `MODULO-SPC-SPEC`.
  - `packages/visits` é o **Módulo 21 — Visitas** (`vis`, Domain `operations` — a portaria é operação; a *Visitas* do CRM é a do vendedor, e o homônimo está declarado): ⭐ **a QUARTA identidade** — a visita é o EVENTO DE PRESENÇA e NÃO volta de fim nenhum (contraste triplo crm×care×vis assinado em teste); os dois carimbos são do SERVIDOR (a hora digitada é descartada); check-out sem check-in não existe; depois do check-in o registro CONGELA — corrigir é registro novo apontando o errado. ⭐ **O documento não passeia pelo correio** (envelope sem `visitor_document`/`visitor_contact`, provado no payload real + guarda de CI). ⛔ Lista negra fora POR LEI (LGPD). Ver `MODULO-VIS-SPEC`.
  - `packages/leads` é o **Módulo 22 — Leads** (`lead`, Domain `crm`, capacidade *Leads*): ⭐ **a QUINTA identidade** — o lead é a MANIFESTAÇÃO DE INTERESSE, um evento comercial datado com ORIGEM PRÓPRIA (texto livre — a lição do canal do crm valendo dobrado): `qualified`/`discarded` TERMINAIS (quem volta é lead novo, com origem nova), com a volta à fila permitida (`in_contact → new`). ⭐ Qualificar carimba VÍNCULOS SOLTOS (`party_id`+nome, `opportunity_id`+título) pela TELA, nunca por evento (Lei 7); constraint recusa vínculo na fila viva. Descartar exige razão (deal.lost, assinado). O contato não passeia pelo correio. Ver `MODULO-LEAD-SPEC`.
- ⭐ **A MISSÃO SEXTA entregou os Módulos 23–27 num PR só, um commit por módulo** (migrations `0038`–`0042`, ARQUIVO — apply do dono, runbook §19), a Onda 3 de 6 da campanha:
  - `packages/goals` é o **Módulo 23 — Metas** (`goal`, Domain `bi` — o bloco da LEITURA do negócio, com os homônimos CRM·Metas e RH·OKRs declarados e ancorados em teste): ⭐ **o progresso é o ÚLTIMO check-in do livro — view, nunca coluna**; a trave CONGELA na ativação; check-in só em meta ATIVA (o sistema não mede nada sozinho — quem reporta é gente); fechar a época é decisão carimbada que EXIGE ≥1 check-in (sem número na mesa é achismo); os três fins terminais. Ver `MODULO-GOAL-SPEC`.
  - `packages/comms` é o **Módulo 24 — Comunicados** (`comm`, Domain `hr` — o mural fala com MEMBROS; o vertical Condomínios nomeia o recorte): ⭐ **publicar CONGELA a palavra dada** (e exige corpo); corrigir é comunicado NOVO com o título do antigo carimbado pelo SERVIDOR; ⭐ **a ciência é ato PRÓPRIO (o gatilho força auth.uid), ÚNICO (unique) e ETERNO** — e só o publicado a recebe (rascunho não comunicou; arquivado saiu do mural, e archived é terminal). O corpo não passeia no envelope. Ver `MODULO-COMM-SPEC`.
  - `packages/editorial` é o **Módulo 25 — Calendário Editorial** (`edcal`, Domain `marketing`, capacidade *Calendário*): canal como TABELA do tenant (volta do arquivo); ⭐ **a Lei das Etapas na QUARTA aplicação** — e o DIVERGE assinado do ops: `requires_approval` NÃO veio (guarda de CI barra a volta). ⭐ **Reagendar é UPDATE honesto SEM trilha** (o calendário é plano; a trilha é dos FATOS) — a honestidade mora no PAR planned_on × published_at, com a data real do servidor; os dois fins terminais e congelados. Ver `MODULO-EDCAL-SPEC`.
  - `packages/media` é o **Módulo 26 — Biblioteca de Mídia** (`media`, Domain `marketing`, capacidade *Mídia*): ⭐ **CATÁLOGO, não cofre** — o Storage do Core não existe e o módulo não finge: o ativo diz ONDE a obra vive (texto livre, pronto para o Storage futuro sem migration corretiva). ⭐ **O acervo VOLTA do arquivo — o DIVERGE assinado do pat** (identidade de OBRA × identidade fiscal, teste de contraste pat×crm×media); o uso é LIVRO imutável com vínculo SOLTO; etiquetas N:N do tenant com as únicas portas de DELETE (metadado vivo). Ver `MODULO-MEDIA-SPEC`.
  - `packages/nps` é o **Módulo 27 — Pesquisas** (`nps`, Domain `cx`, capacidade *Pesquisas NPS/CSAT*): ⭐ **a régua 0–10 é CHECK argumentado** — física do MÉTODO, a segunda da onda (precedente: mnt), com a pergunta em texto do tenant e ABRIR que a congela; ⭐ **o placar é VIEW calculada do livro** (%promotores − %detratores) e pesquisa sem resposta NÃO tem linha (Lei 7); ⭐ **closed é TERMINAL — o DIVERGE assinado do care** (a rodada que volta é pesquisa nova); ⛔ **ANON = NADA, sem exceção** (o link público é integração futura via API com chave, padrão Forja) — provado com o papel `anon` no teste. Ver `MODULO-NPS-SPEC`.
- ⭐ **A MISSÃO SETE entregou os Módulos 28–32 num PR só, um commit por módulo** (migrations `0043`–`0047`, ARQUIVO — apply do dono, runbook §20), a Onda 4 de 6 da campanha — **o Bloco Financeiro**:
  - `packages/cost-centers` é o **Módulo 28 — Centros de Custo & Rateio** (`cc`, Domain `finance`): ⭐ **a regra fecha 100% ao ativar, e isso é FÍSICA** (constraint por gatilho, 10000 pontos-base); o centro é dado do tenant e volta do arquivo; ⭐ **executar é ATO DE GENTE** (sem cron), gera lançamentos imutáveis (um por centro, o resto ao último — cent nenhum se perde), com a origem por ID SOLTO + nome carimbado. `consumes` vazio. Ver `MODULO-CC-SPEC`.
  - `packages/budgets` é o **Módulo 29 — Orçamentos** (`bud`, Domain `finance`): ⭐ **ativar CONGELA a trave** (categoria, período, teto) — o MANTIDO assinado do goal no dinheiro; período fechado terminal. ⭐⭐ **o realizado é VIEW calculada do livro do cash, NUNCA coluna** — e nasce do consumo de `cash.entry.registered` (o QUINTO consumidor, handler `realized.ts`). ⚠️ EXIGE redeploy do `apps/api`. Ver `MODULO-BUD-SPEC`.
  - `packages/bank-accounts` é o **Módulo 30 — Contas Bancárias** (`bank`, Domain `finance`): ⭐ **SOL ÚNICO: a conciliação é do recon — NÃO se refaz** (é o cadastro de contas + livro por conta, a capacidade *Bancos* que o cash deixou de fora). ⭐⭐ **o saldo é VIEW e PODE ser negativo (cheque especial) — o DIVERGE assinado do inv**; a transferência é ATÔMICA (duas pernas, um transfer_id, uma transação). `consumes` vazio. Ver `MODULO-BANK-SPEC`.
  - `packages/investments` é o **Módulo 31 — Investimentos** (`invest`, Domain `finance`): ⭐ **a posição é a soma dos atos (VIEW), SEM cotação de mercado** (Lei 3/7 — o rendimento é ato de gente, não taxa). ⭐⭐ **resgatar mais que a posição é RECUSADO — a TERCEIRA resposta, assinada** (o `ar` permite overpay, o `inv` permite negativo, o `invest` recusa; teste lê as três migrations). `consumes` vazio. Ver `MODULO-INVEST-SPEC`.
  - `packages/dre` é o **Módulo 32 — DRE Gerencial** (`dre`, Domain `finance`): ⛔ **gerencial, NÃO fiscal (Lei 3 garrafal)** — SPED/ECD/ECF são integração. O plano de linhas é do tenant (a natureza receita/custo/despesa é o ÚNICO enum, CHECK argumentado). ⭐⭐ **os valores nascem dos livros: `consumes` cash.entry.registered E cc.rateio.executed — o SEXTO consumidor e o PRIMEIRO com DOIS produtores** (handler `realized.ts`, duas inscrições, mesmo consumer id, padrões disjuntos). ⚠️ EXIGE redeploy do `apps/api`. ⭐ Linha sem lançamento NÃO aparece (INNER JOIN, a lição do nps); totais são VIEWS. Ver `MODULO-DRE-SPEC`.
- ⭐ **A MISSÃO OITO entregou os Módulos 33–37 num PR só, um commit por módulo** (migrations `0048`–`0052`, ARQUIVO — apply do dono, runbook §21), a Onda 5 de 6 da campanha — **o BLOCO DE PESSOAS (Domain RH)**. ⚠️ **Dado de pessoa física:** o NOME é neutro (texto livre); ⛔ **zero CPF, saúde ou banco** — Folha e Benefícios ficam DECLARADOS FORA. Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`:
  - `packages/hr` é o **Módulo 33 — Cadastro de Colaboradores** (`hr`, Domain `hr`): cargo/departamento TEXTO LIVRE (nunca enum). ⭐ **`on_leave` volta; `terminated` é TERMINAL — o DIVERGE do crm** (quem retorna assina contrato novo: admissão nova, registro novo, com vínculo SOLTO ao anterior); desligar exige razão E `hr.employee.decide`. Contraste interno assinado: dois "parar", uma só definitiva. Ver `MODULO-HR-SPEC`.
  - `packages/shift-scheduling` é o **Módulo 34 — Escalas** (`shift`, Domain `hr`): turno TEXTO LIVRE; vínculo com `hr` por id SOLTO + nome carimbado pela tela. ⭐ **A física do `spc` reaproveitada para a PESSOA:** EXCLUSION (gist) sobre (colaborador, período), meio-aberto, PARCIAL — a cancelada libera sozinha. ⭐ **Passado permitido — o DIVERGE do cash**, assinado. Cancelar exige razão E `shift.schedule.decide`. Ver `MODULO-SHIFT-SPEC`.
  - `packages/training` é o **Módulo 35 — Treinamentos** (`train`, Domain `hr`): programas + turmas + inscrições. ⭐ **A identidade do `evt` aplicada ao treino:** turma publicada abre inscrição, lotação recusa clara, presença é ato IMUTÁVEL carimbado pelo servidor; turma concluída/cancelada terminal. Colaborador por id solto. ⛔ Certificado (Storage do Core) declarado FORA. Ver `MODULO-TRAIN-SPEC`.
  - `packages/performance` é o **Módulo 36 — Avaliação de Desempenho** (`perf`, Domain `hr`): ⭐ **NÃO é o goal — avaliador × avaliado, dois papéis** (o goal mede a PRÓPRIA ambição com check-in; perf é o julgamento de OUTRA pessoa). Ciclo TEXTO LIVRE; a avaliação é ato IMUTÁVEL com o avaliador carimbado pelo servidor; o ciclo fechado é TERMINAL. OKRs estruturados FORA. Ver `MODULO-PERF-SPEC`.
  - `packages/policies` é o **Módulo 37 — Políticas** (`pol`, Domain `hr` — a *Políticas* de GRC é o HOMÔNIMO declarado): ⭐⭐ **o DIVERGE do `comm`: política tem VERSÃO — a ciência é por (política, versão)**, então versão nova exige ciência de novo (unique `version_id,user_id`). Publicar CONGELA o corpo; versão arquivada terminal (o congelamento do quote); a ciência é ato próprio, único por versão e eterno. Ver `MODULO-POL-SPEC`.
- ⭐ **A MISSÃO NOVE entregou os Módulos 38–42 num PR só, um commit por módulo** (migrations `0053`–`0057`, ARQUIVO — apply do dono, runbook §22), a **Onda 6 de 6 — a ÚLTIMA da campanha**, e o **primeiro bloco VERTICAL** do catálogo (`vertical_key='shopping-centers'`, a `VerticalKey` do `@alsham/core`). ⚠️ **Lei do Reaproveitamento (Taxonomia §9):** verticais reutilizam os Domains genéricos — camada fina, vínculo por ID SOLTO + nome carimbado, nunca FK cruzada, nunca reescreve a física do genérico. Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`:
  - `packages/mall` é o **Módulo 38 — Gestão de Lojistas** (`mall`, Vertical `shopping-centers`): o PRIMEIRO cartão vertical. Segmento TEXTO LIVRE; a unidade física por id solto ao `spc` (não recria cadastro de espaço). ⭐ **`active ↔ archived` — o DIVERGE do `hr`** (o lojista é relação comercial que volta, mais perto do crm/spc). Ver `MODULO-MALL-SPEC`.
  - `packages/lease` é o **Módulo 39 — Locação de Lojistas** (`lease`, Vertical): ⭐⭐ **CAMADA COMERCIAL sobre o `ctr` — não o reescreve** (vigência/reajuste/renovação são do `ctr`, por id solto). Registra o termo comercial sobre vendas (texto livre) e o relatório mensal de vendas (ato imutável, sem POS). Ver `MODULO-LEASE-SPEC`.
  - `packages/fund` é o **Módulo 40 — Fundo de Promoção** (`fund`, Vertical): livro próprio (autossuficiente — não importa o `cc`; física duplicada de propósito, como spc→shift). ⭐⭐ **O saldo NUNCA fica negativo — a TERCEIRA resposta ao "pode ficar negativo?"** (o `bank` permite, o `inv` permite, o `fund` RECUSA: dinheiro coletivo de terceiros). Ver `MODULO-FUND-SPEC`.
  - `packages/park` é o **Módulo 41 — Estacionamento** (`park`, Vertical): ⭐ **a identidade do `vis`** — veículo NEUTRO (placa texto livre), entrada e saída carimbadas pelo SERVIDOR, correção é registro novo. Tarifa opcional em texto; sem cálculo de tarifa. Ver `MODULO-PARK-SPEC`.
  - `packages/sec` é o **Módulo 42 — Segurança / Rondas** (`sec`, Vertical) — ⭐ **a ÚLTIMA peça (42/42)**: ⭐⭐ **NÃO reescreve o `occ`** (o incidente É uma Ocorrência, que já existe); este módulo é só a RONDA — postos do tenant e o livro de rondas (ato pontual imutável). Ver `MODULO-SEC-SPEC`.
- ⭐⭐ **A CAMPANHA DAS 6 ONDAS ESTÁ COMPLETA (30/07/2026): 42/42 módulos publicados** — 37 Domain + 5 Vertical. É a meta que orientou a apresentação desde o começo.
- ⭐ **A ONDA DEZ (Fase 2 — rumo aos 100 módulos) entregou os Módulos 43–47 num PR só, um commit por módulo** (migrations `0058`–`0062`, ARQUIVO — apply do dono, runbook §23): completa o **Domain Compras** (`procurement`), que até aqui só tinha o `po`. Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 42 para **47 módulos publicados**.
  - `packages/vendor` é o **Módulo 43 — Fornecedores** (`vendor`, Domain `procurement`): nome e segmento TEXTO LIVRE; ⭐ **`active ↔ archived` — o DIVERGE do `hr`** (o fornecedor é relação comercial que volta; o desligamento do `hr` é terminal). Homologação/certificação FORA. Ver `MODULO-VENDOR-SPEC`.
  - `packages/rfq` é o **Módulo 44 — Cotações** (`rfq`, Domain `procurement`): reaproveita a identidade do `quote` (enviar CONGELA o conteúdo). ⭐ **O DIVERGE assinado: o destino é PREMIADA (`awarded`) — quem decide é o COMPRADOR, não o cliente** (o `quote` tem `sent→accepted`; a RFQ tem `open→awarded`). ⚠️ o evento da abertura é `rfq.request.opened` (o outbox exige verbo no passado terminando em `ed`). Ver `MODULO-RFQ-SPEC`.
  - `packages/recv` é o **Módulo 45 — Recebimento** (`recv`, Domain `procurement`): ato pontual IMUTÁVEL (carimbado pelo servidor). ⭐ **Receber a maior é PERMITIDO — a física do overpay do `ar`, re-perguntada para a mercadoria** (contraste `recv × ar` assinado; a imutabilidade prova as DUAS camadas: cliente sem porta, dono barrado pelo gatilho). Vínculo com o `po` por id solto. Ver `MODULO-RECV-SPEC`.
  - `packages/vperf` é o **Módulo 46 — Avaliação de Fornecedores** (`vperf`, Domain `procurement`): reaproveita a identidade do `perf` (avaliador carimbado × avaliado). ⭐ **O DIVERGE assinado: SEM ciclo** — ato pontual imutável, a física do `sec.patrols`, não a do `perf.cycles`; nota 0–100 obrigatória (CHECK). Ver `MODULO-VPERF-SPEC`.
  - `packages/reorder` é o **Módulo 47 — Estoque Mínimo** (`reorder`, Domain `procurement`): ⭐⭐ **guarda SÓ a configuração e NÃO lê o `inv` por dentro** (módulo não conhece módulo — guarda de CI no mapa SCHEMA_DE reprova `inv.` na migration). A comparação "estoque < mínimo" é da CAMADA DE APRESENTAÇÃO (`needsReorder()`/`flagLowStock()`), alimentada com o saldo de FORA. `active ↔ archived`. Ver `MODULO-REORDER-SPEC`.
- ⭐ **A ONDA ONZE (Fase 2) entregou os Módulos 48–52 num PR só, um commit por módulo** (migrations `0063`–`0067`, ARQUIVO — apply do dono, runbook §24): abre o **Domain Supply Chain** (`supply-chain`), território SEPARADO de Compras (Taxonomia §5). Duas das sete capacidades ficam FORA por anti-duplicação: **Cadeia de fornecimento** (= `vendor`) e **Abastecimento** (= `reorder` + `po`). Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 47 para **52 módulos publicados**.
  - `packages/dem` é o **Módulo 48 — Planejamento de Demanda** (`dem`, Domain `supply-chain`): plano por período (texto livre) + linhas; PUBLICAR congela as linhas (a identidade do `rfq`/`quote`). ⭐ **O DIVERGE do `rfq`: `published` é TERMINAL** — não há segundo ato (nada de premiar); o próximo período é plano novo (a física do `bud`). Previsão estatística (Engine de IA) e vendas históricas FORA. Ver `MODULO-DEM-SPEC`.
  - `packages/sop` é o **Módulo 49 — S&OP / Rodadas de Consenso** (`sop`, Domain `supply-chain`): ⭐ **a CAMADA DE GOVERNANÇA sobre o plano** — referencia um plano do `dem` por ID SOLTO + nome (nunca FK cruzada; guarda SCHEMA_DE reprova `dem.`). APROVAR congela e é terminal; a permissão `sop.round.approve` é PRÓPRIA (aprovar o consenso é decisão de outro papel, mais sênior que quem desenha o plano). Reconciliação automática de áreas FORA. Ver `MODULO-SOP-SPEC`.
  - `packages/dc` é o **Módulo 50 — Centros de Distribuição** (`dc`, Domain `supply-chain`): nome + endereço em texto livre; ⭐ **`active ↔ archived` — o DIVERGE do `hr`** (o CD é ativo de operação que volta; o desligamento do `hr` é terminal). Volumetria/zoneamento FORA. Ver `MODULO-DC-SPEC`.
  - `packages/disp` é o **Módulo 51 — Distribuição / Despacho** (`disp`, Domain `supply-chain`): ⭐ **o ESPELHO INVERTIDO do `recv`** — se o `recv` é o livro de CHEGADA, o `disp` é o de SAÍDA: mesma física de ATO PONTUAL IMUTÁVEL (duas camadas — cliente sem porta, gatilho até para o dono), sem ciclo. Origem por ID SOLTO ao `dc` (guarda SCHEMA_DE reprova `dc.`). Ver `MODULO-DISP-SPEC`.
  - `packages/logperf` é o **Módulo 52 — Performance Logística** (`logperf`, Domain `supply-chain`): reaproveita a identidade do `vperf` (ato pontual imutável, nota 0–100 obrigatória). ⭐ **O DIVERGE: o avaliado é ROTA/TRANSPORTADORA/CD em TEXTO LIVRE** + id solto opcional ao `dc` (não um fornecedor). Ver `MODULO-LOGPERF-SPEC`.
- ⭐ **A ONDA DOZE (parte 1/2, Fase 2) entregou os Módulos 53–57 num PR só, um commit por módulo** (migrations `0068`–`0072`, ARQUIVO — apply do dono, runbook §25): abre o **Domain PMO & Projetos** (`pmo`), o MAIOR do mapa (10 capacidades). Esta onda cobre as 5 primeiras (Projetos · Cronogramas · Kanban · Recursos · Custos); a Onda Treze cobre as outras 5. Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 52 para **57 módulos publicados**.
  - `packages/proj` é o **Módulo 53 — Projetos** (`proj`, Domain `pmo`): ciclo `planning → active → completed/cancelled`, os dois fins TERMINAIS (a física do `bud`/`dem` — o projeto encerrado não reabre). ⭐ A assimetria assinada: cancelar exige razão; concluir tem nota opcional. Orçamento consolidado (é o `pcost`) e aprovação de abertura FORA. Ver `MODULO-PROJ-SPEC`.
  - `packages/sched` é o **Módulo 54 — Cronogramas** (`sched`, Domain `pmo`): marcos vinculados ao `proj` por id solto. ⭐ **O DIVERGE do `dem`/`bud`: reabrir (`done→planned`) É PERMITIDO** — corrigir um marco concluído por engano é rotina do projeto, não reabertura de período fechado (contraste assinado). Ver `MODULO-SCHED-SPEC`.
  - `packages/kanban` é o **Módulo 55 — Kanban / Quadro de Tarefas** (`kanban`, Domain `pmo`): ⭐⭐ **reaproveita a física do `ops`** (estágios do tenant + card que se move), mas com ESCOPO diferente — o card pertence a um PROJETO específico (`proj` por id solto, obrigatório). NÃO é "instalar o `ops` de novo" (a lição do `disp`/`recv`, escrita). Guarda SCHEMA_DE reprova `proj.`. Ver `MODULO-KANBAN-SPEC`.
  - `packages/alloc` é o **Módulo 56 — Recursos / Alocação** (`alloc`, Domain `pmo`): alocação ao `proj` por id solto; o recurso em texto livre + id solto OPCIONAL ao `hr` (terceiro/freelancer não tem cadastro). ⭐ Percentual, não horas (decisão assinada: horas puxariam um calendário que o módulo não modela). `active ↔ archived` (a física do `vendor`/`dc`). Ver `MODULO-ALLOC-SPEC`.
  - `packages/pcost` é o **Módulo 57 — Custos do Projeto** (`pcost`, Domain `pmo`): livro IMUTÁVEL (duas camadas — a lição da Onda Dez desde o início) de gastos do projeto (`proj` por id solto), valor + moeda, categoria texto livre opcional (o `cash` sem categoria). ⭐ **O DIVERGE do `fund`: NÃO há teto de saldo** — é só o livro; o orçamento é o `bud` genérico por id solto (futuro). Ver `MODULO-PCOST-SPEC`.
- ⭐⭐ **A ONDA TREZE (parte 2/2, Fase 2) entregou os Módulos 58–62 num PR só, um commit por módulo** (migrations `0073`–`0077`, ARQUIVO — apply do dono, runbook §26): **FECHA o Domain PMO & Projetos** (`pmo`) — com ela o MAIOR do mapa passa a ter as **10 capacidades COMPLETAS (módulos 53–62)**. Cobre as 5 restantes (Scrum · Gantt · Riscos · Timesheet · Portfólio). Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 57 para **62 módulos publicados**.
  - `packages/scrum` é o **Módulo 58 — Scrum / Sprints** (`scrum`, Domain `pmo`): a MOLDURA TEMPORAL (time-box) — nome/objetivo texto livre, janela, vínculo ao `proj` por id solto. ⭐⭐ **UM sprint ativo por projeto — na CONSTRAINT** (índice único parcial, a lição do `spc`/`shift`). ⭐ `closed` é TERMINAL (a física do `bud`/`proj`). ⭐ **A RESSALVA DE HONESTIDADE assinada:** os itens de trabalho são os cartões do `kanban` — este módulo NÃO os reconstrói; a composição "os cartões deste sprint" é de TELA, não de schema. Ver `MODULO-SCRUM-SPEC`.
  - `packages/gantt` é o **Módulo 59 — Gantt / Dependências entre marcos** (`gantt`, Domain `pmo`): a ARESTA predecessor→sucessor, id solto ao `sched` (guarda SCHEMA_DE reprova `sched.`). ⭐ **O DIVERGE assinado: registro MUTÁVEL** (a dependência é metadado do plano — some quando o plano muda, ao contrário dos livros imutáveis `recv`/`pcost`/`timesheet`). O tipo de dependência é CHECK argumentado (os 4 clássicos — física, não vocabulário). ⛔ Sem cálculo de caminho crítico/datas (FORA). Ver `MODULO-GANTT-SPEC`.
  - `packages/risk` é o **Módulo 60 — Riscos** (`risk`, Domain `pmo`): registro de riscos do projeto (`proj` por id solto); probabilidade e impacto **1–5 CHECK** (física do método, a lição do `nps`/`vperf`). ⭐⭐ **Física NOVA assinada: `mitigated` REABRE (`mitigated→open`), mas `closed` é TERMINAL** — o risco que volta é o MESMO (reabre e limpa o carimbo de mitigação); o encerrado que recorre é registro novo. Contraste vs os fins todo-terminais do `proj`. Ver `MODULO-RISK-SPEC`.
  - `packages/timesheet` é o **Módulo 61 — Timesheet / Apontamento de horas** (`timesheet`, Domain `pmo`): livro IMUTÁVEL (duas camadas — a física do `pcost`/`recv` desde o instante 1) de horas trabalhadas (`proj` por id solto; colaborador texto livre + id solto OPCIONAL ao `hr`), `hours > 0` CHECK. ⭐ **O contraste assinado: timesheet (REALIZADO — fato consumado) × `alloc` (PLANEJADO — percentual/previsão).** Ver `MODULO-TIMESHEET-SPEC`.
  - `packages/pfolio` é o **Módulo 62 — Portfólio** (`pfolio`, Domain `pmo`) — ⭐⭐ **a ÚLTIMA peça; com ela o PMO fica 10/10**: portfólios (`active ↔ archived`, a física do `vendor`/`dc`) + membros N:N. ⭐ FK INTRA-schema `members → portfolios` (permitida — é o próprio schema) × id solto ao `proj` (cross-module, guarda SCHEMA_DE). Um projeto pode estar em VÁRIOS portfólios (sem unique global em `project_id`). ⛔ Sem rollup automático de métricas (Lei 7 — FORA). Ver `MODULO-PFOLIO-SPEC`.
- ⭐ **A ONDA QUATORZE (Fase 2) entregou os Módulos 63–66 num PR só, um commit por módulo** (migrations `0078`–`0081`, ARQUIVO — apply do dono, runbook §27): **ABRE o Domain Qualidade** (`quality`), território novo do mapa. A Qualidade tem 7 capacidades; **quatro viram módulo próprio** (Não conformidades · Auditorias · CAPA · ISO) e **três ficam DECLARADAS FORA por anti-duplicação**: *Indicadores* já é o `goal` (uma meta com categoria "qualidade"), *Documentos de qualidade* e *Procedimentos* já são o `pol` (documento versionado com ciência). Os QUATRO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 62 para **66 módulos publicados**.
  - `packages/non-conformities` é o **Módulo 63 — Não Conformidades** (`nc`, Domain `quality`): ⭐ **a identidade do `occ` re-perguntada** — o registro do desvio constatado nasce IMUTÁVEL (duas camadas: cliente sem porta de UPDATE, gatilho até para o dono). ⭐⭐ **O DIVERGE assinado do `occ`: fechar exige a NOTA DE VERIFICAÇÃO** (quem conferiu que a causa foi corrigida) — o `occ` encerra com um desfecho livre; a Qualidade não fecha sem verificar. `open → closed` terminal; recorrência é NC nova por id solto; vínculo ao `capa` por id solto. Ver `MODULO-NC-SPEC`.
  - `packages/audits` é o **Módulo 64 — Auditorias** (`audit`, Domain `quality`): ciclo `planned → completed/cancelled` TERMINAL (a física do `proj`), cancelar exige razão; tipo/escopo texto livre. ⭐ **O achado (`findings`) tem DOIS vínculos de natureza diferente:** FK composta **INTRA-schema** à auditoria (peça do próprio módulo) × **id solto** ao `nc` (cross-module) — e é IMUTÁVEL. ⚠️ `module_id` é `audit`, NÃO a *Auditoria* do Core (`core.audit.read`) nem a de GRC (homônimos declarados — Sol Único). Ver `MODULO-AUDIT-SPEC`.
  - `packages/capa` é o **Módulo 65 — CAPA** (`capa`, Domain `quality`): ⭐ o tipo `corrective`/`preventive` é **CHECK argumentado** (física do método, a lição do `mnt`/`nps`). ⭐ **O ciclo `open → verified → closed` escolhido de propósito — SEM atalho `open → closed`:** a VERIFICAÇÃO (a nota de quem confirmou que a ação funcionou, carimbada pelo servidor) é o que separa a CAPA de um `sched.milestone` genérico — sem `verified`, não fecha. `closed` terminal; o plano congela ao ser verificado; vínculo ao `nc` por id solto. Ver `MODULO-CAPA-SPEC`.
  - `packages/iso` é o **Módulo 66 — Requisitos ISO** (`iso`, Domain `quality`) — ⭐ **FECHA a onda**: a cláusula da norma é TEXTO LIVRE (dado do tenant, nunca lista fechada). ⭐⭐ **A conformidade (`compliant`/`non_compliant`/`not_applicable`) é MUTÁVEL — o DIVERGE assinado de TODO módulo com ciclo terminal:** é uma avaliação que muda a cada auditoria, não uma máquina de estados (não existe `allowed_transition` de conformidade; há guarda de CI que reprova se ela virar uma). A conformidade nasce sem default (Lei 7 — quem registra declara). `active ↔ archived` reversível para cláusulas fora de escopo (outro conceito, distinto da conformidade); arquivada não se reavalia. Ver `MODULO-ISO-SPEC`.
- ⛔ **Função nasce ABERTA a `PUBLIC` no PostgreSQL** — diferente de tabela. Toda função criada depois do `revoke ... on all functions` do seu schema herda esse privilégio, e o `grant` escrito logo abaixo vira decoração. Oito funções `security definer` eram chamáveis por `anon` até o `0022_revoke_public_execute.sql`. **Escreveu `create function` em schema já revogado? Revogue de novo antes de conceder.**
- ⭐ **Copiar sem pensar e divergir sem escrever são o mesmo erro.** Módulo novo que espelha um existente: re-pergunte cada decisão e escreva a resposta — inclusive as que se mantêm.
- ⭐ **A origem de um fato vem SEMPRE do envelope** (`producedBy`), nunca de constante no consumidor. Com ela chumbada, um segundo produtor do mesmo formato entraria disfarçado do primeiro e a trilha mentiria sem nunca dar erro. Há guarda no CI que reprova as três formas de chumbar.
- `apps/store` e `apps/admin` e os demais 12 pacotes continuam **só com `README.md`** — status NÃO INICIADO. (`packages/finance` segue NÃO INICIADO: os módulos financeiros nascem em pastas próprias, como manda §6.)
- ⚠️ **O seed é a FONTE do catálogo, não só a semente dele.** Desde a Etapa 10 os blocos de `core.module_registry` são `on conflict do update`, não `do nothing`: uma linha existente precisou mudar (o `recon` passou a escutar `ap.*`) e `do nothing` deixaria a Store exibindo o catálogo antigo para sempre, sem erro nenhum. Consequência: reaplicar o seed **desfaz edição feita à mão** no catálogo. Depreciar um módulo se faz mudando o arquivo.
- ⚠️ **Schema novo precisa ser EXPOSTO na Data API do Supabase pelo dono** (Project Settings → API → Exposed schemas). Lição paga na Etapa 9 e repetida nas 10, 11 e 12: sem isso as telas carregam vazias, sem erro que diga o motivo. Está no runbook §10.0. ⭐ **A Forja e o Painel não pedem schema novo** — os dois são Core e escrevem/leem em `core`, que já está exposto.
- **As migrations são provadas no CI:** `0001` → … → `0014` + `0017` → `0057` + seed (duas vezes) aplicam de verdade num Postgres 17 limpo e passam nos **quarenta e sete** testes de isolamento com usuário real (`supabase/tests/`), a cada mudança.

#### ⛔ 5.4.1 O apply de produção já aconteceu — `0001` a `0014` estão CONGELADAS

O dono informou, entre 27 e 29/07/2026, ter aplicado `0001_core.sql` até `0014_ap_apply_recon_match.sql` e o seed num projeto Supabase de produção, com um tenant piloto — **cinco módulos instalados pela Store** e o correio entregando de verdade: o triângulo (`ap` emite → `recon` projeta) foi visto funcionando ao vivo. **Este repositório NÃO VERIFICOU esse apply** — nenhum agente conecta a banco remoto com dado de cliente, e o registro fica assim, literalmente, conforme §3.

A consequência é operacional e não é opinião:

- ❌ **Não edite nenhuma migration de `0001` a `0014`.** Arquivo aplicado é história. Se estivessem só no papel, corrigir no lugar seria certo; aplicados, editar faz o próximo ambiente nascer diferente da produção **em silêncio**. Correção vira migration nova — foi exatamente o que a Etapa 15 teve de fazer com o `0022_revoke_public_execute.sql`.
- **⚠️ ESTADO INFORMADO PELO DONO em 29/07/2026 (⚠️ NÃO VERIFICADO aqui):** `0001`–`0014` **APLICADAS** — as `0011`–`0014` entraram fora do rito e foram reconciliadas no livro depois. **Cinco módulos instalados no tenant piloto.** Schemas `core`, `recon`, `marketing`, `ap`, `crm` e `ar` **expostos na Data API**. **Correio no ar, entregando** — o triângulo foi provado ao vivo.
- ⛔ **As "pendências de infraestrutura" que este arquivo listava NÃO EXISTEM MAIS.** O redeploy do `apps/api`, a exposição dos schemas `crm`/`ar` e a instalação dos módulos pela Store foram feitos. Um documento que continuasse cobrando-as mandaria o próximo agente refazer trabalho concluído — e é exatamente por isso que esta linha substitui as três anteriores em vez de ser acrescentada a elas.
- ✅ **Ainda são só ARQUIVO** — aplicar é ato do dono:
  - `0017_po.sql` — Módulo 6, Compras/Pedidos (runbook §11). ⚠️ **Expor o schema `po` na Data API** ao aplicar.
  - `0018_ops.sql` — Módulo 7, Esteira de Produção (runbook §12). ⚠️ **Expor o schema `ops`.**
  - `0019_forge.sql` + `0020_ops_machine_draft.sql` — a Forja, IA Base do Core (runbook §13). **Nenhum schema novo** — a forja escreve em `core`.
  - `0021_tenant_panel.sql` — o Painel Executivo (runbook §14). **Nenhuma tabela nova:** o Painel lê.
  - `0022_revoke_public_execute.sql` — ⛔ **segurança; aplicar junto com o `0021`** (runbook §15).
  - `0023_inv.sql` · `0024_quote.sql` · `0025_deal.sql` · `0026_evt.sql` · `0027_dun.sql` — os cinco da Missão Trina (runbook §16). ⚠️ **Expor os schemas `inv`, `quote`, `deal`, `evt`, `dun` na Data API** ao aplicar — e **redeployar o `apps/api`** (a inscrição da régua só existe no build novo).
  - `0028_ctr.sql` · `0029_cash.sql` · `0030_care.sql` · `0031_occ.sql` · `0032_mnt.sql` — os cinco da Missão Quadra (runbook §17). ⚠️ **Expor os schemas `ctr`, `cash`, `care`, `occ`, `mnt` na Data API** ao aplicar. Nenhum consome evento — não há redeploy obrigatório do `apps/api` nesta onda.
  - `0033_pat.sql` · `0034_chk.sql` · `0035_spc.sql` · `0036_vis.sql` · `0037_lead.sql` — os cinco da Missão Penta (runbook §18). ⚠️ **Expor os schemas `pat`, `chk`, `spc`, `vis`, `lead` na Data API** ao aplicar (o `0035` cria a extensão `btree_gist` — contrib, presente em todo Supabase). Nenhum consome evento — não há redeploy obrigatório do `apps/api` nesta onda.
  - `0038_goal.sql` · `0039_comm.sql` · `0040_edcal.sql` · `0041_media.sql` · `0042_nps.sql` — os cinco da Missão Sexta (runbook §19). ⚠️ **Expor os schemas `goal`, `comm`, `edcal`, `media`, `nps` na Data API** ao aplicar. Nenhum consome evento — não há redeploy obrigatório do `apps/api` nesta onda. ⛔ E o `nps` não ganha exceção de `anon`: o link público de resposta é integração futura.
  - `0043_cc.sql` · `0044_bud.sql` · `0045_bank.sql` · `0046_invest.sql` · `0047_dre.sql` — os cinco da Missão Sete, o Bloco Financeiro (runbook §20). ⚠️ **Expor os schemas `cc`, `bud`, `bank`, `invest`, `dre` na Data API** ao aplicar. ⛔🔴 **DOIS consumidores nesta onda — o `bud` (cash.*) e o `dre` (cash.* + cc.*) — EXIGEM redeploy do `apps/api`** (as inscrições só existem no build novo); o `cc`, o `bank` e o `invest` não exigem (`consumes` vazio).
  - `0048_hr.sql` · `0049_shift.sql` · `0050_train.sql` · `0051_perf.sql` · `0052_pol.sql` — os cinco da Missão Oito, o Bloco de Pessoas (runbook §21). ⚠️ **Expor os schemas `hr`, `shift`, `train`, `perf`, `pol` na Data API** ao aplicar (o `0049` cria a extensão `btree_gist` — contrib, já usada pelo `spc`). ✅ **NENHUM consome evento — SEM redeploy do `apps/api` nesta onda** (todos com `consumes` vazio; guarda de CI confere). ⚠️ Dado de pessoa física: nome neutro, zero CPF/saúde/banco (Folha/Benefícios FORA).
  - `0053_mall.sql` · `0054_lease.sql` · `0055_fund.sql` · `0056_park.sql` · `0057_sec.sql` — os cinco da Missão Nove, o Vertical Shopping Centers (runbook §22). ⚠️ **Expor os schemas `mall`, `lease`, `fund`, `park`, `sec` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (camadas finas sobre os genéricos, id solto; guarda de CI confere). ⭐ São os PRIMEIROS cartões `vertical_key` (`shopping-centers`) — a Store gradua a galeria de Verticais. ⭐⭐ **42/42 — campanha das 6 Ondas COMPLETA.**
  - `0058_vendor.sql` · `0059_rfq.sql` · `0060_recv.sql` · `0061_vperf.sql` · `0062_reorder.sql` — os cinco da Onda Dez (Fase 2 — completar o Domain Compras), runbook §23. ⚠️ **Expor os schemas `vendor`, `rfq`, `recv`, `vperf`, `reorder` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐⭐ O `reorder` NÃO lê o `inv`: a comparação é da tela (`needsReorder()`), e o mapa SCHEMA_DE do CI reprova `inv.` na migration. Ao aplicar, o catálogo vai de 42 a **47 módulos publicados**.
  - `0063_dem.sql` · `0064_sop.sql` · `0065_dc.sql` · `0066_disp.sql` · `0067_logperf.sql` — os cinco da Onda Onze (Fase 2 — abrir o Domain Supply Chain), runbook §24. ⚠️ **Expor os schemas `dem`, `sop`, `dc`, `disp`, `logperf` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`sop`→plano do `dem`; `disp` e `logperf`→`dc`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio. Ao aplicar, o catálogo vai de 47 a **52 módulos publicados**.
  - `0068_proj.sql` · `0069_sched.sql` · `0070_kanban.sql` · `0071_alloc.sql` · `0072_pcost.sql` — os cinco da Onda Doze parte 1/2 (Fase 2 — abrir o Domain PMO & Projetos), runbook §25. ⚠️ **Expor os schemas `proj`, `sched`, `kanban`, `alloc`, `pcost` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`sched`/`kanban`/`alloc`/`pcost`→projeto do `proj`; `alloc`→colaborador do `hr`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio. Ao aplicar, o catálogo vai de 52 a **57 módulos publicados**.
  - `0073_scrum.sql` · `0074_gantt.sql` · `0075_risk.sql` · `0076_timesheet.sql` · `0077_pfolio.sql` — os cinco da Onda Treze parte 2/2 (Fase 2 — FECHA o Domain PMO & Projetos), runbook §26. ⚠️ **Expor os schemas `scrum`, `gantt`, `risk`, `timesheet`, `pfolio` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`gantt`→marcos do `sched`; `risk`/`timesheet`/`pfolio`→projeto do `proj`; `timesheet`→colaborador do `hr`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio; a FK `pfolio.members`→`pfolio.portfolios` é INTRA-schema e permitida. Ao aplicar, o catálogo vai de 57 a **62 módulos publicados**. ⭐⭐ **PMO & Projetos COMPLETO — 10/10 capacidades, módulos 53–62.**
  - `0078_nc.sql` · `0079_audit.sql` · `0080_capa.sql` · `0081_iso.sql` — os quatro da Onda Quatorze (Fase 2 — ABRE o Domain Qualidade), runbook §27. ⚠️ **Expor os schemas `nc`, `audit`, `capa`, `iso` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`nc`→`capa`; `audit`/`capa`→`nc`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio; a FK `audit.findings`→`audit.audits` é INTRA-schema e permitida. Ao aplicar, o catálogo vai de 62 a **66 módulos publicados**. ⭐ As outras 3 capacidades da Qualidade (Indicadores→`goal`; Documentos/Procedimentos→`pol`) ficam DECLARADAS FORA.
  - `0082_esg.sql` — o único da Onda Quinze (Fase 2 — ABRE o Domain ESG & Sustentabilidade), runbook §28. ⚠️ **Expor o schema `esg` na Data API** ao aplicar. ✅ **NÃO consome evento — SEM redeploy do `apps/api`** (`consumes` vazio; guarda de CI confere). ⭐ A fonte da leitura é por ID SOLTO (`source_id`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio. Ao aplicar, o catálogo vai de 66 a **67 módulos publicados**. ⭐⭐ As quatro capacidades de medição viram UM módulo (metric_type CHECK); Indicadores→`goal` e Relatórios→`pol` ficam DECLARADAS FORA.
  - `0083_idea.sql` · `0084_ip.sql` — os dois da Onda Dezesseis (Fase 2 — ABRE o Domain Pesquisa & Desenvolvimento), runbook §29. ⚠️ **Expor os schemas `idea`, `ip` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`idea`→projeto de destino via `promoted_project_id`; `ip`→origem via `source_id`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio; a FK `idea.ideas`→`idea.stages` é INTRA-schema e permitida. Ao aplicar, o catálogo vai de 67 a **69 módulos publicados**. ⭐ *Projetos de pesquisa*→`proj` e *Portfólio tecnológico*→`pfolio` ficam DECLARADAS FORA; o `domain_key` é `rnd`.
  - `0085_fiscalcert.sql` — o único da Onda Dezessete (Fase 2 — ABRE o Domain Contábil & Fiscal), runbook §30. ⚠️ **Expor o schema `fiscalcert` na Data API** ao aplicar. ✅ **NÃO consome evento — SEM redeploy do `apps/api`** (`consumes` vazio; guarda de CI confere). ⚠️⚠️ **7 das 8 capacidades FORA por Lei 3** (NF-e/NFS-e/NFC-e/SPED/eSocial/Apuração são integração fiscal certificada; Integração com contador é o `crm`). ⛔⛔ Só o registro de METADADOS — nunca o `.pfx`, a chave privada ou a assinatura. Ao aplicar, o catálogo vai de 69 a **70 módulos publicados**; o `domain_key` é `accounting`.
  - `0086_pdv.sql` · `0087_catalog.sql` · `0088_cashregister.sql` · `0089_loyalty.sql` — os quatro da Onda Dezoito (Fase 2 — ABRE o Vertical 🛒 Varejo & Supermercados), runbook §31. ⚠️ **Expor os schemas `pdv`, `catalog`, `cashregister`, `loyalty` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⛔ O `pdv` registra a VENDA COMERCIAL, nunca o documento fiscal (NF-e/NFC-e é integração, Lei 3). Os vínculos são por ID SOLTO (`pdv`→cliente `crm`/produto `catalog`; `loyalty`→cliente `crm`/venda). Ao aplicar, o catálogo vai de 70 a **74 módulos publicados** (9 cartões vertical: 5 shopping-centers + 4 retail). O `vertical_key` é `retail`.
  - `0116_tenant_insights.sql` · `0117_insight_cron.sql` — o INSIGHT PROATIVO (Core, não módulo; a PRÓXIMA AÇÃO PUBLICÁVEL do MEMORANDO-DIVISAO-DE-AGUAS). ⚠️ **Nenhum schema novo** — escreve/lê em `core`, já exposto (como a Forja/Painel). ✅ **NÃO consome evento** — o `0116` só cria a superfície; quem grava é o `runInsightOnce` do `apps/api` (build novo, já com `@alsham/engineer`). O `0117` é só o **cron comentado** (`insight-do-core`, 6/6h): ligar é ato do dono, junto do correio (runbook §6). O catálogo **não muda** (Core não é cartão).
  - `0118_tenant_insight_history.sql` — o LIVRO append-only que faz o insight virar ANÁLISE (o Avisador vira Analista): a média das leituras recentes vira tendência na frase ("40% acima da média recente"). ⚠️ **Nenhum schema novo** (`core`, imutável em 2 camadas). ✅ **NÃO consome evento** — o `runInsightOnce` (build novo) lê a média e acrescenta a leitura de hoje. ⛔ "Devedor repetido" FORA (o `ar` não linka o `crm`). O catálogo **não muda**.
  - `0119_tenant_timezone.sql` — ⭐⭐ **DATA NO FUSO DO TENANT** (correção de fundamento): `core.tenants.timezone` (aditiva, default `America/Sao_Paulo`, validada contra `pg_timezone_names` por gatilho) + `core.tenant_today(tenant_id)` (a data de HOJE no fuso daquele tenant, não do servidor UTC). ⚠️ **Nenhum schema novo** (`core`, já exposto). ✅ **NÃO consome evento** — mas ⚠️ **EXIGE redeploy do `apps/api`** (o `insight-service` agora classifica vencido por `core.tenant_today`, não `current_date`) **E o rebuild do `apps/portal`** (o Engenheiro injeta a data resolvida no prompt e nos fatos grounded). ⛔ NUNCA hardcode fuso — sempre lido do tenant. O catálogo **não muda**.
  - `0090_erisk.sql` · `0091_control.sql` · `0092_whistle.sql` · `0093_vuln.sql` · `0094_secincident.sql` · `0095_continuity.sql` — os seis da Onda Dezenove (Fase 3 — os 3 Domains pendentes: IA Aplicada FECHA com ZERO módulo; GRC e InfoSec abertos), runbook §32. ⚠️ **Expor os schemas `erisk`, `control`, `whistle`, `vuln`, `secincident`, `continuity` na Data API** ao aplicar. ✅ **NENHUM consome evento — SEM redeploy do `apps/api`** (todos `consumes` vazio; guarda de CI confere). ⭐ Os vínculos são por ID SOLTO (`erisk`→`control`; `control`→`erisk`; `vuln`→`secincident`; `owner_id`→`hr`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio; as FKs `control.tests`→`control.controls`, `secincident.response_actions`→`secincident.incidents` e `continuity.drills`→`continuity.plans` são INTRA-schema e permitidas. Ao aplicar, o catálogo vai de 74 a **80 módulos publicados**; os `domain_key` são `grc` (×3) e `infosec` (×3).
- ⭐ **A ONDA QUINZE (Fase 2) entregou o Módulo 67 num PR só** (migration `0082`, ARQUIVO — apply do dono, runbook §28): **ABRE o Domain ESG & Sustentabilidade** (`esg`), território novo do mapa. O ESG tem 6 capacidades; ⭐⭐ **UMA decisão de canon: as quatro de medição (Inventário de carbono · Gestão de resíduos · Consumo de água · Consumo de energia) viram UM módulo** — na física são a mesma leitura periódica (quantidade + unidade + período), distinguidas por `metric_type` (CHECK das quatro dimensões clássicas); as outras duas ficam DECLARADAS FORA: *Indicadores ESG* já é o `goal`, *Relatórios ESG* já é o `pol`. O único tem **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 66 para **67 módulos publicados**.
  - `packages/esg` é o **Módulo 67 — Métricas Ambientais** (`esg`, Domain `esg`): ⭐⭐ **UM módulo, quatro capacidades** — o livro de leituras ambientais é ATO IMUTÁVEL (duas camadas — a física do `pcost`/`timesheet`); o `metric_type` é CHECK (`carbon`/`water`/`energy`/`waste`, física do método). ⭐ **`quantity >= 0` — o DIVERGE assinado** (nem o `<> 0` do `pcost`, nem o `> 0` estrito do `timesheet`: zero é leitura real, negativo é infísico). A unidade é texto livre (tCO2e/m³/kWh/kg); a fonte por id solto. ⛔ Cálculo de pegada por fórmula (motor futuro) e certificação de terceira parte (é o `audit`) FORA. Ver `MODULO-ESG-SPEC`.
- ⭐ **A ONDA DEZESSEIS (Fase 2) entregou os Módulos 68–69 num PR só, um commit por módulo** (migrations `0083`–`0084`, ARQUIVO — apply do dono, runbook §29): **ABRE o Domain 🔬 Pesquisa & Desenvolvimento** (`rnd`), território novo do mapa. O P&D tem 6 capacidades; ⭐⭐ **duas decisões de canon: (a) *Projetos de pesquisa* já é o `proj` e *Portfólio tecnológico* já é o `pfolio` — DECLARADAS FORA; (b) as outras quatro colidem duas a duas** — *Ideias* + *Pipeline de inovação* viram o `idea`; *Propriedade intelectual* + *Patentes* viram o `ip` (o tipo num CHECK). ⚠️ O `domain_key` é `rnd` (a chave canônica da store-taxonomy), não `rd`. Os DOIS têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 67 para **69 módulos publicados**.
  - `packages/idea` é o **Módulo 68 — Ideias & Pipeline de Inovação** (`idea`, Domain `rnd`): ⭐⭐ **UM módulo, duas capacidades** — as etapas do funil (desenho do tenant) + as ideias que andam por UPDATE simples (a física do `kanban`). ⭐⭐ **O DIVERGE do `kanban`: a ideia NÃO tem `project_id`** — nasce ANTES de qualquer projeto (o oposto de propósito); o único elo é o `promoted_project_id` (id solto) do DESTINO, na promoção. Ciclo: `active → promoted` (terminal — virou projeto) / `active ↔ archived` (reversível — a gaveta que volta). Etapa é FK INTRA-schema. Ver `MODULO-IDEA-SPEC`.
  - `packages/ip` é o **Módulo 69 — Propriedade Intelectual** (`ip`, Domain `rnd`): ⭐⭐ **UM módulo, duas capacidades** — o `asset_type` é CHECK das quatro categorias clássicas (`patent`/`trademark`/`copyright`/`trade_secret`, física do direito). ⭐ **Ciclo TERMINAL sem reabertura:** `filed → granted/rejected`, `granted → expired` — o indeferido/expirado que volta é depósito novo (a física do `proj`/`nc`, o DIVERGE do `iso` mutável). A identidade congela fora do depósito; a origem (idea/proj) por id solto. Ver `MODULO-IP-SPEC`.
- ⭐ **A ONDA DEZESSETE (Fase 2) entregou o Módulo 70 num PR só** (migration `0085`, ARQUIVO — apply do dono, runbook §30): **ABRE o Domain 🧾 Contábil & Fiscal** (`accounting`), o território mais restrito do mapa POR LEI. ⚠️⚠️ **A Lei 3 manda: 7 das 8 capacidades ficam FORA** — NF-e/NFS-e/NFC-e/SPED/eSocial são emitidos/validados pelo Fisco (integração certificada, nunca schema — construí-los exporia o cliente a autuação); *Apuração de impostos* é motor de cálculo fiscal certificado; *Integração com contador* é o ponto de integração (o contato é o `crm`). Sobra UM módulo. O único tem **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 69 para **70 módulos publicados**.
  - `packages/fiscalcert` é o **Módulo 70 — Certificado Digital** (`fiscalcert`, Domain `accounting`): ⭐⭐ **um LEMBRETE DE VALIDADE, não um cofre** — guarda só os METADADOS (tipo/titular/validade). ⛔⛔ **Nunca o arquivo `.pfx`, nunca a chave privada, nunca a assinatura** (Lei 3 + segurança; guarda de CI + teste SQL provam a ausência de coluna de cofre e de função de assinatura). `valid_until` obrigatória (o dado que justifica o módulo); tipo/titular texto livre. ⭐ `active ↔ archived` (a física do `vendor`), arquivar/reativar exige `certificate.decide`. Alerta automático de vencimento é engine futura. Ver `MODULO-FISCALCERT-SPEC`.
- ⭐ **A ONDA DEZOITO (Fase 2) entregou os Módulos 71–74 num PR só, um commit por módulo** (migrations `0086`–`0089`, ARQUIVO — apply do dono, runbook §31): **ABRE o Vertical 🛒 Varejo & Supermercados** (`retail`), o SEGUNDO bloco vertical do catálogo (o primeiro desde Shopping Centers). O varejo tem 7 capacidades; **quatro viram módulo** (PDV · Catálogo · Caixa · Fidelidade) e **três ficam FORA**: *Estoque de varejo* (é o `inv` genérico, por id solto), *Promoções* (dobrada como campo de desconto simples no `pdv`) e *Marketplace próprio* (frente de e-commerce, futuro). Os QUATRO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 70 para **74 módulos publicados** (9 cartões vertical: 5 shopping-centers + 4 retail).
  - `packages/pdv` é o **Módulo 71 — Ponto de Venda** (`pdv`, Vertical `retail`): ⛔ a **VENDA COMERCIAL**, nunca o documento fiscal — NF-e/NFC-e é integração (Lei 3), e o bastão é a decisão de dono explícita (o PDV "integra-se por padrão"). Cabeçalho + itens (FK intra-schema), finalizar CONGELA (a física do `rfq`/`quote`); `draft → completed/cancelled` TERMINAIS. ⭐ **O DIVERGE do `rfq`:** sem estado intermediário (`open`) — a venda fecha na hora. *Promoções* dobrada como `discount_cents`; o total é VIEW. Cliente/produto por id solto. Ver `MODULO-PDV-SPEC`.
  - `packages/catalog` é o **Módulo 72 — Catálogo de Produtos** (`catalog`, Vertical `retail`): SKU TEXTO LIVRE opcional (a lição do `crm`), nome, preço de tabela (valor + moeda, `>= 0`). ⭐ **`active ↔ archived` — a física do `vendor`/`mall`** (o produto descontinuado que volta é o MESMO; o DIVERGE do `hr` terminal). O preço efetivo da venda vive no item do cupom (`pdv`). Ver `MODULO-CATALOG-SPEC`.
  - `packages/cashregister` é o **Módulo 73 — Sessão de Caixa** (`cashregister`, Vertical `retail`): o turno físico de uma gaveta — abre contando o fundo, fecha contando a gaveta. ⭐⭐ **O DIVERGE do `cash`:** o `cash` é livro-caixa perpétuo, imutável e SEM ciclo; a sessão tem `open → closed`, `closed` TERMINAL (a física do `scrum`). UMA sessão aberta por caixa (constraint). A quebra de caixa (esperado × contado) é de tela. Ver `MODULO-CASHREGISTER-SPEC`.
  - `packages/loyalty` é o **Módulo 74 — Fidelidade** (`loyalty`, Vertical `retail`): o livro de pontos IMUTÁVEL (a física do `timesheet`). ⭐⭐ **O DIVERGE do `pcost`/`timesheet`:** a direção mora no `entry_type` (earn/redeem — a sinal do tipo do `cash`), `points > 0` sempre; o saldo é VIEW (Σ earn − Σ redeem). ⭐⭐ **Resgatar mais que o saldo é RECUSADO** — a terceira resposta, a física do `invest`. Cliente por id solto ao `crm` (obrigatório). Ver `MODULO-LOYALTY-SPEC`.
- ⭐⭐ **A ONDA DEZENOVE (Fase 3) entregou os Módulos 75–80 num PR só, um commit por módulo** (migrations `0090`–`0095`, ARQUIVO — apply do dono, runbook §32): FECHA os **ÚLTIMOS 3 dos 18 Domains Universais** — 🤖 IA Aplicada, 🏛 GRC e 🔐 Segurança da Informação. ⚠️⚠️ **A investigação fechou IA Aplicada com ZERO módulo** — e isso é honestidade, não falha: as 9 capacidades já são plataforma (*Agentes*=Dimensão 2 AI Marketplace; *Chat/Automações/OCR/Pesquisa inteligente*=Engines; *Copiloto*=o Engenheiro; *Resumos/Análise/Classificação*=IA Base+Engenheiro). Sobram **SEIS módulos genuínos**. Também FORA por reaproveitamento: *Auditorias*→`audit`, *Compliance corporativo*→`iso`, *Políticas*→`pol`, *IAM*→RBAC do Core, *Cofre/SIEM/Backup*→infra da plataforma. Ver `ONDA-DEZENOVE-DECISOES.md` (as 23 capacidades, cada uma com a decisão e o porquê). Os SEIS têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 74 para **80 módulos publicados** — o mapa dos 18 Domains fica COMPLETO. ⚠️ **Inconsistência latente registrada:** o `DomainKey` do core usa `applied-ai`, a store-taxonomy usa `ai-applied` — dormente porque IA Aplicada não entrega módulo; documentada, não tocada.
  - `packages/erisk` é o **Módulo 75 — Risco Corporativo** (`erisk`, Domain `grc`): ⭐⭐ **o DIVERGE do `risk`** (Módulo 60, PMO, project-scoped) — o risco ESTRATÉGICO do negócio, SEM `project_id`. MANTIDO do `risk`: régua 1–5 CHECK, severidade é leitura (a *Matriz de riscos*), `mitigated` REABRE e `closed` TERMINAL. DIVERGE: `treatment` (os 4 T's da ISO 31000, CHECK), dono/categoria texto livre. Ver `MODULO-ERISK-SPEC`.
  - `packages/control` é o **Módulo 76 — Controles Internos** (`control`, Domain `grc`): o cadastro de controles (tipo `preventive`/`detective`/`corrective` CHECK — física do COSO) + o livro IMUTÁVEL de testes (data, `pass`/`fail`, nota — a física do `timesheet`). `active ↔ archived`. NÃO é `pol`/`audit`/`erisk`. Ver `MODULO-CONTROL-SPEC`.
  - `packages/whistle` é o **Módulo 77 — Canal de Denúncias** (`whistle`, Domain `grc`): ⭐⭐ **o ANONIMATO é físico** — se anônima, o denunciante NUNCA é gravado (gatilho descarta `auth.uid()` + CHECK `not is_anonymous or reporter_id is null` + a política de leitura casa por `reporter_id`). A única forma de nunca vazar é nunca ter. O relato nasce imutável; o tratamento anda (`open → under_review → resolved/dismissed`). Confidencialidade na RLS (só `report.handle` lê tudo). O relato não passeia no envelope. Ver `MODULO-WHISTLE-SPEC`.
  - `packages/vuln` é o **Módulo 78 — Gestão de Vulnerabilidades** (`vuln`, Domain `infosec`): a identidade do `nc`/`capa` (fato constatado + remediação) — severidade 1–5 CHECK, `open → in_progress → remediated/accepted_risk`, as DUAS respostas terminais com justificativa. A vulnerabilidade dos sistemas DO TENANT (IAM/Cofre/SIEM/Backup da plataforma FORA). Ver `MODULO-VULN-SPEC`.
  - `packages/secincident` é o **Módulo 79 — Resposta a Incidentes** (`secincident`, Domain `infosec`): ⭐⭐ **o DIVERGE do `occ`** — timeline NIST de 5 estados (`detected → contained → eradicated → recovered → closed`) vs 1 par do `occ`; editável-enquanto-aberto/congela-no-fim (a física do `risk`) vs imutável-do-nascimento. Campos próprios `attack_vector`/`affected_data`, `severity` 1–5. A resposta é livro imutável de atos (o MANTIDO do `occ`). O vetor/dados não passeiam no envelope. Ver `MODULO-SECINCIDENT-SPEC`.
  - `packages/continuity` é o **Módulo 80 — Continuidade de Negócios** (`continuity`, Domain `infosec`) — ⭐ **a ÚLTIMA peça dos 18 Domains**: o plano (`active ↔ archived`, RTO/RPO texto livre) + o livro IMUTÁVEL de drills (a física do `timesheet`) — a prova de que o plano funciona. O documento detalhado do plano é o `pol` (FORA); os drills justificam o módulo. Ver `MODULO-CONTINUITY-SPEC`.
- ⭐ **A ONDA VINTE (Fase 3) entregou os Módulos 81–84 num PR só, um commit por módulo** (migrations `0096`–`0099`, ARQUIVO — apply do dono, runbook §33): **ABRE o Vertical ☀️ Energia** (`vertical_key='energy'`), o TERCEIRO bloco vertical (depois de Shopping Centers e Varejo), dor viva da Curva C solar. A Taxonomia §6 lista 8 capacidades; **4 viram módulo, 4 ficam FORA por reaproveitamento**: *Geração distribuída* (consolidada no `plant`), *Manutenção de usina* (=`mnt`, `asset_id` solto), *Contratos de energia* (=`ctr`, a decisão do `lease`), *Comercialização e leads* (=`lead`). Os QUATRO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 80 para **84 módulos publicados** (13 verticais: 5 shopping-centers + 4 retail + 4 energy). Ver `ONDA-VINTE-DECISOES.md`.
  - `packages/plant` é o **Módulo 81 — Usinas (e Geração distribuída)** (`plant`, Vertical `energy`): ⭐⭐ **UM módulo, DUAS capacidades** — na física o MESMO objeto (a GD é uma usina de porte menor atrás do medidor), distinguido por `plant_type` TEXTO LIVRE (nunca enum — a consolidação do `esg`/`idea`/`ip`). `capacity_kwp > 0`; ⭐ `active ↔ archived` (a usina que volta a operar é a MESMA — a física do `catalog`/`vendor`, o DIVERGE do `hr`). Manutenção→`mnt`, Contrato→`ctr` FORA. Ver `MODULO-PLANT-SPEC`.
  - `packages/subscription` é o **Módulo 82 — Assinatura de Energia** (`subscription`, Vertical `energy`): o consumidor assina uma FATIA (`allocation_percent` `0<x<=100`) da geração de uma usina (id solto ao `plant`), cliente por id solto ao `crm`. ⭐⭐ **Nasce ativa — SEM `pending`** (o intermediário seria viés de uma distribuidora); ⭐ `active → cancelled` **TERMINAL** — quem re-assina faz OUTRA (a física do `proj`, o DIVERGE consciente do `catalog`); cancelar exige razão + `.decide`. Desconto/faturamento FORA. Ver `MODULO-SUBSCRIPTION-SPEC`.
  - `packages/genreading` é o **Módulo 83 — Monitoramento de Geração** (`genreading`, Vertical `energy`): ⭐ **reaproveita a identidade do `esg`** — leitura periódica IMUTÁVEL (duas camadas), `generated_kwh >= 0` (zero é leitura real — à noite; o MANTIDO do `esg`), unidade TEXTO LIVRE, sem ciclo. ⭐ **O DIVERGE do `esg`:** a usina é OBRIGATÓRIA (`plant_id NOT NULL` — não há geração no ar), por id solto. Performance ratio/alerta FORA. Ver `MODULO-GENREADING-SPEC`.
  - `packages/creditbalance` é o **Módulo 84 — Créditos de Compensação** (`creditbalance`, Vertical `energy`) — ⭐ **FECHA a onda**: o livro de créditos do SCEE/ANEEL, a identidade do `loyalty` (direção no `credit_type`, `quantity_kwh > 0`, saldo é VIEW). ⭐⭐ **Consumir > saldo é RECUSADO — a TERCEIRA resposta, por física PRÓPRIA** (não copiada do `loyalty`): crédito é energia realmente gerada, saldo negativo inventaria energia inexistente (a razão infísica do `esg`); `bank`/`inv` permitem negativo, `loyalty`/`invest` recusam por promessa/posse, `creditbalance` recusa porque energia não se deve, se gera. Validade (60m)/abatimento na fatura FORA. Ver `MODULO-CREDITBALANCE-SPEC`.
- ⭐ **A ONDA VINTE E UM (Fase 3) fechou os cinco módulos do Vertical 🏥 SAÚDE num PR** (migrations `0100`–`0104`, ARQUIVO — apply do dono, runbook §34): **ABRE o Vertical 🏥 Saúde** (`vertical_key='health'`), o QUARTO bloco vertical. A Taxonomia §6 lista 8 capacidades; **5 viram módulo, 3 ficam FORA**: *Convênios* (=`ctr`, categoria "convênio"; o plano do paciente é campo TEXTO LIVRE no `patient`), *Faturamento TISS* (Lei 3 — padrão ANS regulado, integra), *Telemedicina* (=Engine de Vídeo, amarra ao `appointment` por id solto). ⚠️⚠️ **DADO SENSÍVEL (LGPD Art. 5º, II):** `record`/`exam`/`prescription` são clínicos e ganham a ⭐⭐ **TRILHA DE LEITURA** (`*.access_log` imutável append-only + `read_*()` `security definer` que loga usuário→paciente→quando ANTES de devolver — o padrão de EHR sério); `patient`/`appointment` ficam no write-trail. Os CINCO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 84 para **89 módulos publicados** (18 verticais: 5 shopping-centers + 4 retail + 4 energy + 5 health). ⚠️ o `record` (`0102`) fora entregue no PR #48 só como migration — este PR o FECHA (cartão no seed + teste + ligação no CI, que o #48 não tinha). Ver `ONDA-VINTE-E-UM-DECISOES.md`. Módulos:
  - `patient` (`0100`): cadastro demográfico em VALA PRÓPRIA (NÃO o `crm` — proibição LGPD de misturar PHI com contato comercial); nº de prontuário/plano TEXTO LIVRE; `active ↔ archived` (a física do `crm`/`catalog`). Write-trail.
  - `appointment` (`0101`): agenda com **NO-SHOW** (a física do `agendamentos.comparecimento` do Peritus, referência não integração); `scheduled → attended | no_show | cancelled`, os TRÊS TERMINAIS; profissional/paciente id solto, registro CRM/CRO/CRP TEXTO LIVRE. ⚠️ status `no_show` mas o fato é `.missed` (o outbox recusa `_` no verbo). Write-trail.
  - `record` (`0102`): Prontuário — cada entrada é FATO CONSUMADO imutável 2 camadas; ⭐⭐ trilha de LEITURA (`record.read_patient()` é a única porta, e LOGA). O conteúdo clínico NÃO vai no envelope.
  - `prescription` (`0103`): Receitas — cabeçalho (metadata legível) + itens (medicamento+posologia); emitir CONGELA (`draft → issued` terminal, a física do `quote`); ⭐⭐ trilha de LEITURA do CONTEÚDO (`prescription.read_items()`, o DIVERGE do `record`: só a medicação atrás da porta).
  - `exam` (`0104`): Exames pedido→resultado (duas fases); o resultado é ato IMUTÁVEL apenso 1:1 (a física do `chk`); `requested → resulted | cancelled`; ⭐⭐ trilha de LEITURA do RESULTADO (`exam.read_result()`). Laudo/imagem em Storage FORA (é texto).
- ⭐ **A ONDA GOVERNO (Fase 3) entregou os Módulos 90–93 num PR, um commit por módulo** (migrations `0105`–`0108`, ARQUIVO — apply do dono): **ABRE o Vertical 🏛 Governo** (`vertical_key='government'`), o QUINTO bloco vertical. A Taxonomia §6 lista 8 capacidades; **4 viram módulo, 4 ficam FORA**: *Convênios* (=`ctr`), *Patrimônio público* (=`pat`, nº de tombamento é `reference`), *Tributos* (Lei 3 — lançamento com força de título executivo, integra), *Obras* (=`proj`/`sched`/`pcost`). ⚠️ **Decisão de dono (03/08/2026): CONSTRUIR o `fisc`** — a fiscalização tem cadastro de alvos PRÓPRIO (o `occ` não carrega roster); é a física do `sec`. O auto de infração e os Tributos ficam FORA por Lei 3. Os QUATRO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 89 para **93 módulos publicados** (22 verticais: 5 shopping-centers + 4 retail + 4 energy + 5 health + 4 government). Ver `ONDA-GOVERNO-DECISOES.md`. Módulos:
  - `proc` (`0105`) — **Protocolo** (Módulo 90): a Lei das Etapas do `ops` re-perguntada para o processo PÚBLICO (o `kanban` do Governo). ⭐ nº de protocolo público, interessado id solto + nome carimbado, e a **decisão formal TERMINAL** (`deferido`/`indeferido`/`arquivado` com despacho obrigatório — o DIVERGE do `ops` reabrível). A trilha imutável carimba o NOME da etapa.
  - `ombuds` (`0106`) — **Ouvidoria** (Módulo 91): reaproveita DELIBERADAMENTE o **anonimato-físico do `whistle`** (anônima nunca grava o cidadão — gatilho + CHECK + RLS por `reporter_id`). Tipo de manifestação (CHECK das 5 da Lei 13.460), protocolo público, tratamento `received → under_review → answered/dismissed`. O relato não passeia no envelope.
  - `bid` (`0107`) — **Licitações** (Módulo 92): a identidade "o comprador premia" do `rfq`, com o DIVERGE assinado: `draft → open → homologated/cancelled` (o `homologated` da Lei 14.133 × o `awarded` do `rfq`); edital + itens + `proposals` (livro imutável de propostas). Modalidade texto livre. ⛔ Publicação no PNCP FORA (Lei 3).
  - `fisc` (`0108`) — **Fiscalização** (Módulo 93): a física do `sec` (roster + livro imutável) para a inspeção pública. `fisc.targets` (`active ↔ archived`) + `fisc.inspections` (ato pontual imutável, carimbado pelo servidor). ⛔ O auto de infração FORA (Lei 3): a vistoria CONSTATA, a penalidade integra.
- ⭐ **A ONDA EVENTOS (Fase 3) entregou os Módulos 94–96 num PR, um commit por módulo** (migrations `0109`–`0111`, ARQUIVO — apply do dono): **ABRE o Vertical 🎪 Eventos** (`vertical_key='events'`), o SEXTO bloco vertical — ⚠️ **o de MAIOR risco de duplicação do mapa**, cercado por três peças do império: o `evt` genérico (Domain Marketing), o `canta-siriema` (bilheteria+afiliados, produto real com PIX) e o `alsham-events-os` (framework Drizzle/MySQL, catedral de papel). A investigação começou pelas pedreiras (ver `ONDA-EVENTOS-DECISOES.md`). A Taxonomia §6 lista 8 capacidades; **3 viram módulo (4 caps), 4 ficam FORA**: *Ingressos* (Lei 3 + `canta-siriema` já É a bilheteria do império), *Fornecedores de evento* (=`vendor`), *Afiliados* (`canta-siriema`), *Pós-evento* (=`nps`/`pol`). Os TRÊS têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 93 para **96 módulos publicados** (25 verticais: 5 shopping-centers + 4 retail + 4 energy + 5 health + 4 government + 3 events). Módulos:
  - `accred` (`0109`) — **Credenciamento & Check-in** (Módulo 94): ⭐⭐ **UM schema, DUAS capacidades** — a física do `train` no portão: a credencial é o cadastro revogável (`active ↔ revoked`), o check-in é o ato pontual imutável carimbado pelo servidor (a física do `vis`). ⭐ **O DIVERGE do `train`:** a inscrição vai além da presença; o check-in NÃO tem sequência — quem volta amanhã faz OUTRO. Evento por id solto ao `evt`; tipo/nível de acesso TEXTO LIVRE. ⛔ Ingresso/pagamento (Lei 3) e check-out FORA.
  - `lineup` (`0110`) — **Programação/line-up** (Módulo 95): a grade de atrações/sessões/palestras (palco e horário TEXTO LIVRE, ordenadas por posição). ⭐⭐ **A agenda é PLANO MUTÁVEL — o item se edita e se APAGA, SEM `status` e sem ciclo** (a física do `gantt`/`edcal`): o DIVERGE assinado do `sched`, cujo marco tem máquina de estados. Só dois fatos: `registered` e `updated`. Evento por id solto + nome carimbado.
  - `sponsor` (`0111`) — **Patrocínios** (Módulo 96): a camada de patrocínio (cota/tier TEXTO LIVRE, valor opcional, checklist de entregáveis de ativação por evento). ⭐ O contrato jurídico continua no `ctr` e a negociação no `deal` (id solto) — o `sponsor` é a camada de patrocínio como o `lease` é a camada comercial sobre o `ctr`. ⭐ **`active ↔ archived`** (o patrocinador que volta é a MESMA relação — a física do `vendor`/`mall`, o DIVERGE do `lease` terminal); os entregáveis são MUTÁVEIS (o DIVERGE do `sales_reports` imutável do `lease`), FK intra-schema × `event_id` solto.
- ⭐⭐ **A ONDA BELEZA (Fase 3) entregou os Módulos 97–100 num PR, um commit por módulo** (migrations `0112`–`0115`, ARQUIVO — apply do dono): **ABRE o Vertical 💇 Beleza & Estética** (`vertical_key='beauty'`), o SÉTIMO bloco vertical. ⚠️ O `Suprema Beleza` é **DOSSIÊ** (design, não código provado) — minerou-se vocabulário, a física foi decidida por conta própria sobre precedentes PROVADOS. A Taxonomia §6 lista 6 capacidades; **4 viram módulo, 2 ficam FORA**: *Fidelidade* (=`loyalty`), *Estoque de produtos* (=`inv`/`catalog`). Os QUATRO têm **`consumes` VAZIO** — sem redeploy do `apps/api`. O catálogo passa de 96 para **100 módulos publicados** (29 verticais: 5 shopping-centers + 4 retail + 4 energy + 5 health + 4 government + 3 events + 4 beauty). ⭐⭐ **O `pack` é o Módulo 100 — a meta "rumo aos 100 módulos" alcançada.** Ver `ONDA-BELEZA-DECISOES.md`. Módulos:
  - `booking` (`0112`) — **Agendamento** (Módulo 97): ⭐ **reaproveita a FÍSICA do no-show do `appointment`** (`scheduled → attended | no_show | cancelled`, três terminais, carimbo do desfecho pelo servidor, cancelar exige razão, no_show → fato `.missed`). ⭐ **O DIVERGE do `appointment`:** cliente=`crm` por id solto (NÃO `patient`/PHI), serviço TEXTO LIVRE, profissional id solto ao `professional` — **zero trilha clínica** (agendar um corte não é ato de saúde). Split `manage`/`decide`.
  - `professional` (`0113`) — **Profissionais** (Módulo 98): o roster de quem executa o serviço; nome neutro + especialidade TEXTO LIVRE. ⭐ **`active ↔ archived` — o DIVERGE do `hr` terminal** (o profissional que volta é o MESMO: a física do `vendor`/`mall`). `hr_employee_id` id solto OPCIONAL — a cadeira alugada autônoma não é RH, e por isso o roster é próprio.
  - `commission` (`0114`) — **Comissões** (Módulo 99): ⭐ o **livro IMUTÁVEL** de comissão do profissional por serviço (a física do `timesheet`): profissional id solto + nome, serviço TEXTO LIVRE, valor em centavos. ⚠️ **NÃO é motor de cálculo (Lei 7):** o valor é REGISTRADO por quem lança, nunca derivado de regra de %. Corrigir é lançar o ato inverso.
  - `pack` (`0115`) — **Pacotes** (Módulo 100): ⭐⭐ **a peça 100 do catálogo**. Bundle FECHADO de sessões — `pack.packages` (compra congelada) + `pack.uses` (consumo imutável), FK intra-schema. ⭐ **A física do `loyalty`/`invest`:** saldo é VIEW (total − consumido), **consumir > saldo é RECUSADO** (a terceira resposta). ⭐⭐ **O DIVERGE do `loyalty`:** o ponto é fungível; o pacote é bound a UM serviço (texto livre) e UM cliente (id solto `crm`) com identidade de compra própria.
- ⚠️ **A lacuna `0015`/`0016` é proposital** e vem da main. Com a Onda Beleza (`0112`–`0115`), a próxima numeração livre é **`0116`**.
- ⛔ **A limpeza do runbook §7.3 FOI EXECUTADA** em 28/07/2026: a concessão global de permissão de módulo **não existe mais em produção**. O tenant piloto tem papel próprio, com as permissões concedidas por `core.install_module()` — pela Store, com o clique do dono. Nunca volte a conceder permissão de módulo no seed.
- `packages/workflow` é **o correio do Core** — o entregador da caixa de saída: idempotência por consumidor, backoff exponencial, `dead` sem apagar. **ENGINE, não módulo** (Taxonomia §4): não aparece na Store.
- `apps/api` é **a COMPOSIÇÃO** — o único lugar do repositório onde os módulos se conhecem. Ele importa `workflow`, `marketing`, `finance-reconciliation`, `accounts-payable`, `accounts-receivable` e `billing`; **nenhum deles importa nenhum outro**. ⭐ Desde a Etapa 10 o mesmo pacote (`finance-reconciliation`) é PRODUTOR numa inscrição e CONSUMIDOR em outra — e continua sem conhecer ninguém. Traz a persistência real do correio (contra Postgres, com arrendamento e `skip locked`), os adaptadores dos consumidores, o endpoint protegido e a saúde da fila.
  ⛔ **Roda com `service_role` e NÃO vai junto com `apps/portal`.** Há guarda no CI sobre essa fronteira.
  ⚡ **NO AR desde 28/07/2026** — o dono ligou: `apps/api` publicado, `pg_cron` + `pg_net`, job de 1 em 1 minuto. ⚠️ **NÃO VERIFICADO** por este repositório.
- `packages/billing` é a **contabilidade de uso** — `usage_ledger` + leitura de limite, minerados do kraken-v2 (PROVADO). **Sem preço, e há guarda no CI para que continue assim** (Lei 7).
- `supabase/migrations/0003_billing.sql` — o livro-caixa de consumo. Correção é estorno, nunca edição.
- `supabase/seed/0001_platform.sql` — o catálogo da plataforma, idempotente. **Zero tenant, zero usuário.**
- `docs/runbook/APLICAR.md` — o passo a passo do apply, a conferência de segurança pós-apply e (§6) as duas formas de ligar o correio.
- `apps/portal` tem **login (Supabase Auth) e cinco telas**: importar extrato, mesa de conciliação, fila de aprovação, fechar período e a carteira de campanhas. Next.js 16.2.12 + React 19 + Tailwind 4, toda cor vinda dos tokens `--bos-*`.
- **Cada módulo tem porta de dados própria** em `apps/portal/src/lib/data/`. Não se acrescenta método de um módulo à porta de outro — porta que serve dois módulos vira porta que serve cinco, e desinstalar um deixa métodos que não respondem.
- O **parser de OFX/CSV** vive em `packages/finance-reconciliation/src/parsing/` — ler extrato é regra de negócio, não tela.
- **Segurança de tenant:** o `tenant_id` vem sempre da sessão cruzada com `core.memberships`, resolvido no servidor. Nunca de URL, formulário ou variável de ambiente. A `service_role key` não entra em `apps/` — há guarda no CI sobre o bundle de cliente.

### 5.5 A LEI DO LEGO — para todo módulo, deste em diante

O Módulo 1 é o padrão. Os Módulos 2 a 7 obedeceram ao mesmo; o próximo também:

1. **Schema próprio.** Nenhum módulo cria objeto no schema `core`.
2. **Uma porta só.** O módulo fala com o mundo por `<modulo>.emit_event()`, que escreve em `core.event_outbox`. Nada de chamada direta.
3. **Nada de ler tabela alheia.** Precisa do dado de outro módulo? Projeção local alimentada por evento. O acoplamento é com o **tipo do evento**, nunca com o código de quem emite.
4. **Tudo pelo manifesto.** Capacidade, permissão (com prefixo do módulo) e evento que não estejam no `ModuleManifest` não existem.
5. **Só o Core como dependência.** `requiresCore` é o único campo de dependência que existe — e a ausência de `dependsOn` é deliberada.
6. **Consumo só com consumidor.** Não declare `consumes` sem o handler construído (Lei 7).
7. **Consumir não é depender.** O Módulo 2 escuta um evento do Módulo 1 e **não o importa, não lê o schema dele e não o declara em `package.json`** — o acoplamento é com o TIPO DO EVENTO, que é contrato público. Há guarda no CI ("módulo não conhece módulo") que reprova as três formas, e ela foi sabotada nas três antes de entrar.
8. **Porta de dados própria.** Módulo novo ganha porta própria em `apps/*/lib/data/`, nunca método acrescentado à porta de outro.

### 5.6 Limites que continuam valendo

- ❌ **Não criar projeto Supabase. Não aplicar migration. Não deployar. Não adicionar segredo.**
- Migration nasce como arquivo versionado e é revisada em PR. Aplicar é ato do dono.
- **Toda UI nasce consumindo os tokens `--bos-*`** de `docs/canon/IDENTIDADE-VISUAL.md`. Nenhum HEX em componente — o CI barra.
- **A Regra de Ouro (§5.3) é verificada no CI**, não só recomendada: se o motor de domínio for redeclarado em `apps/`, ou se a tela deixar de chamá-lo, o build falha.
- **O instalador existe** (`0006_install.sql`): quem concede permissão de módulo é `core.install_module()`, num papel **DO TENANT**. Papel de sistema é recusado — ele vale em todos os tenants e faria o módulo vazar para quem não o instalou. **Nunca volte a conceder permissão de módulo no seed.**
- **Desinstalar não apaga dado.** Corta acesso e revoga permissão; o que o módulo gravou continua no banco. Há teste no CI.
- **Entregou peça? Atualize a linha dela** em `CORE-SPEC §5` e na spec do módulo — `MODULO-RECON-SPEC §7`, `MODULO-MARKETING-SPEC §6`, `MODULO-AP-SPEC §6`, `MODULO-CRM-SPEC §6`, `MODULO-AR-SPEC §5`, `MODULO-PO-SPEC §4`, `MODULO-OPS-SPEC §5`, `MODULO-INV-SPEC §7`, `MODULO-QUOTE-SPEC §6`, `MODULO-DEAL-SPEC §6`, `MODULO-EVT-SPEC §6`, `MODULO-DUN-SPEC §7`, `MODULO-CTR-SPEC §6`, `MODULO-CASH-SPEC §6`, `MODULO-CARE-SPEC §6`, `MODULO-OCC-SPEC §6`, `MODULO-MNT-SPEC §6`, `MODULO-PAT-SPEC §6`, `MODULO-CHK-SPEC §6`, `MODULO-SPC-SPEC §6`, `MODULO-VIS-SPEC §6`, `MODULO-LEAD-SPEC §6`, `MODULO-GOAL-SPEC §6`, `MODULO-COMM-SPEC §6`, `MODULO-EDCAL-SPEC §6`, `MODULO-MEDIA-SPEC §6`, `MODULO-NPS-SPEC §6`, `MODULO-CC-SPEC §6`, `MODULO-BUD-SPEC §6`, `MODULO-BANK-SPEC §6`, `MODULO-INVEST-SPEC §6`, `MODULO-DRE-SPEC §6`, `MODULO-HR-SPEC §6`, `MODULO-SHIFT-SPEC §6`, `MODULO-TRAIN-SPEC §6`, `MODULO-PERF-SPEC §6` `MODULO-POL-SPEC §6`, `MODULO-MALL-SPEC §6`, `MODULO-LEASE-SPEC §6`, `MODULO-FUND-SPEC §6`, `MODULO-PARK-SPEC §6` e `MODULO-SEC-SPEC §6`. São a fonte de estado, e o CI (`pnpm verificar:docs`) falha se um documento declarar **NÃO CONSTRUÍDO** algo que já existe no disco. Negar o que existe é a Lei 7 com o sinal trocado, e é o erro mais fácil de cometer: não exige escrever nada, basta não apagar.
  ⚠️ **E conte as linhas ✅ da saída.** Na Etapa 15 descobriu-se que o rebase juntara a entrada do Módulo 6 com a do Módulo 7 no mesmo objeto literal do verificador: em JavaScript a segunda chave sobrescreve a primeira, o script seguiu verde e **deixou de conferir uma peça sem falhar nem acusar**.

---

## 6. ESTRUTURA (não invente pastas)

```
docs/canon/            taxonomia · roadmap · core-spec · identidade-visual
                       · modulo-recon-spec · modulo-marketing-spec
                       · modulo-ap-spec · modulo-crm-spec · modulo-ar-spec
                       · modulo-po-spec · modulo-ops-spec · modulo-inv-spec
                       · modulo-quote-spec · modulo-deal-spec
                       · modulo-evt-spec · modulo-dun-spec
                       · modulo-ctr-spec · modulo-cash-spec
                       · modulo-care-spec · modulo-occ-spec
                       · modulo-mnt-spec · modulo-pat-spec
                       · modulo-chk-spec · modulo-spc-spec
                       · modulo-vis-spec · modulo-lead-spec
                       · modulo-goal-spec · modulo-comm-spec
                       · modulo-edcal-spec · modulo-media-spec
                       · modulo-nps-spec · modulo-cc-spec
                       · modulo-bud-spec · modulo-bank-spec
                       · modulo-invest-spec · modulo-dre-spec
                       · modulo-hr-spec · modulo-shift-spec
                       · modulo-train-spec · modulo-perf-spec
                       · modulo-pol-spec
                       · modulo-mall-spec · modulo-lease-spec
                       · modulo-fund-spec · modulo-park-spec
                       · modulo-sec-spec · modulo-esg-spec
                       · modulo-idea-spec · modulo-ip-spec
                       · modulo-fiscalcert-spec
                       · modulo-pdv-spec · modulo-catalog-spec
                       · modulo-cashregister-spec · modulo-loyalty-spec
                       · modulo-erisk-spec · modulo-control-spec
                       · modulo-whistle-spec · modulo-vuln-spec
                       · modulo-secincident-spec · modulo-continuity-spec
                       · modulo-plant-spec · modulo-subscription-spec
                       · modulo-genreading-spec · modulo-creditbalance-spec
                       · modulo-accred-spec · modulo-lineup-spec
                       · modulo-sponsor-spec
                       · modulo-booking-spec · modulo-professional-spec
                       · modulo-commission-spec · modulo-pack-spec
                       · ONDA-DEZENOVE-DECISOES (as 23 capacidades)
                       · ONDA-VINTE-DECISOES (as 8 capacidades do Energia)
                       · ONDA-VINTE-E-UM-DECISOES (as 8 capacidades da Saúde)
                       · ONDA-EVENTOS-DECISOES (as 8 capacidades dos Eventos)
                       · ONDA-BELEZA-DECISOES (as 6 capacidades da Beleza)
                                                        — leitura obrigatória
docs/comercial/        VERTICAL-SHOPPING.md             — dossiê de venda
docs/balancos/         tecnologia + supabase            — de onde minerar
docs/historico/        catálogo anterior                — memória, não canon
supabase/migrations/   0001_core … 0014_ap_apply_recon_match
                                                        — APLICADAS, não editar
                       0017_po · 0018_ops · 0019_forge
                       · 0020_ops_machine_draft
                       · 0021_tenant_panel
                       · 0022_revoke_public_execute      — arquivo; apply do dono
                       0023_inv · 0024_quote · 0025_deal · 0026_evt
                       · 0027_dun                        — Missão Trina; apply do dono
                       0028_ctr · 0029_cash · 0030_care · 0031_occ
                       · 0032_mnt                        — Missão Quadra; apply do dono
                       0033_pat · 0034_chk · 0035_spc · 0036_vis
                       · 0037_lead                       — Missão Penta; apply do dono
                       0038_goal · 0039_comm · 0040_edcal · 0041_media
                       · 0042_nps                        — Missão Sexta; apply do dono
                       0043_cc · 0044_bud · 0045_bank · 0046_invest
                       · 0047_dre                         — Missão Sete (Bloco
                                                            Financeiro); apply do dono
                       0048_hr · 0049_shift · 0050_train · 0051_perf
                       · 0052_pol                         — Missão Oito (Bloco
                                                            de Pessoas); apply do dono
                       0053_mall · 0054_lease · 0055_fund · 0056_park
                       · 0057_sec                         — Missão Nove (Vertical
                                                            Shopping Centers); apply do dono
                       0058_vendor · 0059_rfq · 0060_recv · 0061_vperf
                       · 0062_reorder                     — Onda Dez (Fase 2 —
                                                            completar o Domain Compras); apply do dono
                       0063_dem · 0064_sop · 0065_dc · 0066_disp
                       · 0067_logperf                     — Onda Onze (Fase 2 —
                                                            abrir o Domain Supply Chain); apply do dono
                       0068_proj · 0069_sched · 0070_kanban · 0071_alloc
                       · 0072_pcost                       — Onda Doze 1/2 (Fase 2 —
                                                            abrir o Domain PMO & Projetos); apply do dono
                       0073_scrum · 0074_gantt · 0075_risk · 0076_timesheet
                       · 0077_pfolio                      — Onda Treze 2/2 (Fase 2 —
                                                            FECHA o Domain PMO & Projetos,
                                                            10/10); apply do dono
                       0078_nc · 0079_audit · 0080_capa · 0081_iso
                                                          — Onda Quatorze (Fase 2 —
                                                            ABRE o Domain Qualidade); apply do dono
                       0082_esg                           — Onda Quinze (Fase 2 —
                                                            ABRE o Domain ESG &
                                                            Sustentabilidade); apply do dono
                       0083_idea · 0084_ip                — Onda Dezesseis (Fase 2 —
                                                            ABRE o Domain Pesquisa &
                                                            Desenvolvimento); apply do dono
                       0085_fiscalcert                    — Onda Dezessete (Fase 2 —
                                                            ABRE o Domain Contábil &
                                                            Fiscal; 7/8 FORA por Lei 3);
                                                            apply do dono
                       0086_pdv · 0087_catalog · 0088_cashregister
                       · 0089_loyalty                     — Onda Dezoito (Fase 2 —
                                                            ABRE o Vertical Varejo &
                                                            Supermercados); apply do dono
                       0090_erisk · 0091_control · 0092_whistle · 0093_vuln
                       · 0094_secincident · 0095_continuity  — Onda Dezenove
                                                            (Fase 3 — FECHA os 18
                                                            Domains: GRC + InfoSec;
                                                            IA Aplicada ZERO módulo);
                                                            apply do dono
                       0096_plant · 0097_subscription
                       · 0098_genreading · 0099_creditbalance  — Onda Vinte
                                                            (Fase 3 — ABRE o Vertical
                                                            ☀️ Energia); apply do dono
                       0100_patient · 0101_appointment · 0102_record
                       · 0103_prescription · 0104_exam        — Onda Vinte e Um
                                                            (Fase 3 — ABRE o Vertical
                                                            🏥 Saúde; DADO SENSÍVEL:
                                                            trilha de LEITURA em
                                                            record/exam/prescription);
                                                            apply do dono
                       0105_proc · 0106_ombuds · 0107_bid
                       · 0108_fisc                        — Onda Governo
                                                            (Fase 3 — ABRE o Vertical
                                                            🏛 Governo; fisc = decisão
                                                            de dono, roster + livro do
                                                            sec; auto de infração e
                                                            Tributos FORA por Lei 3);
                                                            apply do dono
                       0109_accred · 0110_lineup · 0111_sponsor  — Onda Eventos
                                                            (Fase 3 — ABRE o Vertical
                                                            🎪 Eventos; maior risco de
                                                            duplicação: evt/canta-siriema/
                                                            events-os; Ingressos e
                                                            Afiliados FORA por Lei 3 +
                                                            canta-siriema); apply do dono
                       0112_booking · 0113_professional · 0114_commission
                       · 0115_pack                        — Onda Beleza
                                                            (Fase 3 — ABRE o Vertical
                                                            💇 Beleza & Estética;
                                                            Fidelidade→loyalty, Estoque
                                                            de produtos→inv/catalog FORA;
                                                            pack = Módulo 100); apply do dono
                       0116_tenant_insights · 0117_insight_cron
                                                          — o INSIGHT PROATIVO
                                                            (Core, não módulo: a
                                                            superfície core.tenant_insights
                                                            + o cron comentado);
                                                            apply do dono
                       0118_tenant_insight_history         — o LIVRO append-only
                                                            (Avisador → Analista:
                                                            tendência vs média
                                                            recente); apply do dono
                       0119_tenant_timezone                — DATA NO FUSO DO TENANT
                                                            (core.tenants.timezone +
                                                            core.tenant_today): corrige
                                                            o "vencido = data do servidor
                                                            UTC"; insight + Engenheiro
                                                            passam a usar tenant_today;
                                                            apply do dono
                       (lacuna 0015–0016 proposital; próxima livre: 0120)
supabase/seed/         0001_platform.sql                — catálogo, idempotente; zero tenant
supabase/tests/        shim · isolamento · uso · consumo entre módulos
                       · instalador · triângulo · relacionamentos · a receber
                       · triângulo crédito ar→recon · ciclo fechado recon→ar
                       · ciclo fechado recon→ap · pedidos (po) · esteira (ops)
                       · estoque (inv) · propostas (quote) · funil (deal)
                       · eventos (evt) · triângulo da régua (dun)
                       · contratos (ctr) · caixa (cash) · atendimento (care)
                       · ocorrências (occ) · manutenção (mnt)
                       · patrimônio (pat) · checklists (chk) · espaços (spc)
                       · visitas (vis) · leads (lead) · metas (goal)
                       · comunicados (comm) · calendário editorial (edcal)
                       · biblioteca de mídia (media) · pesquisas (nps)
                       · centros de custo (cc) · orçamentos (bud)
                       · contas bancárias (bank) · investimentos (invest)
                       · DRE gerencial (dre)
                       · colaboradores (hr) · escalas (shift)
                       · treinamentos (train) · avaliação (perf)
                       · políticas (pol)
                       · lojistas (mall) · locação (lease)
                       · fundo de promoção (fund) · estacionamento (park)
                       · segurança/rondas (sec)
                       · pacientes (patient) · agenda médica (appointment)
                       · prontuário+trilha (record) · receitas+trilha (prescription)
                       · exames+trilha (exam)
                       · credenciamento+check-in (accred) · programação (lineup)
                       · patrocínios (sponsor)
                       · agendamento (booking) · profissionais (professional)
                       · comissões (commission) · pacotes (pack)
                       · insight proativo (tenant_insights)
                       · histórico de insight (tenant_insight_history)
                                                        — só CI; NUNCA no Supabase real
docs/runbook/          APLICAR.md                       — o passo a passo do dono
.github/scripts/       guarda de defasagem de documento — encanamento de CI
apps/                  portal — o Painel Executivo (home) + login
                              + 4 telas do Módulo 1 + campanhas + Store
                              + contas a pagar + relacionamentos
                              + contas a receber + compras
                              + esteiras/quadro/OS + ajustes (marca)
                       api    — A COMPOSIÇÃO; roda com service_role.
                                É o ÚNICO lugar com chave de motor
                       admin · store — só README
packages/              core auth organizations workflow billing
                       permissions                      — catálogo da Store + menu
                       notifications documents finance
                       legal hr analytics integrations ui sdk config
                       ai                               — a FORJA (Core, não módulo)
                       finance-reconciliation           — Módulo 1
                       marketing                        — Módulo 2 (prova o Lego)
                       accounts-payable                 — Módulo 3 (fecha o triângulo)
                       crm                              — Módulo 4 (anti-viés difícil)
                       accounts-receivable              — Módulo 5 (espelho consciente)
                       purchase-orders                  — Módulo 6 (pedidos)
                       ops                              — Módulo 7 (a esteira do tenant)
                       inventory                        — Módulo 8 (o livro do estoque)
                       quotes                           — Módulo 9 (a promessa por documento)
                       deals                            — Módulo 10 (o mapa do comercial)
                       event-management                 — Módulo 11 (o evento universal)
                       dunning                          — Módulo 12 (a régua que escuta)
                       contracts                        — Módulo 13 (o termo vigente calculado)
                       cashflow                         — Módulo 14 (o livro do dinheiro)
                       care                             — Módulo 15 (a terceira identidade)
                       occurrences                      — Módulo 16 (o fato que não se reescreve)
                       maintenance                      — Módulo 17 (a ordem que volta)
                       assets                           — Módulo 18 (o lugar que o livro diz)
                       checklists                       — Módulo 19 (a prancheta congelada)
                       spaces                           — Módulo 20 (a física na constraint)
                       visits                           — Módulo 21 (a passagem única)
                       leads                            — Módulo 22 (o interesse com origem)
                       goals                            — Módulo 23 (o alvo informa, o dono decide)
                       comms                            — Módulo 24 (a palavra dada que congela)
                       editorial                        — Módulo 25 (o plano muda, o fato fica)
                       media                            — Módulo 26 (catálogo, não cofre)
                       nps                              — Módulo 27 (a régua do método)
                       cost-centers                     — Módulo 28 (o custo se divide)
                       budgets                          — Módulo 29 (a trave que congela)
                       bank-accounts                    — Módulo 30 (o livro por conta)
                       investments                      — Módulo 31 (a terceira resposta)
                       dre                              — Módulo 32 (o resultado dos livros)
                       hr                               — Módulo 33 (o roster: on_leave volta, terminated não)
                       shift-scheduling                 — Módulo 34 (a escala: a física do spc na pessoa)
                       training                         — Módulo 35 (o treino: a identidade do evt)
                       performance                      — Módulo 36 (avaliador × avaliado, não o goal)
                       policies                         — Módulo 37 (a política tem versão: o DIVERGE do comm)
                       mall                             — Módulo 38 (o primeiro vertical: o lojista volta)
                       lease                            — Módulo 39 (camada comercial sobre o ctr)
                       fund                             — Módulo 40 (o saldo nunca fica negativo)
                       park                             — Módulo 41 (a identidade do vis no veículo)
                       sec                              — Módulo 42 (só a ronda; o incidente é occ)
                       vendor                           — Módulo 43 (o fornecedor volta: o DIVERGE do hr)
                       rfq                              — Módulo 44 (o comprador premia: o DIVERGE do quote)
                       recv                             — Módulo 45 (receber a maior: a física do ar)
                       vperf                            — Módulo 46 (sem ciclo: a física do sec, não do perf)
                       reorder                          — Módulo 47 (só a config; a comparação é da tela, não lê o inv)
                       dem                              — Módulo 48 (o plano que congela ao publicar; published terminal)
                       sop                              — Módulo 49 (a governança sobre o plano; aprovar é papel próprio)
                       dc                               — Módulo 50 (o CD volta do arquivo: o DIVERGE do hr)
                       disp                             — Módulo 51 (o espelho invertido do recv: a saída)
                       logperf                          — Módulo 52 (a identidade do vperf; o avaliado é rota/CD)
                       proj                             — Módulo 53 (o projeto encerra e não reabre)
                       sched                            — Módulo 54 (o marco reabre: o DIVERGE do dem/bud)
                       kanban                           — Módulo 55 (a física do ops, escopo de projeto)
                       alloc                            — Módulo 56 (a alocação que volta: percentual, não horas)
                       pcost                            — Módulo 57 (o livro imutável; sem teto: o DIVERGE do fund)
                       scrum                            — Módulo 58 (a moldura temporal; um ativo por projeto na constraint)
                       gantt                            — Módulo 59 (a aresta entre marcos; registro mutável, sem caminho crítico)
                       risk                             — Módulo 60 (1-5 CHECK; mitigated reabre, closed terminal)
                       timesheet                        — Módulo 61 (o livro imutável de horas; realizado × alloc planejado)
                       pfolio                           — Módulo 62 (a última peça; PMO 10/10: portfólio N:N, um projeto em vários)
                       non-conformities                 — Módulo 63 (o desvio imutável; fechar exige a nota de verificação: o DIVERGE do occ)
                       audits                           — Módulo 64 (auditoria terminal; achado imutável FK intra-schema × nc id solto)
                       capa                             — Módulo 65 (tipo CHECK corrective/preventive; sem verified, não fecha)
                       iso                              — Módulo 66 (a conformidade MUTÁVEL: o DIVERGE de todo ciclo terminal)
                       esg                              — Módulo 67 (um módulo, quatro capacidades: metric_type CHECK; quantity >= 0)
                       idea                             — Módulo 68 (o funil sem project_id: a ideia existe antes do projeto — o DIVERGE do kanban)
                       ip                               — Módulo 69 (PI: tipo CHECK das 4 categorias; ciclo terminal sem reabertura)
                       fiscalcert                       — Módulo 70 (só metadado de certificado; 7/8 do domínio FORA por Lei 3; nunca o .pfx/chave/assinatura)
                       pdv                              — Módulo 71 (a venda comercial, não o documento fiscal; congela ao finalizar; o DIVERGE do rfq: sem open)
                       catalog                          — Módulo 72 (o cadastro do que se vende; SKU texto livre; active↔archived)
                       cashregister                     — Módulo 73 (o turno da gaveta; open→closed terminal; o DIVERGE do cash perpétuo)
                       loyalty                          — Módulo 74 (o livro de pontos imutável; direção no entry_type; resgate>saldo recusado)
                       erisk                            — Módulo 75 (o risco corporativo; sem project_id: o DIVERGE do risk; treatment 4 T's)
                       control                          — Módulo 76 (controles internos; tipo COSO CHECK; livro de testes imutável)
                       whistle                          — Módulo 77 (o canal de denúncias; anonimato físico: nunca grava quem denunciou)
                       vuln                             — Módulo 78 (vulnerabilidades; identidade nc/capa; duas respostas terminais)
                       secincident                      — Módulo 79 (resposta a incidentes; timeline NIST: o DIVERGE do occ)
                       continuity                       — Módulo 80 (continuidade; plano + livro de drills imutável; a última peça dos 18 Domains)
                       plant                            — Módulo 81 (usinas + geração distribuída consolidada; plant_type texto livre; active↔archived)
                       subscription                     — Módulo 82 (a fatia da geração; nasce ativa sem pending; cancelled terminal: o DIVERGE do catalog)
                       genreading                       — Módulo 83 (a leitura de geração imutável: a identidade do esg; usina obrigatória: o DIVERGE)
                       creditbalance                    — Módulo 84 (o livro de créditos SCEE; consumo>saldo recusado por física própria: a terceira resposta)
                       proc                             — Módulo 90 (a Lei das Etapas do ops no processo público; protocolo + decisão formal terminal)
                       ombuds                           — Módulo 91 (o anonimato-físico do whistle para o cidadão; Lei 13.460)
                       bid                              — Módulo 92 (o comprador premia do rfq; edital + homologated: o DIVERGE, Lei 14.133)
                       fisc                             — Módulo 93 (a física do sec; roster + vistoria imutável; auto de infração FORA por Lei 3)
                       accred                           — Módulo 94 (um schema, duas caps: credencial revogável + check-in imutável; a física do train/vis)
                       lineup                           — Módulo 95 (a grade mutável sem ciclo: o DIVERGE do sched; só registered/updated)
                       sponsor                          — Módulo 96 (a camada de patrocínio sobre o ctr/deal; active↔archived; entregáveis mutáveis: o DIVERGE do lease)
                       booking                          — Módulo 97 (a física do no-show do appointment sem PHI; cliente=crm id solto; serviço texto livre)
                       professional                     — Módulo 98 (o roster active↔archived: o DIVERGE do hr; cadeira alugada não é RH)
                       commission                       — Módulo 99 (o livro imutável de comissão por serviço; não é motor de cálculo, Lei 7)
                       pack                             — Módulo 100 (a peça 100; bundle de sessões, consumo>saldo recusado; o DIVERGE do loyalty fungível)
                       workflow (o correio) · billing (uso) · ai (a forja)
                                                        — Engines/capacidades do Core
```

Um módulo novo é uma pasta em `packages/` **mais** uma migration com schema próprio. Nunca uma tabela a mais no `core`.

Pasta ou conceito novo **exige aprovação do dono**. Simplifique antes de expandir. Reduza antes de criar.

---

## 7. FORMATO DE COMMIT

```
<type>: <description>
- bullet 1
- bullet 2
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
