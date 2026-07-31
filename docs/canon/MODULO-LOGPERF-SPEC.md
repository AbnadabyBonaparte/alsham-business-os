# MODULO-LOGPERF-SPEC — Módulo 52: Performance Logística

**Domain 🔗 Supply Chain · capacidade _Performance logística_ · `module_id = logperf` · schema `logperf`**
Fase 2 — Onda Onze, o Domain Supply Chain (separado de Compras). Migration
`0067_logperf.sql`, pacote `@alsham/logperf`, teste `57_logperf_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O REUSO do `vperf`, ASSINADO — a MESMA física de avaliação pontual.**
  Copiar sem pensar e divergir sem escrever são o mesmo erro. O `vperf` (Módulo
  46) é a avaliação PONTUAL e IMUTÁVEL do FORNECEDOR: nota 0–100 obrigatória
  (a régua do MÉTODO), parecer texto livre obrigatório, ato imutável em DUAS
  camadas (sem policy de UPDATE/DELETE e um gatilho que recusa até para o dono
  do banco), avaliador carimbado pelo SERVIDOR, e **SEM ciclo** — a física da
  RONDA do `sec` (`sec.patrols`), não a do `perf.cycles`. A performance
  logística re-pergunta cada decisão e MANTÉM tudo isso: é o REUSO consciente.
  Consequência: `logperf` **não tem** tabela de ciclo, **não tem** coluna de
  status, **não tem** `allowed_transition()`. O contraste `logperf × vperf`
  (a identidade é a mesma) é assinado no `lifecycle.test.ts`.
- ⭐⭐ **O DIVERGE do `vperf`, ASSINADO — o AVALIADO.** O `vperf` avalia um
  FORNECEDOR (`supplier_id`, id solto obrigatório ao `vendor`, + `supplier_name`).
  Aqui o avaliado é uma ROTA / TRANSPORTADORA / CENTRO DE DISTRIBUIÇÃO em TEXTO
  LIVRE (`subject`, obrigatório) — porque a unidade avaliada na logística não é
  um cadastro único: hoje é "Rota SP→RJ", amanhã "Transportadora do Sul",
  depois "CD Interior". Congelar isso num id de fornecedor faria o produto
  mentir sobre o que se mede. O vínculo com um centro de distribuição, QUANDO
  existe, é um ID SOLTO OPCIONAL (`dc_center_id`, nullable, SEM FK) — porque uma
  perna de transporte nem sempre tem um CD cadastrado. O DIVERGE é assinado no
  `lifecycle.test.ts` (o `logperf` NÃO tem `supplier_id`; tem `subject` texto
  livre + `dc_center_id` nullable).
- ⭐ **A nota 0–100 é OBRIGATÓRIA.** A régua é a física do MÉTODO (CHECK
  argumentado, não enum): uma avaliação SEM número não é avaliação — é um
  bilhete.
- ⭐ **O parecer (`summary`) é OBRIGATÓRIO e NÃO passeia no correio.** Todo ato
  de avaliar carrega o porquê; mas o envelope leva só o avaliado, a nota e a
  data (o mesmo pudor do `vperf`).
- ⛔ **FORA:** ciclo/época de avaliação (é o `perf`), scorecard estruturado com
  pesos por critério (capacidade futura), KPIs calculados de OTIF/lead time
  (precisariam de handler real consumindo eventos de entrega — capacidade
  futura declarada), e FK cruzada. `consumes` VAZIO (Lei 7).

## 1. AS PEÇAS

- `logperf.appraisals` — o livro: `subject` (texto livre, obrigatório — o
  avaliado), `dc_center_id` (id solto, nullable, sem FK), `rating` (int 0–100,
  obrigatório), `summary` (texto livre, obrigatório), `assessed_on` (date,
  opcional — o período medido), `appraiser_id` + `appraised_at` (carimbos do
  servidor), `created_at`. **SEM `updated_at`** — o ato é imutável.
- **NÃO existe** `logperf.allowed_transition()` nem coluna de status — a
  avaliação não tem ciclo de vida (a lei vive no schema por AUSÊNCIA).
- Gatilhos: carimbo do avaliador/hora pelo servidor no INSERT; imutabilidade
  (`before update or delete`); emissão do fato por INSERT.

## 2. OS FATOS

`logperf.appraisal.recorded`. Payload autossuficiente — leva `subject`,
`dcCenterId`, `rating`, `assessedOn`. **O parecer (`summary`) NÃO passeia no
correio.** `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/performance-logistica` — placeholder por ora (o módulo vive no banco e no
motor; a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `logperf.appraisal.record` — registrar avaliações (ato imutável, nota 0–100).
  Permissão ÚNICA: não há ciclo a administrar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Ciclo/época de avaliação — é o `perf`.
- Scorecard estruturado com pesos por critério — capacidade futura.
- KPIs calculados de OTIF/lead time — precisariam de handler consumindo eventos
  de entrega; futuro declarado, sem handler e sem promessa.
- Cadastro estruturado de rotas/transportadoras/CDs — o avaliado é texto livre;
  o vínculo com um centro (dc) é id solto opcional.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `logperf` (`0067_logperf.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/logperf` | ✅ CONSTRUÍDO |
| Seed (cartão supply-chain) | ⛔ **NÃO CONSTRUÍDO** (apply/seed do dono) |
| Teste SQL `57_logperf_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/performance-logistica` | ✅ CONSTRUÍDO (placeholder) |
| Ciclo / scorecard / KPIs OTIF | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md`. Expor o schema `logperf` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
