# MÓDULO 67 — Métricas Ambientais (`esg`)

> Domain 🌱 **ESG & Sustentabilidade** (`esg`) · Onda Quinze (Fase 2) · migration `0082_esg.sql` · pacote `@alsham/esg`
> **ABRE** o Domain ESG & Sustentabilidade — o primeiro (e, nesta onda, único) cartão.

---

## 1. O QUE É

O **livro de leituras ambientais** da empresa. Cada leitura é um **ato imutável**:
mediu-se tanto de uma métrica ambiental, numa unidade, num período — e o registro
nasce pronto, para sempre. É a mesma física do `pcost` (o livro de custos), do
`timesheet` (o livro de horas) e do `recv`/`occ`/`sec` (o ato pontual imutável):
sem status, sem ciclo de vida, sem transição. Corrigir é registrar **outra**
leitura, com nota — nunca reescrever.

---

## 2. A DECISÃO DE CANON — UM MÓDULO, NÃO QUATRO (e duas capacidades FORA)

O Domain ESG tem **6 capacidades**. Investigadas uma a uma com a régua
anti-duplicação (a mesma disciplina da Onda Quatorze), a fila honesta é:

| Capacidade da Taxonomia §5 | Decisão | Por quê |
|---|---|---|
| **Indicadores ESG** | **FORA** → é o `goal` | Um indicador ESG é uma **meta com categoria "ESG"** (Domain BI, Módulo 23, já publicado). Zero módulo novo. |
| **Relatórios ESG** | **FORA** → é o `pol` | Um relatório ESG é um **documento que publica e congela** — exatamente o `pol` (Módulo 37, versionado). Zero módulo novo. |
| **Inventário de carbono** | ⬇️ | |
| **Gestão de resíduos** | vira **UM** módulo | Na física, as quatro são **a mesma leitura periódica**: quantidade + unidade + período. |
| **Consumo de água** | (`esg.readings`) | O que as distingue é o **tipo** — um `metric_type` num CHECK. |
| **Consumo de energia** | ⬆️ | Construir 4 schemas quase idênticos seria a duplicação que a Lei do Reaproveitamento proíbe — dentro da própria onda. |

⭐⭐ **O `metric_type` é CHECK (`carbon`/`water`/`energy`/`waste`), não enum do
produto nem dado do tenant.** São as quatro dimensões clássicas de rastreamento
ESG/GHG Protocol — **física do método**. O produto não procura a palavra
"carbono": um tenant em espanhol registra `carbon`/`water`/`energy`/`waste`
igual. É a mesma natureza do `corrective`/`preventive` do `capa` e do `0..10` do
`nps`.

---

## 3. O MODELO — `esg.readings`

| Campo | Tipo | Regra |
|---|---|---|
| `metric_type` | `text` **CHECK** | uma das quatro dimensões — física do método |
| `quantity` | `numeric(20,4)` **CHECK `>= 0`** | ⭐ o DIVERGE assinado (ver §4) |
| `unit` | `text` não-vazio | **texto livre** — o tenant escolhe (tCO2e, m³, kWh, kg); congelar "toneladas" numa coluna envelheceria o produto (a lição do canal do `crm`) |
| `reference_on` | `date` obrigatória | o período da leitura — leitura sem período não se reporta |
| `source_id` | `uuid` opcional | ⭐ a fonte por **ID SOLTO** (emissão por obra, por unidade) — sem FK, sem saber a que módulo aponta (Lei do Lego) |
| `source_name` | `text` | o nome da fonte carimbado pela **tela** |
| `note` | `text` opcional | texto livre |
| `recorded_at` / `recorded_by` | carimbo | ⭐ do **servidor** — o que o cliente mandar é descartado |

- **Imutável em DUAS camadas** desde o instante 1 (a lição paga da Onda Dez):
  o cliente não tem grant de UPDATE/DELETE **e** um gatilho recusa a reescrita
  até para o dono do banco (errcode `42501`).
- **Sem** `status`, **sem** `allowed_transition`, **sem** `updated_at`.
- O envelope `esg.reading.recorded` é **autossuficiente** (a fonte pelo nome
  carimbado, id solto) e **NÃO carrega a nota texto livre** (a cautela do
  `vis`/`comm`).

A tela detalhada (o livro de leituras + o resumo por métrica/unidade) é a
**próxima frente de UI**; a página de rota já existe como placeholder honesto.

---

## 4. ⭐⭐ O DIVERGE ASSINADO — `quantity >= 0`

Copiar sem pensar e divergir sem escrever são o mesmo erro. A régua da quantidade
foi re-perguntada contra os dois vizinhos imutáveis:

| Módulo | Régua | Por quê |
|---|---|---|
| `pcost` (57) | `amount_cents <> 0` (sinal livre) | mede **dinheiro** — um estorno é uma linha negativa REAL |
| `timesheet` (61) | `hours > 0` (estrito) | mede **horas** — zero é linha muda, negativo não é trabalho |
| **`esg` (67)** | **`quantity >= 0`** | mede uma **grandeza física ambiental** — **zero é leitura real e reportável** (zero resíduo ao aterro é a própria meta ESG); **negativo é infísico** (não se emite −3 tCO2e). A compensação/crédito de carbono é OUTRO conceito (capacidade *Créditos de compensação* do Domain Energia). |

As três réguas são **distintas**, e o teste do pacote lê as três migrations e
assina o contraste (`<> 0` · `> 0` · `>= 0`).

---

## 5. O QUE FICA FORA (declarado)

- **Cálculo de pegada por fórmula/fator de emissão** — seria **motor de cálculo**;
  capacidade futura, declarada NÃO CONSTRUÍDA (Lei 7). O `esg` só guarda a
  leitura medida, não a deriva.
- **Certificação/auditoria de terceira parte** — é o `audit` (Módulo 64), por id
  solto se quiser cruzar.
- **Indicadores ESG** — é o `goal`. **Relatórios ESG** — é o `pol`.
- `consumes` **VAZIO** — sem redeploy do `apps/api`.

---

## 6. ESTADO

✅ **CONSTRUÍDO na Onda Quinze (Fase 2 — ABRE o Domain ESG & Sustentabilidade).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §28).

- `supabase/migrations/0082_esg.sql` — schema, RLS (enable+force), gatilho de
  carimbo, gatilho de imutabilidade, `metric_type` CHECK, `quantity >= 0` CHECK,
  `emit_event`/`can_access`, revoke-then-grant.
- `packages/esg` — manifesto, tipos, motor puro (`validateNewReading`,
  `summarizeReadings` por métrica/unidade) e três suítes de teste (manifesto ×
  seed; validação; imutabilidade + o contraste das três réguas).
- `supabase/tests/72_esg_isolation.sql` — isolamento, carimbo do servidor,
  `metric_type` CHECK, `quantity >= 0` (zero entra, negativo recusado),
  imutabilidade nas duas camadas (UPDATE e DELETE), cross-tenant, `anon` fora, o
  fato no correio.
- Seed: cartão 67 (`domain_key='esg'`). Catálogo **66 → 67 publicados**.
- Portal: página placeholder em `/esg` + item de menu.

⭐ **Ao aplicar (runbook §28):** expor o schema `esg` na Data API; **sem redeploy
do `apps/api`** (`consumes` vazio). Próxima migration livre: **`0083`**.
