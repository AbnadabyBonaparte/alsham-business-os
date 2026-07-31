# MODULO-DC-SPEC — Módulo 50: Centros de Distribuição

**Domain 🔗 Supply Chain · capacidade _Centros de distribuição_ · `module_id = dc` · schema `dc`**
Onda Onze (Fase 2 — o Domain Supply Chain). Migration `0065_dc.sql`,
pacote `@alsham/dc`, teste `54_dc_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **`active ↔ archived` EXISTE — e o DIVERGE do `hr` é assinado.** Copiar o
  `vendor` "por consistência" seria erro; copiar sem pensar e divergir sem
  escrever são o mesmo erro. A pergunta foi refeita: um centro de distribuição
  é GENTE CONTRATADA (o `hr`, onde `terminated` é terminal) ou ATIVO DE
  OPERAÇÃO que volta? É ativo que volta — o CD que a empresa desativou e volta
  a operar é o MESMO centro. Obrigá-lo a renascer partiria o histórico de
  operação em dois. Então `archived → active` existe, como no `vendor`.
  O contraste `dc × hr` é assinado no `lifecycle.test.ts`.
- ⭐ **Endereço é TEXTO LIVRE e OPCIONAL** (anti-viés). O lugar de cada CD é
  vocabulário do tenant — nunca enum. Um CD sem endereço cadastrado é honesto,
  não um erro a chutar.
- ⭐ **Supply Chain é SEPARADO de Compras** (Taxonomia §5). O `dc` nasce sob
  `domain_key='supply-chain'`, não `procurement`.
- ⛔ **FORA:** capacidade volumétrica estruturada do CD e zoneamento interno
  (endereçamento de posições/ruas/blocos) — capacidade futura.

## 1. AS PEÇAS

- `dc.centers` — o cadastro: `name` (texto livre, obrigatório), `address`
  (texto livre, opcional), `status` (`active`/`archived`), carimbos.
- `dc.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em
  `@alsham/dc`: `active ↔ archived`.
- Gatilhos: nascimento sempre ativo + autor carimbado pelo servidor; transição
  gated por `dc.center.decide`; emissão de fato por INSERT/UPDATE.

## 2. OS FATOS

`dc.center.registered` · `dc.center.updated` · `dc.center.archived` ·
`dc.center.reopened`. Payload autossuficiente. `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 3. AS TELAS

`/centros-distribuicao` — placeholder por ora (o módulo vive no banco e no
motor; a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `dc.center.manage` — cadastrar e editar.
- `dc.center.decide` — arquivar/reativar (o ativo que sai e volta a operar).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Capacidade volumétrica estruturada do CD — capacidade futura.
- Zoneamento interno / endereçamento de posições — capacidade futura.
- Vínculo FK com estoque/pedidos — o cadastro não conhece o schema de ninguém.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `dc` (`0065_dc.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/dc` | ✅ CONSTRUÍDO |
| Seed (cartão supply-chain) | ✅ CONSTRUÍDO |
| Teste SQL `54_dc_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/centros-distribuicao` | ✅ CONSTRUÍDO (placeholder) |
| Capacidade volumétrica / zoneamento | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §24`. Expor o schema `dc` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
