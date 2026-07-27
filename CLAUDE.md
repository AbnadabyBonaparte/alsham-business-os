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

## 5. ESTADO ATUAL — ETAPA 6 (O CORREIO E A COBRANÇA)

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
- `apps/store`, `apps/admin`, `apps/api` e os demais 15 pacotes continuam **só com `README.md`** — status NÃO INICIADO.
- **As migrations são provadas no CI:** `0001` → `0002` → `0003` → seed aplicam de verdade num Postgres 17 limpo e passam nos testes de isolamento com usuário real (`supabase/tests/`), a cada mudança.

#### ⛔ 5.4.1 O apply de produção já aconteceu — `0001` e `0002` estão CONGELADAS

O dono informou em 27/07/2026 que aplicou `0001_core.sql`, `0002_recon.sql` e o seed num projeto Supabase de produção, com um tenant piloto. **Este repositório NÃO VERIFICOU esse apply** — nenhum agente conecta a banco remoto com dado de cliente, e o registro fica assim, literalmente, conforme §3.

A consequência é operacional e não é opinião:

- ❌ **Não edite `0001_core.sql` nem `0002_recon.sql`.** Arquivo aplicado é história. Se estivessem só no papel, corrigir no lugar seria certo; aplicados, editar faz o próximo ambiente nascer diferente da produção **em silêncio**. Correção vira migration nova.
- ✅ `0003_billing.sql` **ainda é só arquivo** — criado depois do apply, e a Etapa 6 foi instruída a não aplicá-lo. Aplicá-lo é ato do dono (runbook).
- A próxima migration é **`0004_*.sql`**.
- `packages/workflow` é **o correio do Core** — o entregador da caixa de saída: idempotência por consumidor, backoff exponencial, `dead` sem apagar. **ENGINE, não módulo** (Taxonomia §4): não aparece na Store. A lógica existe e é testada; **ligar em produção é ato do dono** (runbook §6).
- `packages/billing` é a **contabilidade de uso** — `usage_ledger` + leitura de limite, minerados do kraken-v2 (PROVADO). **Sem preço, e há guarda no CI para que continue assim** (Lei 7).
- `supabase/migrations/0003_billing.sql` — o livro-caixa de consumo. Correção é estorno, nunca edição.
- `supabase/seed/0001_platform.sql` — o catálogo da plataforma, idempotente. **Zero tenant, zero usuário.**
- `docs/runbook/APLICAR.md` — o passo a passo do apply, a conferência de segurança pós-apply e (§6) as duas formas de ligar o correio.
- `apps/portal` tem **login (Supabase Auth) e quatro telas**: importar extrato, mesa de conciliação, fila de aprovação e fechar período. Next.js 16.2.12 + React 19 + Tailwind 4, toda cor vinda dos tokens `--bos-*`.
- O **parser de OFX/CSV** vive em `packages/finance-reconciliation/src/parsing/` — ler extrato é regra de negócio, não tela.
- **Segurança de tenant:** o `tenant_id` vem sempre da sessão cruzada com `core.memberships`, resolvido no servidor. Nunca de URL, formulário ou variável de ambiente. A `service_role key` não entra em `apps/` — há guarda no CI sobre o bundle de cliente.

### 5.5 A LEI DO LEGO — para todo módulo, deste em diante

O Módulo 1 é o padrão. Quem escrever o Módulo 2 obedece ao mesmo:

1. **Schema próprio.** Nenhum módulo cria objeto no schema `core`.
2. **Uma porta só.** O módulo fala com o mundo por `<modulo>.emit_event()`, que escreve em `core.event_outbox`. Nada de chamada direta.
3. **Nada de ler tabela alheia.** Precisa do dado de outro módulo? Projeção local alimentada por evento. O acoplamento é com o **tipo do evento**, nunca com o código de quem emite.
4. **Tudo pelo manifesto.** Capacidade, permissão (com prefixo do módulo) e evento que não estejam no `ModuleManifest` não existem.
5. **Só o Core como dependência.** `requiresCore` é o único campo de dependência que existe — e a ausência de `dependsOn` é deliberada.
6. **Consumo só com consumidor.** Não declare `consumes` sem o handler construído (Lei 7).

### 5.6 Limites que continuam valendo

- ❌ **Não criar projeto Supabase. Não aplicar migration. Não deployar. Não adicionar segredo.**
- Migration nasce como arquivo versionado e é revisada em PR. Aplicar é ato do dono.
- **Toda UI nasce consumindo os tokens `--bos-*`** de `docs/canon/IDENTIDADE-VISUAL.md`. Nenhum HEX em componente — o CI barra.
- **A Regra de Ouro (§5.3) é verificada no CI**, não só recomendada: se o motor de domínio for redeclarado em `apps/`, ou se a tela deixar de chamá-lo, o build falha.
- **Entregou peça? Atualize a linha dela** em `CORE-SPEC §5` e `MODULO-RECON-SPEC §7` — são a fonte de estado, e o CI (`pnpm verificar:docs`) falha se um documento declarar **NÃO CONSTRUÍDO** algo que já existe no disco. Negar o que existe é a Lei 7 com o sinal trocado, e é o erro mais fácil de cometer: não exige escrever nada, basta não apagar.

---

## 6. ESTRUTURA (não invente pastas)

```
docs/canon/            taxonomia · roadmap · core-spec · identidade-visual
                       · modulo-recon-spec              — leitura obrigatória
docs/balancos/         tecnologia + supabase            — de onde minerar
docs/historico/        catálogo anterior                — memória, não canon
supabase/migrations/   0001_core · 0002_recon — APLICADAS, não editar (§5.4.1)
                       0003_billing           — arquivo; aplicar é ato do dono
supabase/seed/         0001_platform.sql                — catálogo, idempotente; zero tenant
supabase/tests/        shim + isolamento multi-tenant   — só CI; NUNCA no Supabase real
docs/runbook/          APLICAR.md                       — o passo a passo do dono
.github/scripts/       guarda de defasagem de documento — encanamento de CI
apps/                  portal (login + 4 telas do Módulo 1) · admin · store · api
packages/              core auth organizations permissions workflow billing
                       notifications documents ai crm finance marketing
                       legal hr analytics integrations ui sdk config
                       finance-reconciliation           — Módulo 1
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
