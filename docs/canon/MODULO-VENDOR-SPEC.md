# MODULO-VENDOR-SPEC — Módulo 43: Fornecedores

**Domain 📦 Compras · capacidade _Fornecedores_ · `module_id = vendor` · schema `vendor`**
Onda Dez (Fase 2 — completar o Domain Compras). Migration `0058_vendor.sql`,
pacote `@alsham/vendor`, teste `48_vendor_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **`active ↔ archived` EXISTE — e o DIVERGE do `hr` é assinado.** Copiar o
  `mall` "por consistência" seria erro; copiar sem pensar e divergir sem
  escrever são o mesmo erro. A pergunta foi refeita: o fornecedor é GENTE
  CONTRATADA (o `hr`, onde `terminated` é terminal) ou RELAÇÃO COMERCIAL que
  volta? É relação comercial — o fornecedor que a empresa deixou de usar e
  volta a comprar é o MESMO fornecedor. Obrigá-lo a renascer partiria o
  histórico de compra em dois. Então `archived → active` existe, como no `mall`.
  O contraste `vendor × hr` é assinado no `lifecycle.test.ts`.
- ⭐ **Segmento/categoria é TEXTO LIVRE e OPCIONAL** (anti-viés). "Matéria-prima",
  "serviços", "TI" é vocabulário de cada compra — nunca enum. Um fornecedor sem
  categoria é honesto, não um erro a chutar.
- ⛔ **FORA:** certificação/homologação formal (capacidade futura), catálogo de
  produtos do fornecedor, e contrato de fornecimento (é o `ctr` genérico, por
  id solto — como o `lease` fez com o shopping).

## 1. AS PEÇAS

- `vendor.suppliers` — o cadastro: `name` (texto livre, obrigatório), `segment`
  (texto livre, opcional), `status` (`active`/`archived`), carimbos.
- `vendor.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em
  `@alsham/vendor`: `active ↔ archived`.
- Gatilhos: nascimento sempre ativo + autor carimbado pelo servidor; transição
  gated por `vendor.supplier.decide`; emissão de fato por INSERT/UPDATE.

## 2. OS FATOS

`vendor.supplier.registered` · `vendor.supplier.updated` ·
`vendor.supplier.archived` · `vendor.supplier.reopened`. Payload
autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/fornecedores` — placeholder por ora (o módulo vive no banco e no motor;
a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `vendor.supplier.manage` — cadastrar e editar.
- `vendor.supplier.decide` — arquivar/reativar (a relação que sai e volta).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Homologação/certificação de fornecedor — capacidade futura.
- Catálogo de produtos do fornecedor — não é do cadastro.
- Contrato de fornecimento — é o `ctr` genérico, por id solto.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `vendor` (`0058_vendor.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/vendor` | ✅ CONSTRUÍDO |
| Seed (cartão procurement) | ✅ CONSTRUÍDO |
| Teste SQL `48_vendor_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/fornecedores` | ✅ CONSTRUÍDO (placeholder) |
| Homologação / catálogo / contrato | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §23`. Expor o schema `vendor` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
