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

## 5. ESTADO ATUAL — ETAPA 12 (O ESPELHO CONSCIENTE)

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
  ⚠️ **`consumes` é vazio, e é decisão de canon:** a conciliação de RECEBIMENTOS exigiria mudar o motor do Módulo 1, que recusa linha de crédito (`matching.ts`: `if (line.amountCents >= 0) return null;`) e cuja tabela de casamento tem `payable_id NOT NULL`. Está declarado NÃO CONSTRUÍDO com o que falta.
- ⭐ **Copiar sem pensar e divergir sem escrever são o mesmo erro.** Módulo novo que espelha um existente: re-pergunte cada decisão e escreva a resposta — inclusive as que se mantêm.
- ⭐ **A origem de um fato vem SEMPRE do envelope** (`producedBy`), nunca de constante no consumidor. Com ela chumbada, um segundo produtor do mesmo formato entraria disfarçado do primeiro e a trilha mentiria sem nunca dar erro. Há guarda no CI que reprova as três formas de chumbar.
- `apps/store` e `apps/admin` e os demais 12 pacotes continuam **só com `README.md`** — status NÃO INICIADO. (`packages/finance` segue NÃO INICIADO: os módulos financeiros nascem em pastas próprias, como manda §6.)
- ⚠️ **O seed é a FONTE do catálogo, não só a semente dele.** Desde a Etapa 10 os blocos de `core.module_registry` são `on conflict do update`, não `do nothing`: uma linha existente precisou mudar (o `recon` passou a escutar `ap.*`) e `do nothing` deixaria a Store exibindo o catálogo antigo para sempre, sem erro nenhum. Consequência: reaplicar o seed **desfaz edição feita à mão** no catálogo. Depreciar um módulo se faz mudando o arquivo.
- ⚠️ **Schema novo precisa ser EXPOSTO na Data API do Supabase pelo dono** (Project Settings → API → Exposed schemas). Lição paga na Etapa 9 e repetida nas 10, 11 e 12: sem isso as telas carregam vazias, sem erro que diga o motivo. Está no runbook §10.0.
- **As migrations são provadas no CI:** `0001` → … → `0010` + seed (duas vezes) aplicam de verdade num Postgres 17 limpo e passam nos testes de isolamento com usuário real (`supabase/tests/`), a cada mudança.

#### ⛔ 5.4.1 O apply de produção já aconteceu — `0001` a `0009` estão CONGELADAS

O dono informou, em 27/07 e 28/07/2026, ter aplicado `0001_core.sql` até `0009_crm.sql` e o seed num projeto Supabase de produção, com um tenant piloto — e instalado o módulo `ap` **pela Store**, com o primeiro título real registrado e o `ap.payable.registered` emitido e entregue pelo correio. **Este repositório NÃO VERIFICOU esse apply** — nenhum agente conecta a banco remoto com dado de cliente, e o registro fica assim, literalmente, conforme §3.

A consequência é operacional e não é opinião:

- ❌ **Não edite nenhuma migration de `0001` a `0009`.** Arquivo aplicado é história. Se estivessem só no papel, corrigir no lugar seria certo; aplicados, editar faz o próximo ambiente nascer diferente da produção **em silêncio**. Correção vira migration nova.
- ✅ `0010_ar.sql` **ainda é só arquivo** — criado depois do apply, e a Etapa 12 foi instruída a não aplicá-lo. Aplicá-lo é ato do dono (runbook §10).
- ✅ `0011_recon_receivables.sql` — **arquivo** (conciliação de recebimentos: `recon.receivables` + matches polimórficos). Aplicar **depois** do `0010`. A próxima é **`0012_*.sql`**.
- **`0001` a `0009` e o seed estão APLICADOS** (informado pelo dono; ⚠️ NÃO VERIFICADO aqui). `0010` e `0011` são arquivo.
- ⚠️ **PENDÊNCIAS DE INFRAESTRUTURA DO DONO — não são deste repositório, e nada aqui as conserta:** o **redeploy do `apps/api`** (sem ele a projeção do título no `recon` não acontece em produção, porque o host roda o build anterior ao consumidor; a caixa de saída guardou o evento e o correio reentrega quando subir), a **exposição do schema `crm`** na Data API, e a **instalação do `crm`** pela Store. Os testes no CI são a prova que vale.
- ⛔ **A limpeza do runbook §7.3 FOI EXECUTADA** em 28/07/2026: a concessão global de permissão de módulo **não existe mais em produção**. O tenant piloto tem papel próprio, com as permissões concedidas por `core.install_module()` — pela Store, com o clique do dono. Nunca volte a conceder permissão de módulo no seed.
- `packages/workflow` é **o correio do Core** — o entregador da caixa de saída: idempotência por consumidor, backoff exponencial, `dead` sem apagar. **ENGINE, não módulo** (Taxonomia §4): não aparece na Store.
- `apps/api` é **a COMPOSIÇÃO** — o único lugar do repositório onde os módulos se conhecem. Ele importa `workflow`, `marketing`, `finance-reconciliation` e `billing`; **nenhum deles importa nenhum outro**. ⭐ Desde a Etapa 10 o mesmo pacote (`finance-reconciliation`) é PRODUTOR numa inscrição e CONSUMIDOR em outra — e continua sem conhecer ninguém. Traz a persistência real do correio (contra Postgres, com arrendamento e `skip locked`), os adaptadores dos consumidores, o endpoint protegido e a saúde da fila.
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

O Módulo 1 é o padrão. Os Módulos 2 a 5 obedeceram ao mesmo; o próximo também:

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
- **Entregou peça? Atualize a linha dela** em `CORE-SPEC §5`, `MODULO-RECON-SPEC §7`, `MODULO-MARKETING-SPEC §6`, `MODULO-AP-SPEC §6`, `MODULO-CRM-SPEC §6` e `MODULO-AR-SPEC §5` — são a fonte de estado, e o CI (`pnpm verificar:docs`) falha se um documento declarar **NÃO CONSTRUÍDO** algo que já existe no disco. Negar o que existe é a Lei 7 com o sinal trocado, e é o erro mais fácil de cometer: não exige escrever nada, basta não apagar.

---

## 6. ESTRUTURA (não invente pastas)

```
docs/canon/            taxonomia · roadmap · core-spec · identidade-visual
                       · modulo-recon-spec · modulo-marketing-spec
                       · modulo-ap-spec · modulo-crm-spec · modulo-ar-spec
                                                        — leitura obrigatória
docs/balancos/         tecnologia + supabase            — de onde minerar
docs/historico/        catálogo anterior                — memória, não canon
supabase/migrations/   0001_core … 0009_crm            — APLICADAS, não editar
                       0010_ar · 0011_recon_receivables — arquivo; apply do dono
supabase/seed/         0001_platform.sql                — catálogo, idempotente; zero tenant
supabase/tests/        shim · isolamento · uso · consumo entre módulos
                       · instalador · triângulo · relacionamentos · a receber
                       · triângulo crédito ar→recon
                                                        — só CI; NUNCA no Supabase real
docs/runbook/          APLICAR.md                       — o passo a passo do dono
.github/scripts/       guarda de defasagem de documento — encanamento de CI
apps/                  portal (login + 4 telas do Módulo 1 + campanhas
                              + Store + contas a pagar + relacionamentos
                              + contas a receber)
                       api    — A COMPOSIÇÃO; roda com service_role
                       admin · store — só README
packages/              core auth organizations workflow billing
                       permissions                      — visão de catálogo da Store
                       notifications documents ai crm finance
                       legal hr analytics integrations ui sdk config
                       finance-reconciliation           — Módulo 1
                       marketing                        — Módulo 2 (prova o Lego)
                       accounts-payable                 — Módulo 3 (fecha o triângulo)
                       crm                              — Módulo 4 (anti-viés difícil)
                       accounts-receivable              — Módulo 5 (espelho consciente)
                       workflow (o correio) · billing (uso) — Engines do Core
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
