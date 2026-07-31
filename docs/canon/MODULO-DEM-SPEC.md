# MODULO-DEM-SPEC — Módulo 48: Planejamento de Demanda

**Domain 🔗 Supply Chain · capacidade _Planejamento de demanda_ · `module_id = dem` · schema `dem`**
Onda Onze (Fase 2 — o Domain Supply Chain, SEPARADO de Compras — Taxonomia §5).
Migration `0063_dem.sql`, pacote `@alsham/dem`, teste `53_dem_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A identidade é a do `rfq`/`quote` — RE-PERGUNTADA — e o DIVERGE assinado.**
  O plano REUSA a física do documento congelável: nasce `draft`, PUBLICAR
  CONGELA as linhas (o que foi planejado não muda mais depois de comunicado à
  cadeia). O DIVERGE: a RFQ tem um SEGUNDO ato depois de enviar (o comprador
  PREMIA — `open→awarded`). O plano NÃO: `published` é TERMINAL — o próximo
  período é PLANO NOVO (a física do `bud`, período fechado não reabre). O
  contraste `dem × rfq` é assinado no `lifecycle.test.ts`.
- ⭐ **O período é TEXTO LIVRE** (anti-viés). "Q1 2027", "Março/2027", "Safra
  26/27" é vocabulário de cada empresa — nunca enum. E as linhas (produto +
  quantidade + unidade) em texto livre, sem catálogo.
- ⛔ **FORA:** previsão estatística/algorítmica (é ENGINE de IA — a Forja —, não
  módulo de Domain; aqui o número é posto por GENTE, Lei 7); integração com
  vendas históricas (precisaria de handler real consumindo eventos de vendas —
  capacidade futura declarada, não construída).

## 1. AS PEÇAS

- `dem.plans` — o cabeçalho: `period` (texto livre, obrigatório), `title`
  (opcional), `status` (`draft`/`published`/`cancelled`), carimbo de publicação
  (servidor).
- `dem.plan_lines` — as linhas: `product` (texto livre), `quantity` (> 0),
  `unit` (texto livre, opcional). FK segura em `(plan_id, tenant_id)`.
- `dem.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/dem`:
  `draft→published`, `draft→cancelled`.
- Gatilhos: nascimento sempre rascunho + autor do servidor; linhas congeladas
  fora do rascunho; publicar exige ≥1 linha e carimba quem/quando; período/
  título congelam fora do rascunho; emissão de fato.

## 2. OS FATOS

`dem.plan.registered` · `dem.plan.published` · `dem.plan.cancelled`. Payload
autossuficiente (inclui as linhas). `consumes` VAZIO (Lei 7 — sem redeploy do
`apps/api`).

## 3. AS TELAS

`/planejamento-demanda` — placeholder por ora (o módulo vive no banco e no
motor; a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `dem.plan.manage` — criar/editar rascunho, incluir linhas, publicar, cancelar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Previsão estatística/algorítmica — é Engine de IA (a Forja), não Domain.
- Integração com vendas históricas — precisa de handler real (Lei 7).
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `dem` (`0063_dem.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/dem` | ✅ CONSTRUÍDO |
| Seed (cartão supply-chain) | ✅ CONSTRUÍDO |
| Teste SQL `53_dem_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/planejamento-demanda` | ✅ CONSTRUÍDO (placeholder) |
| Previsão estatística / vendas históricas | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §24`. Expor o schema `dem` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
