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
- ❌ **Merge sem o dono** — você trabalha em branch e abre PR. **Você não mergeia.** O merge é do dono.
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
- ⚠️ **A lacuna `0015`/`0016` é proposital** e vem da main. Com a Onda Treze (`0073`–`0077`), a próxima numeração livre é **`0078`**.
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
                       · modulo-sec-spec
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
                       (lacuna 0015–0016 proposital; próxima livre: 0078)
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
