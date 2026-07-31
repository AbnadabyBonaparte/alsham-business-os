# MÓDULO 75 — Risco Corporativo (`erisk`)

> Domain 🏛 **Governança, Riscos & Compliance** (`grc`) · Onda Dezenove (Fase 3) · migration `0090_erisk.sql` · pacote `@alsham/erisk`
> **ABRE** o Domain GRC — o primeiro dos três Domains pendentes da Fase 3.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **registro de riscos corporativos**: o risco ESTRATÉGICO do negócio — "um
concorrente pode nos tirar o mercado", "a regulação pode mudar", "perdemos a
pessoa-chave" — com **descrição** em texto livre, **dono**, **categoria**, e a
**probabilidade** e o **impacto** na régua 1–5. A *Matriz de riscos* (a segunda
capacidade da §5) não é uma segunda tabela: é a **leitura** deste registro
(probabilidade × impacto), ordenando a fila pela severidade.

Duas capacidades da Taxonomia — *Gestão de riscos* E *Matriz de riscos* — num
módulo só, porque na física são a mesma coisa vista de dois ângulos.

---

## 2. ⭐⭐ O DIVERGE ASSINADO — `erisk` × `risk` (o escopo)

O `risk` (Domain `pmo`) **já existe**. Este NÃO o duplica — e a pergunta,
escrita antes de escrever a primeira linha, foi: *risco de PROJETO e risco
CORPORATIVO são a mesma coisa?*

| | `risk` (o de ENTREGA) | `erisk` (o de NEGÓCIO) |
|---|---|---|
| escopo | um PROJETO (`project_id NOT NULL`) | a EMPRESA (sem projeto) |
| o que é | "este projeto pode atrasar" | "o mercado pode virar" |
| tempo de vida | some quando o projeto acaba | vive enquanto a empresa vive |
| dono | não tem | `owner` — figura central da gestão de risco |
| tratamento | não tem | os **4 T's da ISO 31000** |

Copiar a física de um módulo por consistência seria o erro que o canon nomeia.
Escrever o DIVERGE é a lei.

---

## 3. ⭐ O QUE SE MANTÉM (o MANTIDO assinado) e o que DIVERGE

**MANTIDO do `risk`, de propósito:**

- ⭐ **A régua 1–5 é CHECK argumentado** — física do MÉTODO (o precedente do
  `nps`/`vperf`). Fora de 1..5 não é "outro jeito de medir"; é dado inválido, e
  o banco recusa.
- ⭐ **A severidade NÃO é coluna — é leitura.** Severidade = probabilidade ×
  impacto, e serve só para ORDENAR a fila (`orderRisks()` no pacote). É a Matriz
  de riscos. Congelá-la carregaria uma decisão que é só apresentação.
- ⭐⭐ **A física do ciclo:** o risco nasce `open`, pode virar `mitigated`, e
  termina em `closed`. `mitigated` **REABRE** (`mitigated → open`, o MESMO risco,
  quando a mitigação para de funcionar); `closed` é **TERMINAL** (o que recorre
  é registro novo). Ao reabrir, o carimbo de mitigação é **LIMPO** — mentir que
  a mitigação continua em vigor seria pior do que não ter carimbo.

**DIVERGE do `risk` (os campos do escopo corporativo, que o `risk` não tem):**

- ⭐ `category` **TEXTO LIVRE** (estratégico/operacional/financeiro/reputacional
  — vocabulário de cada casa, nunca enum).
- ⭐ `owner` **TEXTO LIVRE** + `owner_id` **id solto OPCIONAL** ao roster de
  pessoas — o DONO do risco.
- ⭐⭐ `treatment` — a **ESTRATÉGIA DE TRATAMENTO** da **ISO 31000**:
  `accept` / `mitigate` / `transfer` / `avoid`, os **4 T's**. CHECK argumentado
  (física do MÉTODO), **OPCIONAL**: um risco recém-registrado pode ainda não ter
  a estratégia decidida — Lei 7, quem decide escreve.
- ⭐ `control_id` — **id solto OPCIONAL** ao controle interno que mitiga o risco
  (o `control`, Módulo 76). Nunca FK cruzada.

O conteúdo **CONGELA** quando o risco encerra.

---

## 4. AS PEÇAS · OS FATOS · AS PERMISSÕES

- `erisk.entries` — o registro. Nascimento sempre `open`, autor pelo servidor;
  transição gated por `erisk.entry.manage`; carimbo de mitigação/fechamento pelo
  servidor; carimbo de mitigação LIMPO na reabertura; conteúdo congela no fim.
  Sem DELETE — registro de risco é história.
- Fatos: `erisk.entry.registered` · `erisk.entry.mitigated` ·
  `erisk.entry.reopened` · `erisk.entry.closed`. Payload autossuficiente.
  `consumes` **VAZIO** (Lei 7 — sem redeploy do `apps/api`).
- Permissão: `erisk.entry.manage`.
- ⛔ FORA: matriz/heatmap em coluna (é leitura); pontuação automática / IA;
  simulação de Monte Carlo; categoria congelada em enum.

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — ABRE o Domain GRC).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §32).

- `supabase/migrations/0090_erisk.sql` — `erisk.entries`, RLS, régua 1–5 CHECK,
  os 4 T's da ISO 31000 (CHECK), ciclo `open → mitigated → closed` com
  `mitigated` que reabre e `closed` terminal, carimbo limpo na reabertura,
  conteúdo congelado no fim. Sem `project_id` (o DIVERGE). Sem coluna de
  severidade (é leitura).
- `packages/erisk` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`,
  `orderRisks()`) e testes.
- Seed: cartão 75 (`domain_key='grc'`). Catálogo **74 → 75**.

⭐ **Ao aplicar (runbook §32):** expor o schema `erisk` na Data API; **sem
redeploy** (`consumes` vazio).

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
