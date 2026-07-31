# MODULO-VPERF-SPEC — Módulo 46: Avaliação de Fornecedores

**Domain 📦 Compras · capacidade _Avaliação de fornecedores_ · `module_id = vperf` · schema `vperf`**
Fase 2 — completa a leitura do Domain Compras iniciada pelo `vendor`. Migration
`0061_vperf.sql`, pacote `@alsham/vperf`, teste `51_vperf_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O DIVERGE do `perf`, ASSINADO — a avaliação de fornecedor NÃO TEM CICLO.**
  Copiar sem pensar e divergir sem escrever são o mesmo erro. O `perf` (Módulo
  36) avalia GENTE dentro de um CICLO (`perf.cycles`, `open → closed`): a
  avaliação de RH pertence a uma ÉPOCA (o trimestre, o ano). A pergunta foi
  refeita para o fornecedor: a avaliação de um FORNECEDOR pertence a uma época?
  **NÃO.** Ela é PONTUAL — o comprador avalia quando um recebimento chega torto,
  quando uma cotação decepciona, quando um serviço supera. Cada avaliação é um
  ATO isolado, com data própria. A física correta é a da RONDA do `sec`
  (`sec.patrols`: ato pontual SEM ciclo de vida), não a do `perf.cycles`.
  Consequência direta: `vperf` **não tem** tabela de ciclo, **não tem** coluna
  de status, **não tem** `allowed_transition()`. O contraste `vperf × perf`
  (perf TEM ciclo; vperf NÃO) e `vperf × sec` (os dois são atos pontuais) são
  assinados no `lifecycle.test.ts`.
- ⭐ **O que se MANTÉM do `perf`: a IDENTIDADE avaliador × avaliado.** Aqui,
  comprador × fornecedor. O ato é IMUTÁVEL (fato consumado, imutável em duas
  camadas — sem policy de UPDATE/DELETE e um gatilho que recusa até para o dono
  do banco) e o avaliador é carimbado pelo SERVIDOR (`auth.uid()` no INSERT).
- ⭐ **A nota 0–100 é OBRIGATÓRIA — o DIVERGE do `perf`, cuja nota é opcional.**
  A régua é a física do MÉTODO (CHECK argumentado, não enum): uma avaliação de
  fornecedor SEM número não é avaliação — é um bilhete. No `perf`, quem não usa
  número registra só o parecer; aqui a nota é o eixo.
- ⭐ **A origem é TEXTO LIVRE + ID SOLTO, opcional.** `source_kind`
  ("recebimento", "cotação" — vocabulário de cada compra, nunca enum) e
  `source_ref` (a linha que motivou a avaliação, id solto, sem FK cruzada).
- ⭐ **O fornecedor é ID SOLTO ao `vendor`** (`supplier_id` + `supplier_name`
  carimbado pela tela) — nunca FK cruzada. O nome sobrevive ao redesenho do
  cadastro alheio.
- ⛔ **FORA:** ciclo/época de avaliação (é o `perf`, e é o DIVERGE), scorecard
  estruturado com pesos por critério (capacidade futura), homologação formal (o
  `vendor` já declarou FORA), e SLA contratual (é o `ctr` genérico, por id
  solto). `consumes` VAZIO (Lei 7).

## 1. AS PEÇAS

- `vperf.appraisals` — o livro: `supplier_id` (id solto, obrigatório),
  `supplier_name` (texto, carimbado pela tela), `rating` (int 0–100,
  obrigatório), `summary` (texto livre, obrigatório), `source_kind` (texto
  livre, opcional), `source_ref` (id solto, opcional), `appraiser_id` +
  `appraised_at` (carimbos do servidor), `created_at`. **SEM `updated_at`** — o
  ato é imutável.
- **NÃO existe** `vperf.allowed_transition()` nem coluna de status — a avaliação
  não tem ciclo de vida (a lei vive no schema por AUSÊNCIA).
- Gatilhos: carimbo do avaliador/hora pelo servidor no INSERT; imutabilidade
  (`before update or delete`); emissão do fato por INSERT.

## 2. OS FATOS

`vperf.appraisal.recorded`. Payload autossuficiente — leva `supplierId`,
`supplierName`, `rating`, `sourceKind`, `appraisedAt`. **O parecer (`summary`)
NÃO passeia no correio.** `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/avaliacao-fornecedores` — placeholder por ora (o módulo vive no banco e no
motor; a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `vperf.appraisal.record` — registrar avaliações (ato imutável, nota 0–100).
  Permissão ÚNICA: não há ciclo a administrar, logo não há a segunda permissão
  que o `perf` tem (`perf.cycle.manage`).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Ciclo/época de avaliação — é o `perf`, e é justamente o DIVERGE.
- Scorecard estruturado com pesos por critério — capacidade futura.
- Homologação/certificação formal — o `vendor` já declarou FORA.
- SLA contratual — é o `ctr` genérico, por id solto.
- Consumo de `vendor.supplier.registered` (pré-listar fornecedores a avaliar) —
  futuro declarado, sem handler e sem promessa.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `vperf` (`0061_vperf.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/vperf` | ✅ CONSTRUÍDO |
| Seed (cartão procurement) | ⛔ **NÃO CONSTRUÍDO** (apply/seed do dono) |
| Teste SQL `51_vperf_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/avaliacao-fornecedores` | ✅ CONSTRUÍDO (placeholder) |
| Ciclo / scorecard / homologação / SLA | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md`. Expor o schema `vperf` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
