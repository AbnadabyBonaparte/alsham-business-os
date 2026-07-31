# MODULO-DISP-SPEC — Módulo 51: Distribuição / Despacho (Dispatch)

**Domain 🔗 Supply Chain · capacidade _Distribuição_ · `module_id = disp` · schema `disp`**
Onda Onze (Fase 2 — o Domain Supply Chain). Migration `0066_disp.sql`,
pacote `@alsham/disp`, teste `55_disp_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O ESPELHO INVERTIDO do `recv` (o Módulo 45), assinado.** O `recv` é a
  CHEGADA — o livro de RECEBIMENTOS na doca de entrada. O `disp` é a SAÍDA — o
  livro de DESPACHOS na doca de expedição. **A física é a MESMA:** ato pontual,
  fato consumado, imutável desde o instante 1. O que se inverte é o SENTIDO do
  fluxo: o `recv` carimba `received_at`/`received_by` e guarda o pedido de compra
  (id solto ao `po`); o `disp` carimba `dispatched_at`/`dispatched_by` e guarda o
  centro de distribuição de onde a carga partiu (id solto) e o destino para onde
  foi. O contraste é assinado no `lifecycle.test.ts` (lê as DUAS migrations e
  confere que ambas são atos imutáveis — nem status, nem `allowed_transition`,
  nem `updated_at`; as duas com o gatilho `before update or delete` que RAISE
  `fato consumado`; as duas concedendo SÓ `select, insert`).
- ⭐⭐ **O despacho é ATO PONTUAL, IMUTÁVEL — a física do `recv`/`sec`/`perf`.**
  A carga saiu, alguém registrou o que saiu, para onde e quanto, e o registro
  nasce pronto — para sempre. **NÃO TEM coluna de status, NÃO TEM ciclo de vida,
  NÃO TEM `allowed_transition`, NÃO TEM `updated_at`.** Não existe "despacho
  aberto". O cliente não tem porta de UPDATE nem DELETE (nem policy, nem grant),
  e um gatilho `before update or delete` recusa a reescrita até para o dono do
  banco. **Corrigir é registrar OUTRO despacho, com nota.** A imutabilidade é
  provada em DUAS camadas no `55_disp_isolation.sql`: o CLIENTE bate em
  `insufficient_privilege` (sem grant), e o DONO do banco bate no gatilho
  (`fato consumado`).
- ⭐ **O vínculo com o centro de distribuição é OPCIONAL e ID SOLTO.** Pela Lei
  do Lego, o `disp` **NÃO LÊ** o módulo de centros de distribuição (não importa,
  não lê o schema, sem FK cruzada). O `dc_center_id` é um `uuid` solto e o
  `dc_center_name` é o nome carimbado pela TELA — sobrevive ao redesenho do
  cadastro. Um despacho pode existir sem centro nenhum (retirada direta, brinde,
  amostra). 🔴 A migration não referencia o schema de centros em lugar nenhum —
  há guarda SCHEMA_DE de CI que reprova a referência cruzada.
- ⭐ **Os carimbos são do SERVIDOR.** `dispatched_at`/`dispatched_by` são sempre
  `now()`/`auth.uid()` no INSERT — o que o cliente mandar de quem/quando é
  descartado (a lição do `recv`/`vis`/`sec`).
- ⛔ **FORA:** roteirização/otimização de rota (Engine/capacidade futura),
  rastreio de transportadora (integração externa), conciliação
  despacho→pedido/estoque (precisa de handler real, Lei 7 — NÃO CONSTRUÍDO);
  SKU/catálogo (é `po` Sol Único); Storage de nota/foto (capacidade do Core, não
  construída — `note` é texto). `consumes` VAZIO.

## 1. AS PEÇAS

- `disp.dispatches` — o livro: `dc_center_id` (uuid solto, opcional),
  `dc_center_name` (texto, carimbado pela tela), `destination` (texto livre,
  obrigatório), `carrier` (texto livre, opcional), `quantity` (`numeric(18,4)`,
  `> 0`), `dispatched_on` (data, obrigatória), `note` (texto, opcional),
  `dispatched_at`/`dispatched_by` (carimbo do servidor), `created_at`.
  **Sem status. Sem updated_at.**
- Gatilhos: carimbo do servidor no nascimento (`before insert`); imutabilidade
  (`before update or delete` → RAISE `42501`); emissão do fato por INSERT.
- `@alsham/disp`: `validateNewDispatch` (destino obrigatório; quantidade `> 0`;
  `dispatched_on` no formato ISO; centro, transportadora e nota opcionais),
  `orderDispatches` (do mais recente ao mais antigo), `summarizeDispatches`
  (conta + soma quantidades). **Sem `canTransition`/`ALLOWED_TRANSITIONS` — a
  ausência é a lei.**

## 2. OS FATOS

`disp.dispatch.recorded` (após INSERT). Payload autossuficiente (`dispatchId`,
`dcCenterId`, `dcCenterName`, `destination`, `carrier`, `quantity`,
`dispatchedOn`). `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/despachos` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `disp.dispatch.record` — registrar um despacho (o único ato do módulo).
  `can_access` usa esta permissão.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Roteirização / otimização de rota — Engine/capacidade futura.
- Rastreio de transportadora — integração externa, precisa de handler real.
- Conciliação despacho→pedido/estoque — precisa de consumidor construído (Lei 7).
- SKU / catálogo de produtos — é `po` (Sol Único) / capacidade futura.
- Storage de nota/foto do despacho — capacidade do Core, não construída.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `disp` (`0066_disp.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/disp` | ✅ CONSTRUÍDO |
| Seed (cartão supply-chain) | ⛔ **NÃO CONSTRUÍDO** (arquivo compartilhado — próximo passo) |
| Teste SQL `55_disp_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/despachos` | ✅ CONSTRUÍDO (placeholder) |
| Roteirização / rastreio / conciliação / Storage | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md`. Expor o schema `disp` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
