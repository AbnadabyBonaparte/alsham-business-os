# MÓDULO 76 — Controles Internos (`control`)

> Domain 🏛 **Governança, Riscos & Compliance** (`grc`) · Onda Dezenove (Fase 3) · migration `0091_control.sql` · pacote `@alsham/control`
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **cadastro dos controles internos** da empresa: a rotina de verificação que se
desenha para se proteger — "toda nota acima de X exige dupla aprovação", "o
estoque é contado todo mês", "acesso a servidor de produção é revisado a cada
trimestre". Cada controle tem **nome**, **dono** e **frequência** (texto livre),
o **tipo** na régua do COSO, e um **livro de testes**: o registro de cada vez que
o controle foi exercitado, com o resultado.

---

## 2. ⭐ POR QUE NÃO É `pol`, NEM `audit`, NEM `erisk`

Investigado contra o que já existe, peça a peça:

| Confusão possível | Por que é OUTRA coisa |
|---|---|
| **`pol` (Política)** | a política é o **DOCUMENTO versionado com ciência**; o controle é a **ROTINA OPERACIONAL**, com dono, frequência e RESULTADO do último teste. O documento pode viver no `pol`, à parte. |
| **`audit` (Auditoria)** | a auditoria é o **EVENTO periódico** de verificação com achados; o controle é o **mecanismo PERMANENTE** que a auditoria testa. |
| **`erisk` (Risco)** | o risco é o que **PODE dar errado**; o controle é o que se **faz para impedir**. O `erisk` aponta para o `control` por id solto (`control_id`). |

Um controle não é nenhum dos três — é a peça que faltava entre eles.

---

## 3. ⭐ O TIPO É CHECK ARGUMENTADO — a física do COSO

`control_type` é `preventive` / `detective` / `corrective`: as três naturezas
clássicas de controle interno do **COSO**. É a física do MÉTODO, não vocabulário
de casa (isso seria texto livre — a lição do `capa`/`mnt`). Fora dos três não é
"outro tipo de controle"; é dado inválido, e o banco recusa.

---

## 4. ⭐ DUAS FÍSICAS — o cadastro que volta, o teste que não se rasura

- ⭐ **O CONTROLE é cadastro:** `active ↔ archived` — o controle descontinuado é
  **arquivado, não apagado**, e volta se voltar a fazer sentido (a física do
  `vendor`, não a terminal do roster de pessoas). Arquivar/reativar exige a
  permissão **própria** `control.control.decide`.
- ⭐ **O TESTE do controle é LIVRO IMUTÁVEL** (a física do `timesheet`/`inv`):
  cada teste é um **FATO CONSUMADO** — data, resultado `pass`/`fail` (binário: a
  física do teste de controle é binária), nota. Sem status, sem `updated_at`. O
  cliente não tem porta de UPDATE/DELETE; o gatilho recusa reescrita **até para o
  dono do banco**. **Corrigir é registrar OUTRO teste** — a evidência de
  conformidade não se rasura.

O vínculo ao risco que o controle mitiga é por **id solto** (`erisk_id`).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — Domain GRC).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §32).

- `supabase/migrations/0091_control.sql` — `control.controls` (cadastro,
  `active ↔ archived`, tipo COSO CHECK) + `control.tests` (livro imutável,
  resultado `pass`/`fail`, gatilho anti-reescrita), RLS, `decide` própria para o
  ciclo, vínculo `erisk_id` id solto.
- `packages/control` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, ordenação
  do livro) e testes.
- Seed: cartão 76 (`domain_key='grc'`). Catálogo **75 → 76**.

Fatos: `control.control.registered` · `control.control.archived` ·
`control.control.reopened` · `control.test.recorded`. **`consumes` VAZIO** (Lei
7 — sem redeploy do `apps/api`).

⭐ **Ao aplicar (runbook §32):** expor o schema `control` na Data API; **sem
redeploy**.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
