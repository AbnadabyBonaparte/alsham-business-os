# MÓDULO 73 — Sessão de Caixa (cashregister)

> Vertical 🛒 **Varejo & Supermercados** (`vertical_key='retail'`) · Onda Dezoito
> (Fase 2) · migration `0088_cashregister.sql` · pacote `@alsham/cashregister` ·
> teste `78_cashregister_isolation.sql`.
> O **terceiro** cartão do Vertical Varejo. **ARQUIVO — apply é ato do dono
> (runbook §31).**

---

## 1. O QUE É

A **sessão física de uma gaveta** — o turno de um operador de caixa. Abre-se
**contando o fundo de troco** (`opening_amount_cents`); fecha-se **contando a
gaveta** (`closing_amount_cents`). A gaveta física por nome em **texto livre**
("Caixa 1", "PDV Frente"); o operador por **id solto** ao `hr` (opcional —
temporário/terceiro não tem cadastro) + nome carimbado pela tela.

A abertura e o fechamento são carimbados pelo **servidor**
(`opened_at`/`opened_by`, `closed_at`/`closed_by`) — a hora digitada é
descartada. Uma constraint de coerência amarra o estado ao carimbo: `closed` ⇔
tem hora de fechamento **e** contagem de fechamento; `open` ⇔ não tem nenhum dos
dois.

---

## 2. ⭐⭐ O DIVERGE `cashregister` × `cash` — duas físicas, de propósito

Copiar sem pensar e divergir sem escrever são o mesmo erro. O `cash` (Módulo 14)
e este módulo têm a palavra "caixa" no nome — e são coisas **opostas**:

| | `cash` — Fluxo de Caixa | `cashregister` — Sessão de Caixa |
|---|---|---|
| o que é | livro-caixa **corporativo** | turno **físico** de uma gaveta |
| lançamentos | imutáveis, sinal do tipo | uma sessão com contagens |
| saldo | VIEW, nunca coluna | não é saldo — é contagem |
| ciclo de vida | **sem ciclo** — livro perpétuo | `open → closed` |
| tempo | ao longo do tempo, sem fim | um turno com **começo e fim** |

O `cash` é a contabilidade do dinheiro da empresa ao longo do tempo — um livro
que **nunca "fecha um turno"**. A sessão de caixa tem **começo e fim**: `open →
closed`, e `closed` é **TERMINAL** (a física do `scrum`/`bud`/`proj`) — o turno
encerrado não reabre, o próximo turno é sessão **NOVA**.

O teste assina o contraste: o `cash` **sem** `allowed_transition` (não tem ciclo);
este **com**, e `closed` terminal. Depois de fechada, a abertura CONGELA — caixa,
operador, fundo e contagem não mudam mais (fato consumado do turno).

---

## 3. ⭐ UMA SESSÃO ABERTA POR CAIXA — na constraint

Uma gaveta física não tem dois turnos abertos ao mesmo tempo. A regra mora num
**índice único PARCIAL** sobre `(tenant_id, register_name)` onde `status='open'`
— a física do domínio no banco, não em código de aplicação (a lição do
`scrum`/`spc`/`shift`). Abrir um segundo turno na mesma gaveta bate ali.

Fechar EXIGE a contagem física da gaveta — sem número, não fecha (Lei 7).

---

## 4. ⛔ A QUEBRA DE CAIXA É DE TELA — FORA do schema

A conferência **"esperado × contado"** (a quebra de caixa) exigiria **somar as
vendas do `pdv`** — leitura de schema alheio, acoplamento proibido pela Lei do
Lego. A composição vive na **TELA** (como os cartões do sprint no `scrum`),
alimentada de fora; aqui a sessão guarda só as **contagens físicas** (abertura e
fechamento).

- ***Quebra de caixa (esperado × contado)*** — composição de tela, não schema.
- ***Sangria/suprimento estruturado*** (movimentos de gaveta) — capacidade futura.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezoito (Fase 2 — Vertical Varejo & Supermercados).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §31).

- `supabase/migrations/0088_cashregister.sql` — `cashregister.sessions`, RLS
  `enable`+`force`, nascimento sempre `open` com carimbo do servidor, o índice
  único parcial (uma sessão aberta por caixa), ciclo `open → closed` terminal
  (`allowed_transition`), congelamento pós-fechamento, coerência de contagem e os
  fatos autossuficientes.
- `packages/cashregister` — manifesto (capacidade *Caixa*, permissão
  `cashregister.session.manage`, eventos `cashregister.session.opened/closed`),
  tipos, motor (`ALLOWED_TRANSITIONS`, o contraste com o livro perpétuo do `cash`)
  e as suítes de teste.
- Cartão 73 do catálogo (`vertical_key='retail'`). Catálogo **72 → 73**.

⭐ **Ao aplicar (runbook §31):** expor o schema `cashregister` na Data API; **sem
redeploy** do `apps/api` (`consumes` vazio; guarda de CI confere). O módulo não lê
venda — a quebra de caixa é de tela; o mapa SCHEMA_DE do CI confere que nenhuma
linha toca schema alheio.
