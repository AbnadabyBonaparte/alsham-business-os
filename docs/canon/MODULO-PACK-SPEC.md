# 💇 MÓDULO 100 — PACOTES

## ALSHAM Business OS™ · Especificação do módulo · Vertical `beauty`

> **Fase 3.** `module_id` = `pack`. ⭐⭐ **É o Módulo 100 do catálogo — a peça
> que fecha a campanha "rumo aos 100 módulos".** Cartão VERTICAL do catálogo
> (💇 Beleza & Estética). Migration `0115_pack.sql` · pacote `@alsham/pack` ·
> teste `105_pack_isolation.sql`. **ARQUIVO — apply é ato do dono. NÃO
> MERGEIE — o merge é do dono.**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O pacote fechado de sessões — a física do `loyalty`/`invest`, com o
  DIVERGE assinado.** O cliente compra N sessões de um serviço; cada visita
  consome uma; não se consome mais do que resta. O que se MANTÉM do `loyalty`: o
  **saldo é VIEW** calculada do livro (`total − usos`, NUNCA coluna — a física
  do `cash`/`inv`), e **consumir mais que o saldo é RECUSADO** (a TERCEIRA
  resposta ao "pode ficar negativo?", o gatilho soma INTRA-schema). O que
  DIVERGE: um ponto de fidelidade é **fungível** (uma carteira genérica por
  cliente, com a direção no `entry_type` earn/redeem); um **pacote não é
  fungível** — é um bundle amarrado a **UM serviço** (`service`, TEXTO LIVRE) e
  **UM cliente** (`client_id`, id solto ao crm), com identidade de **COMPRA**
  própria: o `total_sessions` congela na compra. Não há "earn": a compra nasce
  com o teto, e o uso só SUBTRAI.
- ⭐⭐ **A TERCEIRA resposta ao "pode ficar negativo?", por física própria.** O
  `bank` permite saldo negativo (cheque especial), o `inv` permite (físico), o
  `loyalty`/`invest` recusam (promessa/posse). O `pack` RECUSA porque a sessão
  que não foi comprada não existe: inventá-la seria mentir sobre o que a cliente
  pagou. O gatilho de `pack.uses` soma os usos do pacote **no próprio schema**
  (`pack.uses` + `pack.packages`) e recusa o uso que passa da trave, com
  mensagem clara ("pacote esgotado: as N sessões já foram consumidas").
- ⭐ **Duas tabelas, duas identidades:** a COMPRA (`pack.packages`, o cabeçalho
  que congela a trave) e o LIVRO DE USOS (`pack.uses`, imutável). Ligadas por
  **FK REAL intra-schema** `(package_id, tenant_id) → pack.packages(id,
  tenant_id)` — o contraste com o `client_id` SOLTO do pacote: o vínculo COM O
  PRÓPRIO MÓDULO é FK; o vínculo com o crm é id solto.
- ⭐ **O cabeçalho CONGELA — nem o dono do banco altera a trave.** O
  `total_sessions` é a promessa vendida à cliente; mudá-lo depois seria mentir
  sobre o que ela comprou. Sem grant de UPDATE (camada 1), e o gatilho recusa
  até para o dono (camada 2, "compra fechada"). Não há máquina de estados:
  cancelamento/estorno é declarado FORA.
- ⭐ **O uso é IMUTÁVEL nas duas camadas** (a física do `loyalty`/`timesheet`):
  o cliente não tem porta de UPDATE/DELETE (sem grant), e o gatilho recusa até
  para o dono ("fato consumado"). Corrigir é registrar outro pacote, nunca
  reescrever.
- ⭐ **Duas permissões, divididas por TABELA (como no sponsor/lease):**
  `pack.package.manage` registra a COMPRA (vender o pacote); `pack.session.record`
  registra o USO (dar baixa numa visita). O balcão e a cadeira são ofícios
  diferentes, e o teste assina a assimetria.
- ⛔ **Preço/valor do pacote FORA (comercial — o `ar`, futuro).** O módulo conta
  SESSÕES, não dinheiro: quanto custou o pacote e o título a receber por sessão
  são do `ar` (por id solto quando construído). Expiração por relógio também
  FORA (sem cron fingido — Lei 7; a baixa por validade, quando construída, é um
  uso com motivo).

---

## 1. AS PEÇAS

- **`pack.packages`** — a compra: `client_id` (id solto ao crm, **obrigatório**)
  + `client_name` (texto carimbado pela tela), `service` (texto livre,
  obrigatório, não-vazio), `total_sessions` (integer, **> 0** — a trave que
  congela), `note` (texto opcional), `created_at`/`created_by` (servidor).
  `unique (id, tenant_id)` para a FK do uso. **Sem status, sem updated_at,
  imutável** (gatilho `pack.guard_package_immutable`).
- **`pack.uses`** — o livro de consumo: `package_id` (**FK real intra-schema**),
  `used_on` (date, obrigatório), `note` (opcional), `created_at`/`created_by`
  (servidor). **Imutável** (gatilho `pack.guard_use_immutable`); o gatilho de
  INSERT (`pack.guard_use_insert`) carimba o autor E confere a trave.
- **`pack.package_balances`** — ⭐ o saldo, VIEW `security_invoker`:
  `total_sessions`, `used_count`, `remaining = total_sessions − used_count`.
  NUNCA coluna.
- **`pack.emit_event`** — a única porta de saída (cinto `pack.%`).
- **`pack.can_access`** — `pack.package.manage` OU `pack.session.record`.

---

## 2. OS FATOS (o que sai pelo correio)

- **`pack.package.registered`** (v1) — um pacote foi comprado. Payload
  autossuficiente: `packageId`, `clientId`, `clientName`, `service`,
  `totalSessions`, `note`.
- **`pack.session.used`** (v1) — uma sessão foi consumida. Payload: `useId`,
  `packageId`, `usedOn`, `note`.

⚠️ Verbo no passado, sem underscore — o outbox recusa (`registered`, `used`).

---

## 3. O CICLO DE VIDA

Não há ciclo de vida: **não existe máquina de estados.** A compra congela na
criação; o uso é fato consumado. É `ledger + header`, como o `loyalty` — e por
isso NÃO há `allowed_transition` nem coluna `status`. Cancelamento/estorno do
pacote é declarado FORA (§5).

---

## 4. AS PERMISSÕES

- `pack.package.manage` — registrar a compra de um pacote (cliente por id solto,
  serviço em texto livre e o total de sessões).
- `pack.session.record` — dar baixa numa sessão do pacote (um uso, imutável).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Preço/valor do pacote e título a receber por sessão** — é comercial; o `ar`
  cuida disso (por id solto quando construído). O módulo conta SESSÕES.
- **Expiração automática por relógio** — sem cron fingido (Lei 7). A baixa por
  validade, quando construída, é um uso com motivo.
- **Cancelamento/estorno do pacote** — não há máquina de estados nesta etapa; a
  compra é fato consumado. Corrigir é registrar outro pacote.
- **Puxar o nome do cliente do `crm`** — o `client_id` é id solto + nome
  carimbado; `consumes` **VAZIO** (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO** — **arquivo, ainda não aplicado**. A migration `0115_pack.sql`,
o pacote `@alsham/pack` (manifesto, tipos, motor de saldo/validação e testes) e
o teste `105_pack_isolation.sql` existem no disco, e o cartão está no seed
(`0001_platform.sql`). `consumes` vazio. ⭐⭐ **É o Módulo 100 do catálogo.**
**Não aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Expor o schema `pack` na Data API. `consumes` vazio → **sem redeploy do
`apps/api`**. O cliente é vínculo por ID SOLTO (crm) — o mapa SCHEMA_DE do CI
reprova a leitura de schema alheio; a FK `pack.uses → pack.packages` é
INTRA-schema e permitida.
