# ONDA VINTE — o Vertical ☀️ ENERGIA: as 8 capacidades, decisão por decisão

> Fase 3 · `vertical_key='energy'` (confirmado na `store-taxonomy.ts`) · migrations
> `0096`–`0099` · testes `86`–`89` · catálogo **80 → 84 módulos publicados**
> (13 verticais: 5 shopping-centers + 4 retail + 4 energy).
> **ARQUIVO — apply é ato do dono (runbook §33). NÃO MERGEIE — o merge é do dono.**

O segundo vertical do grupo (dor viva — Curva C Energia Solar). A Taxonomia §6
lista **8 capacidades**. Investigada cada uma com a régua anti-viés e a Lei do
Reaproveitamento (ROTEIRO §2 — "sem gambiarra" não é "sem juízo"): **4 viram
módulo, 4 ficam FORA por reaproveitamento** (nenhum número forçado).

| # | Capacidade (Taxonomia) | Decisão | Por quê |
|---|---|---|---|
| 1 | **Usinas** | ✅ **módulo `plant`** (81) | O cadastro da unidade geradora. |
| 2 | **Geração distribuída** | 🔗 **consolidada no `plant`** | Na física é o MESMO objeto — uma usina de porte menor atrás do medidor. Distinguida pelo campo `plant_type` (TEXTO LIVRE, nunca enum). Construir um segundo cadastro seria a duplicação que a Lei do Reaproveitamento proíbe (a disciplina do `esg`/`idea`/`ip`). |
| 3 | **Assinatura de energia** | ✅ **módulo `subscription`** (82) | O modelo de negócio central: o consumidor assina uma fatia (%) da geração. |
| 4 | **Monitoramento de geração** | ✅ **módulo `genreading`** (83) | O livro de leituras de geração. |
| 5 | **Manutenção de usina** | ⛔ **FORA → `mnt`** | É o Módulo 17 genérico (corretiva/preventiva), com `asset_id` SOLTO pronto para isso **desde a Onda Quadra** — o comentário do `0032_mnt.sql` já previu esse uso. Não se duplica o `mnt`. |
| 6 | **Créditos de compensação** | ✅ **módulo `creditbalance`** (84) | O livro de créditos do SCEE/ANEEL. |
| 7 | **Contratos de energia** | ⛔ **FORA → `ctr`** | É o Módulo 13 genérico (termo vigente calculado) com categoria "energia" — a MESMA decisão que o `lease` (Shopping) tomou para o contrato de locação. Não se duplica o `ctr`. |
| 8 | **Comercialização e leads** | ⛔ **FORA → `lead`** | É o Módulo 22 genérico (CRM) com origem "energia". Zero módulo novo. |

Resultado: **4 módulos construídos**, **4 capacidades DECLARADAS FORA por escrito**.

---

## Os 4 módulos — a física de cada um (com os DIVERGEs/reaproveitamentos assinados)

### 81 · `plant` — Usinas (e Geração distribuída) · `0096`
- `active ↔ archived` (a física do `catalog`/`vendor` — a usina que volta a operar
  é a MESMA; o DIVERGE do `hr` terminal).
- `capacity_kwp > 0`; `plant_type` TEXTO LIVRE (a consolidação de GD — nunca enum).
- `consumes` vazio. Ver `MODULO-PLANT-SPEC`.

### 82 · `subscription` — Assinatura de Energia · `0097`
- Cliente (id solto `crm`, obrigatório) + usina (id solto `plant`, obrigatória) +
  `allocation_percent` (`0 < x <= 100`).
- ⭐ **Nasce ativa — SEM `pending`** (o intermediário seria viés de uma
  distribuidora, não do produto). ⭐ `active → cancelled` **TERMINAL** — quem
  re-assina negocia OUTRA fatia (a física do `proj`, o **DIVERGE consciente do
  `catalog`**). Cancelar exige razão + `.decide`.
- `consumes` vazio. Ver `MODULO-SUBSCRIPTION-SPEC`.

### 83 · `genreading` — Monitoramento de Geração · `0098`
- ⭐ **Reaproveita a identidade do `esg`**: leitura periódica IMUTÁVEL (duas
  camadas), `generated_kwh >= 0` (zero é leitura real — à noite; o MANTIDO do
  `esg`), unidade TEXTO LIVRE, sem ciclo/status/`allowed_transition`.
- ⭐ **O DIVERGE do `esg`:** a usina é OBRIGATÓRIA (`plant_id NOT NULL` — não há
  geração no ar), por id solto. Performance ratio e alerta ficam FORA (motor futuro).
- `consumes` vazio. Ver `MODULO-GENREADING-SPEC`.

### 84 · `creditbalance` — Créditos de Compensação · `0099`
- ⭐ **Reaproveita a identidade do `loyalty`**: livro imutável, direção no
  `credit_type` (generated/consumed), `quantity_kwh > 0`, saldo é VIEW.
- ⭐⭐ **Consumir > saldo é RECUSADO — a TERCEIRA resposta, por física PRÓPRIA**
  (não copiada do `loyalty`): crédito é energia realmente gerada; saldo negativo
  inventaria energia inexistente (a razão infísica do `esg`). O `bank`/`inv`
  permitem negativo; o `loyalty`/`invest` recusam por promessa/posse; o
  `creditbalance` recusa porque **energia não se deve, se gera**. Contraste
  assinado no teste.
- `consumes` vazio. Ver `MODULO-CREDITBALANCE-SPEC`.

---

## Números da onda
- Migrations `0096`–`0099` (4 módulos) · testes SQL `86`–`89` · seed 4 cartões
  `vertical_key='energy'` · ≥5 sabotagens por módulo (86: 16 · 87: 17 · 88: 11 ·
  89: 15 asserts) · `consumes` VAZIO (SEM redeploy do `apps/api`).
- ⚠️ Ao aplicar: **expor os schemas `plant`, `subscription`, `genreading`,
  `creditbalance` na Data API**. Nenhum consome evento — sem redeploy.
- A lacuna `0015`–`0016` é proposital; a próxima migration livre é **`0100`**.
