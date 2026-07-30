# 🛡 MÓDULO 42 — SEGURANÇA / RONDAS

## ALSHAM Business OS™ · Especificação do módulo · Vertical `shopping-centers`

> **Missão Nove (Onda 6 — a ÚLTIMA).** `module_id` = `sec`. **A ÚLTIMA
> PEÇA da campanha — 42/42.** Migration `0057_sec.sql` · pacote
> `@alsham/sec` · teste `47_sec_isolation.sql`. **ARQUIVO — apply é ato do
> dono (runbook §22).**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **Este módulo NÃO reescreve o `occ`.** Um shopping tem DOIS fatos de
  segurança, e são coisas diferentes:
  - O **incidente** (furto, briga, princípio de incêndio) JÁ É uma
    Ocorrência (`occ`, Módulo 16, que já existe): fato consumado que nasce
    imutável, com gravidade dada pelo tenant, tratativa em cadeia e
    encerramento com desfecho escrito. Recriar essa tabela aqui violaria a
    Lei do Reaproveitamento duas vezes — pela duplicação e pela física
    reinventada pior.
  - A **ronda** — o vigia passou pelo posto às 14h32 — é OUTRA coisa: não é
    um fato que se apura, é um checkpoint de rotina. É *isso*, e só isso,
    que este módulo constrói.
- ⭐⭐ **Consequência na física:** `sec.patrols` **NÃO TEM coluna de
  status** e **não tem função de transição própria**. A ronda é ATO
  PONTUAL — nasce pronta e nunca muda. Há teste de pacote (`lifecycle.test.ts`)
  que lê as duas migrations e EXIGE o contraste: o `occ` com ciclo de vida
  de incidente (`open → closed`, terminal, com desfecho obrigatório); o
  `sec` sem ciclo nenhum na ronda.
- ⭐ **O POSTO (checkpoint) TEM ciclo** — `active ↔ archived`, a física do
  `mall`/`spc`: o posto é o LUGAR, e um posto desativado por reforma que
  reabre é o MESMO posto — obrigá-lo a nascer de novo partiria o histórico
  de rondas em dois.
- ⭐ **A ronda é carimbada pelo SERVIDOR** — `passed_at`/`passed_by` são
  sempre `now()`/`auth.uid()` no INSERT (a hora do formulário é
  descartada), e depois de inserida é **IMUTÁVEL**: nem o dono do banco a
  reescreve (mesma física do `occ`/`crm`/`vis`) — corrigir é registrar
  outra passagem.
- **Segmento/tipo de posto é DADO DO TENANT** (texto livre), nunca enum —
  anti-viés reforçado: zero nome/organograma de cliente.

---

## 1. AS PEÇAS

- **`sec.checkpoints`** — os postos de verificação, desenho do tenant:
  `name` (texto livre), `status` (`active`/`archived`). RLS `enable`+`force`;
  sem DELETE; volta do arquivo.
- **`sec.patrols`** — ⭐⭐ o livro da ronda: `checkpoint_id` (FK ao posto,
  dentro do próprio schema), `passed_at`/`passed_by` (carimbo do
  servidor), `note` (texto livre opcional). **NENHUMA coluna de ciclo de
  vida.** RLS `enable`+`force`; SÓ SELECT e INSERT — nem update, nem
  delete, e um gatilho recusa os dois incondicionalmente, até para o dono
  do banco.

---

## 2. OS FATOS

`sec.patrol.recorded` — a ronda passou por um posto. O envelope leva o
posto pelo NOME carimbado (`checkpointName`) — quem escuta não faz join.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/sec`) entrega a régua:
`validateNewCheckpoint`, `validateNewPatrol`, `canArchiveCheckpoint`,
`canReopenCheckpoint`, `orderCheckpoints`, `orderPatrols`, `summarize`.

---

## 4. AS PERMISSÕES

- `sec.checkpoint.manage` — desenhar os postos (cadastrar, editar,
  arquivar, reabrir).
- `sec.patrol.record` — registrar a passagem da ronda por um posto.

⚠️ **Assimetria deliberada:** quem desenha o mapa de postos não precisa
ser quem ronda. Numa operação real, o vigia da madrugada só registra
passagens — ele não teria por que redesenhar o mapa de postos do shopping.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **O incidente de segurança** — NÃO mora aqui. É Ocorrência (`occ`,
  Módulo 16), que já existe. Este módulo não recria, não espelha e não
  referencia a tabela do `occ` (Sol Único; se um handler de projeção fizer
  sentido um dia, é integração futura, e nasce declarada — não promessa).
- **Integração com câmera, alarme, QR code ou catraca** — capacidade
  futura de integração (Lei 3); não construída.
- **Escala do vigia** — é o `shift` (Módulo 34, Escalas), que já existe.
  Este módulo não recria escala.
- **Credenciamento de prestador de serviço** — vertical à parte; fora de
  escopo desta peça.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado**
(runbook §22). A migration `0057_sec.sql`, o pacote `@alsham/sec` e o
teste `47_sec_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

⭐⭐ **Esta é a peça 42 de 42.** Com ela, a campanha das 6 Ondas (Missões
Trina, Quadra, Penta, Sexta, Sete, Oito e Nove) está completa no disco:
37 módulos de Domain + 5 módulos Vertical. Nenhum deles aplicado em
produção fora do que `CLAUDE.md §5.4.1` já registra como feito pelo dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §22`. Expor o schema `sec` na Data API.
`consumes` vazio → **sem redeploy do `apps/api`**.
