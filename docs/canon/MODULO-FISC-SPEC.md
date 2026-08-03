# 🏛 MÓDULO 85 — FISCALIZAÇÃO

## ALSHAM Business OS™ · Especificação do módulo · Vertical `government`

> **Onda Governo.** `module_id` = `fisc`. Capacidade 8 de 8 do Vertical 🏛
> Governo. Migration `0108_fisc.sql` · pacote `@alsham/fisc` · teste
> `98_fisc_isolation.sql`. **ARQUIVO — apply é ato do dono (runbook §35).**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **Este módulo É a física do `sec` (Segurança/Rondas), re-perguntada para
  a fiscalização pública — e é o OPOSTO do `occ`.** A régua da decisão de dono
  (2026-08-03) não foi "dá pra encaixar em outro módulo", foi "a **física é a
  MESMA**":
  - O **`occ`** (Ocorrências, Módulo 16) PRESSUPÕE que o alvo já existe em
    outro lugar (o ativo do `mnt`, o tenant do `care`); ele NÃO carrega um
    cadastro de alvos próprio. A ocorrência é um fato solto que se apura em
    cadeia.
  - A **fiscalização municipal** trabalha ao contrário: mantém um ROL de
    estabelecimentos/imóveis sob jurisdição que são vistoriados periodicamente.
    Isso é ROSTER + LIVRO DE CAMPO — a física EXATA do `sec`: **alvo/checkpoint
    + livro de vistoria imutável**.
- ⭐⭐ **Consequência na física** (a mesma do `sec`): `fisc.inspections` **NÃO
  TEM coluna de status** e **não tem função de transição própria**. A vistoria
  é ATO PONTUAL — nasce pronta e nunca muda. Há teste de pacote
  (`lifecycle.test.ts`) que lê a migration e EXIGE: a vistoria sem ciclo, o
  alvo com ciclo.
- ⭐ **O ALVO (target) TEM ciclo** — `active ↔ archived`, a física do
  `sec`/`mall`: o alvo é o ESTABELECIMENTO, e um alvo desativado que reabre é o
  MESMO alvo — obrigá-lo a nascer de novo partiria o histórico de vistorias em
  dois.
- ⭐ **A vistoria é carimbada pelo SERVIDOR** — `inspected_at`/`inspected_by`
  são sempre `now()`/`auth.uid()` no INSERT (a hora do formulário é
  descartada), e depois de inserida é **IMUTÁVEL**: nem o dono do banco a
  reescreve (mesma física do `occ`/`sec`) — corrigir é registrar outra
  vistoria.
- ⛔ **O AUTO DE INFRAÇÃO É FORA (Lei 3).** A penalidade com força de lei
  (multa, prazo de defesa, contraditório) é ato de império do Estado —
  integra-se, não se constrói (o precedente NF-e/SPED/eSocial/TISS). A vistoria
  só CONSTATA (`finding`, texto livre, pode ser vazio). Este módulo NÃO cria
  nenhuma tabela de auto/multa/penalidade — há teste de pacote e guarda de CI.
- **Natureza do alvo / órgão fiscalizador é DADO DO TENANT** (texto livre),
  nunca enum — anti-viés reforçado (um enum congelaria a lei de um ano e um
  país); zero nome de cliente.

---

## 1. AS PEÇAS

- **`fisc.targets`** — os alvos fiscalizáveis, o rol sob jurisdição (desenho do
  tenant): `name` (texto livre), `status` (`active`/`archived`). RLS
  `enable`+`force`; sem DELETE; volta do arquivo.
- **`fisc.inspections`** — ⭐⭐ o livro de vistorias: `target_id` (FK ao alvo,
  dentro do próprio schema), `inspected_at`/`inspected_by` (carimbo do
  servidor), `finding` (texto livre opcional). **NENHUMA coluna de ciclo de
  vida. NENHUMA coluna de auto/penalidade.** RLS `enable`+`force`; SÓ SELECT e
  INSERT — nem update, nem delete, e um gatilho recusa os dois
  incondicionalmente, até para o dono do banco.

---

## 2. OS FATOS

- `fisc.target.registered` — um alvo entrou no rol sob jurisdição (leva o nome
  carimbado).
- `fisc.inspection.recorded` — a vistoria constatou o alvo. O envelope leva o
  alvo pelo NOME carimbado (`targetName`) — quem escuta não faz join.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/fisc`) entrega a régua:
`validateNewTarget`, `validateNewInspection`, `canArchiveTarget`,
`canReopenTarget`, `orderTargets`, `orderInspections`, `summarize`.

---

## 4. AS PERMISSÕES

- `fisc.target.manage` — manter o rol de alvos (cadastrar, editar, arquivar,
  reativar).
- `fisc.inspection.record` — registrar a vistoria de um alvo.

⚠️ **Assimetria deliberada:** quem mantém o rol de alvos não precisa ser quem
vistoria em campo. Numa operação real, o fiscal de plantão só registra
vistorias — ele não teria por que mexer no cadastro de estabelecimentos sob
jurisdição.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **O auto de infração** (a penalidade com força de lei) — NÃO mora aqui. É
  documento de império do Estado, integração certificada (Lei 3). A vistoria
  CONSTATA; a autuação, quando existe, é outro ato, fora deste módulo.
- **O processo administrativo** que a autuação abre — é o `proc` (o protocolo
  público que anda por etapas do tenant), não este módulo.
- **Integração com sistema de arrecadação / dívida ativa** — capacidade fiscal
  certificada (Lei 3); não construída.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Onda Governo** — **arquivo, ainda não aplicado**
(runbook §35). A migration `0108_fisc.sql`, o pacote `@alsham/fisc` e o teste
`98_fisc_isolation.sql` existem no disco. `consumes` vazio. **Não aplicado em
produção** — aplicar é ato do dono.

⭐ É a capacidade 8 de 8 do Vertical 🏛 Governo (`proc`·`ombuds`·`bid`·`fisc`
construídos; Convênios→`ctr`, Patrimônio→`pat`, Tributos→Lei 3,
Obras→`proj`/`sched`/`pcost` declarados FORA). Ver `ONDA-GOVERNO-DECISOES.md`.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §35`. Expor o schema `fisc` na Data API.
`consumes` vazio → **sem redeploy do `apps/api`**.
