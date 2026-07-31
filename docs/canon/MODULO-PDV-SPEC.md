# MÓDULO 71 — Ponto de Venda (pdv)

> Vertical 🛒 **Varejo & Supermercados** (`vertical_key='retail'`) · Onda Dezoito
> (Fase 2) · migration `0086_pdv.sql` · pacote `@alsham/pdv` · teste
> `76_pdv_isolation.sql`.
> **ABRE o SEGUNDO bloco VERTICAL do catálogo** — o primeiro desde o Shopping
> Centers da Onda Nove. **ARQUIVO — apply é ato do dono (runbook §31).**

---

## 1. O QUE É

O registro da **venda comercial** do balcão — o **cupom**: o que se vendeu, por
quanto, para quem, por qual forma de pagamento. Um cabeçalho (`pdv.sales`) com
linhas (`pdv.sale_items`), operador e método de pagamento em **texto livre**,
cliente por **id solto** ao `crm` (opcional — a venda de balcão é anônima) e
produto por **id solto** ao `catalog` (opcional, ou avulso em texto livre).

⛔ **NÃO é o documento fiscal.** Este módulo registra a VENDA (o fato comercial),
**não** a NF-e/NFC-e: não emite, não assina, não fala com a SEFAZ. A emissão
fiscal é integração certificada — a fronteira que a Onda Dezessete já demarcou.
A venda vira, um dia, uma NFC-e por integração; aqui ela é o registro do balcão.

### ⚖️ Por que este módulo existe apesar da Lei 3

A **Lei 3** (README/CLAUDE.md §2) lista o **PDV** entre os que *"integram-se por
padrão; construir só com decisão de dono explícita"*. O bastão da Onda Dezoito
**É essa decisão**: o cliente inaugural tem o PDV como **dor viva**. O recorte é
honesto — constrói-se a venda comercial, e o documento fiscal permanece
integração. Construir o PDV **não** significa construir o Fisco.

---

## 2. A IDENTIDADE — cabeçalho + itens, congela ao finalizar

A venda **reusa a física do `rfq`/`quote`**: um cabeçalho com linhas (FK
INTRA-schema `sale_items → sales`), que nasce em `draft`. **FINALIZAR CONGELA**
— depois de `completed`, nem o cabeçalho (cliente, pagamento, desconto) nem as
linhas mudam. Uma venda concluída é aquele cupom, com aquelas linhas, para
sempre. Três guardas de gatilho seguram o congelamento (itens, cabeçalho e
transição de estado), e não há DELETE de venda: cupom fechado é história de
balcão.

- **Finalizar exige ao menos um item** — não se fecha cupom vazio (Lei 7).
- **O total é VIEW calculada** (`pdv.sale_totals`), nunca coluna: bruto = soma
  das linhas; líquido = bruto − desconto. A física do `inv`/`cash` — saldo e
  total são leitura do livro, jamais número guardado à mão.
- Os carimbos de conclusão vêm do **servidor** (`completed_at`/`completed_by`),
  nunca do formulário.

---

## 3. ⭐ O DIVERGE do `rfq` — sem estado intermediário

Copiar sem pensar e divergir sem escrever são o mesmo erro. A `rfq` (Módulo 44)
tem um meio-termo `open` — foi ao mercado e **espera** propostas — antes do fim.
A **venda não tem esse meio-termo**: ou está sendo montada (`draft`) ou fechou
(`completed`/`cancelled`). Não existe "venda no mercado" — o cupom **fecha na
hora**, no balcão, com o cliente na frente.

Por isso o ciclo é `draft → completed` / `draft → cancelled`, os dois
**TERMINAIS** (a física do `proj`/`bud`): venda cancelada **não reabre** —
refazer é venda NOVA. Cancelar exige razão. O contraste com o `open` intermediário
da `rfq` fica assinado no teste do módulo.

---

## 4. ⭐ PROMOÇÕES — um campo, não um módulo

A capacidade *Promoções* do vertical foi **re-perguntada**. Um desconto simples
aplicado NA VENDA (valor fixo) é um **CAMPO** do cupom — `discount_cents`
(≥ 0, em centavos) —, não um schema à parte. É o que o teste anti-viés manda: um
desconto de balcão é a mesma coisa em qualquer loja.

Uma **campanha de promoção com vigência e cadastro independente da venda** (cupom
reutilizável, "leve 3 pague 2", faixa de horário) é **outra coisa** — capacidade
FUTURA, declarada fora deste módulo. Aqui: só o desconto da venda.

### ⛔ FORA — declarado peça a peça

- **NF-e/NFC-e e qualquer documento fiscal** — integração fiscal certificada
  (Lei 3), nunca schema.
- ***Promoções com vigência*** — campanha reutilizável é frente própria, futura.
- ***Estoque de varejo*** — é o `inv` genérico (o livro de movimentos, saldo
  calculado), referenciado por **id solto**; este módulo não o refaz.
- ***Marketplace próprio*** — e-commerce é frente inteira, integração futura.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7): baixa de estoque,
  fiscal e fidelidade são futuro declarado, sem promessa.

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezoito (Fase 2 — ABRE o Vertical Varejo &
Supermercados).** **Arquivo, ainda não aplicado** — aplicar é ato do dono
(runbook §31).

- `supabase/migrations/0086_pdv.sql` — `pdv.sales` + `pdv.sale_items` (FK
  intra-schema), RLS `enable`+`force`, congelamento por gatilho (itens,
  cabeçalho, transição), ciclo `draft → completed/cancelled` terminais,
  `pdv.sale_totals` (VIEW `security_invoker`) e o payload autossuficiente.
- `packages/pdv` — manifesto (capacidade *PDV*, permissão `pdv.sale.manage`,
  eventos `pdv.sale.registered/completed/cancelled`), tipos, motor
  (`ALLOWED_TRANSITIONS`, total do cupom, o contraste com o `open` da `rfq`) e
  as suítes de teste.
- Cartão 71 do catálogo (`vertical_key='retail'`) — o PRIMEIRO cartão de Varejo;
  a Store gradua a pill do vertical. Catálogo **70 → 71**.

⭐ **Ao aplicar (runbook §31):** expor o schema `pdv` na Data API; **sem
redeploy** do `apps/api` (`consumes` vazio; guarda de CI confere). O vínculo com
cliente e produto é por **id solto** — o mapa SCHEMA_DE do CI reprova a leitura
de schema alheio.
