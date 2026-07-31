# MÓDULO 69 — Propriedade Intelectual (`ip`)

> Domain 🔬 **Pesquisa & Desenvolvimento** (`rnd`) · Onda Dezesseis (Fase 2) · migration `0084_ip.sql` · pacote `@alsham/ip`
> **FECHA** a Onda Dezesseis.

---

## 1. O QUE É

O **registro de ativos de propriedade intelectual** da empresa. Duas capacidades
da Taxonomia — *Propriedade intelectual* e *Patentes* — são a mesma coisa: uma
patente é **um tipo** de PI, ao lado da marca, do direito autoral e do segredo
industrial. Um módulo, com o tipo num CHECK.

---

## 2. ⭐⭐ O TIPO NUM CHECK — as quatro categorias do direito

O `asset_type` é um **CHECK** das quatro categorias clássicas de PI —
**física do direito, não vocabulário do tenant** (a mesma disciplina do `capa`
corrective/preventive e do `esg` carbon/water/…):

| tipo | |
|---|---|
| `patent` | patente (invenção) |
| `trademark` | marca |
| `copyright` | direito autoral |
| `trade_secret` | segredo industrial |

Construir "Patentes" como módulo à parte criaria uma gaveta para uma das quatro
e deixaria as outras três sem lar.

---

## 3. ⭐ O CICLO TERMINAL — sem reabertura (a física do proj/nc)

```
filed ──▶ granted ──▶ expired      (granted não é terminal: vive até expirar)
   └────▶ rejected
```

- `filed` → depositado/registrado (o nascimento).
- `filed → granted` / `filed → rejected`; `granted → expired`.
- ⭐⭐ **`rejected` e `expired` são TERMINAIS e NÃO REABREM:** o indeferido ou o
  expirado que "volta" é um **depósito novo**, com número e data novos (a física
  do `proj`/`nc`; o DIVERGE do `iso` mutável e do `idea` que reverte). Um direito
  de PI tem prazo legal — fingir que um expirado reabre mentiria sobre a proteção
  que a empresa realmente tem.

⭐ A **identidade congela** fora do depósito: `title` e `asset_type` não mudam
depois que a autoridade agiu (granted/rejected/expired). O `ALLOWED_TRANSITIONS`
do pacote espelha `ip.allowed_transition()` (teste lê e compara), e há guarda de
CI de que nenhum par sai de um terminal.

O ativo **não tem DELETE** — é história, mesmo indeferido/expirado. A origem (de
qual `idea` ou `proj` nasceu) é **id solto** (`source_id` + `source_name`).

---

## 4. O QUE FICA FORA (declarado)

- **Projetos de pesquisa** → é o **`proj`**. **Portfólio tecnológico** → é o
  **`pfolio`**. (As duas capacidades do Domain que não viram módulo novo.)
- Cálculo de prazo/anuidade, jurisdição/país como enum, classificação Nice/IPC,
  honorários de agente — processo jurídico de cada casa (config ou integração).
- `consumes` **VAZIO** — sem redeploy do `apps/api`.

---

## 5. ESTADO

✅ **CONSTRUÍDO na Onda Dezesseis (Fase 2 — FECHA a onda).** **Arquivo, ainda não
aplicado** — aplicar é ato do dono (runbook §29).

- `supabase/migrations/0084_ip.sql` — `ip.assets`, RLS, `asset_type` CHECK, ciclo
  terminal (`allowed_transition` + guardas), coerências de carimbo, identidade
  congelada. Sem DELETE.
- `packages/ip` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, tipo, acervo) e
  três suítes de teste (manifesto × seed; validação; ciclo terminal + tipo CHECK
  + o contraste com o `iso` mutável).
- `supabase/tests/74_ip_isolation.sql` — isolamento, nascimento filed, o tipo
  CHECK, o ciclo e os carimbos, os terminais que não reabrem, a identidade que
  congela, cross-tenant, `anon` fora, os fatos no correio.
- Seed: cartão 69 (`domain_key='rnd'`). Catálogo **68 → 69**.
- Portal: página placeholder `/propriedade-intelectual` + item de menu.

⭐ **Ao aplicar (runbook §29):** expor o schema `ip` na Data API; **sem redeploy**
(`consumes` vazio). Próxima migration livre: **`0085`**.
