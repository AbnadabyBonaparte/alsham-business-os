# 🤝 MÓDULO 9 — PROPOSTAS / ORÇAMENTOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `crm`

> Leitura obrigatória para quem for mexer no schema `quote` ou no pacote
> `@alsham/quotes`.
>
> **Leia junto com [MODULO-PO-SPEC](MODULO-PO-SPEC.md)** — o molde dos itens
> em texto livre — e com [MODULO-AP-SPEC](MODULO-AP-SPEC.md), de quem este
> módulo herda a régua "identidade por documento".
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `quote`, e não `crm` nem `proposal`.** `crm` já é o Módulo 4 —
dois módulos no mesmo prefixo fariam `crm.emit_event()` aceitar o fato do
vizinho, e a revogação em bloco por prefixo derrubaria dois módulos ao
desinstalar um (o precedente do `ops` §0.2). `quote.` foi conferido por grep
com fronteira de palavra contra o código de todas as migrations: zero
colisões.

**`domain_key` = `crm`** — Taxonomia §5, bloco **🤝 Comercial & CRM (12)**:

> CRM · Pipeline · **Propostas** · **Orçamentos** · Follow-up · Visitas ·
> Clientes · Leads · WhatsApp · Ligações · Comissão · Metas

**Duas capacidades, UM artefato — deliberado.** "Proposta" e "orçamento" são
o mesmo documento com o nome de ofícios diferentes: a agência propõe, a
oficina orça. O artefato (referência + contraparte neutra + itens + validade
+ aceite/recusa) atende os dois por inteiro. ⚠️ Homônimos que NÃO são este
módulo: *Orçamento* no Financeiro é budget; *Cotações* em Compras é o preço
que o fornecedor NOS dá; *Orçamento de obra* é do vertical de Construção.
*Pipeline* não é declarada — é o Módulo 10.

**PEDREIRA (360° PRIMA):** minerou-se o VOCABULÁRIO (contraparte, validade,
referência). ⛔ NÃO se minerou: a algema `lead_id NOT NULL` (propor não exige
cadastrar — a contraparte aqui é `prospect_name` + `counterparty_tax_id`,
NEUTRA e opcional), o `stage text` com default (enum implícito) e a RLS de
uma policy só. Há teste de pacote que reprova `lead_id`/`references crm.` no
schema.

**consumes = VAZIO.** Lei 7 — ver §5.

---

## 1. ⭐ A LEI DO MÓDULO: A PROPOSTA TEM IDENTIDADE POR DOCUMENTO

> Aceita, recusada, expirada e cancelada são TERMINAIS. Renegociar é
> documento novo, com referência nova.

O `ops` reabre a OS concluída — trabalho tem identidade por serviço. Aqui
não: o cliente aceitou ou recusou UMA proposta específica, com valores
específicos, num momento específico. Reabrir uma recusada reescreveria o que
foi posto na mesa, e a resposta da contraparte perderia o objeto. É a régua
do `ap` ("dinheiro tem identidade por documento") — e aqui o documento é a
promessa de preço.

| Onde | Como se verifica |
|---|---|
| `0024_quote.sql` §2.1 | nenhum par sai de `accepted`/`declined`/`expired`/`cancelled` |
| `@alsham/quotes` | teste lê a migration, compara par a par E exige o contraste com o `ops` |
| `0024_quote.sql` §3 | conteúdo congelado fora do rascunho (trigger `proposal_items_frozen`) |

### 1.1 ⭐ Aceite e recusa são ATOS — quem e quando, do servidor

Registrar o veredito da contraparte exige `quote.proposal.decide` (fé
pública do ato), e o porteiro carimba `decided_by`/`decided_at` com
`auth.uid()` e `now()` — a tela não escolhe autor nem hora. Constraint de
coerência: estado decidido sem carimbo não entra no banco.

### 1.2 ⭐ Expirar é CALENDÁRIO, nunca vontade

`sent → expired` só passa com `valid_until` VENCIDA — marcar expirada uma
proposta no prazo mentiria sobre a data. Proposta sem validade não expira
nunca: recusa-se ou retira-se. Expirar exige só `manage` (é registro de
calendário, não decisão).

### 1.3 O quadro do espelho — decisões re-perguntadas

| Decisão do irmão | Resposta no `quote` | Por quê |
|---|---|---|
| nasce `draft` (`po`) | ✅ **mantido** | proposta se monta antes de ir à mesa |
| `external_ref` única por tenant (`po`/`ap`/`ar`) | ✅ **mantido** | idempotência de documento |
| itens texto livre, sem catálogo (`po`) | ✅ **mantido** | catálogo é capacidade futura; o item carrega o negociado |
| DELETE de linha só em rascunho (`po`) | ✅ **mantido** | o que foi posto na mesa não se apaga |
| 3ª permissão separada (`po.order.receive`) | ✅ **mantido** (`decide`) | quem monta não é quem dá fé do veredito |
| terminal é terminal (`ap`) | ✅ **mantido** | identidade por documento |
| quem/quando do ato no próprio registro | ⛔ **DIVERGE do po** | o ATO da contraparte é o fato central; aceite sem autor não se defende |
| conteúdo editável após envio | ⛔ **DIVERGE do po** (que recalcula recebimento) | proposta na mesa é promessa: mudar valor depois reescreveria a promessa |

---

## 2. O QUE ESTE MÓDULO GUARDA

### 2.1 `quote.proposals`

Referência do tenant (`external_ref`, única) · moeda ISO sem default ·
`prospect_name` + `counterparty_tax_id` NEUTROS e opcionais · descrição ·
`valid_until` opcional · total somado das linhas por trigger · status ·
carimbo da decisão (`decided_at`/`decided_by`/`decision_note`).

**Não entra:** template, PDF, assinatura eletrônica, numeração automática
(formato é convenção da casa — `external_ref`), estágio/probabilidade (é o
`deal`), desconto estruturado, condição de pagamento.

### 2.2 `quote.proposal_items`

Molde do `po`: `line_no` + descrição texto livre + quantidade + unitário em
cents + total de linha gerado. Congeladas fora do rascunho, nas três
operações (INSERT/UPDATE/DELETE), por trigger.

---

## 3. CICLO DE VIDA

```
draft ──→ sent ──→ accepted   (terminal)
  │         ├────→ declined   (terminal)
  │         ├────→ expired    (terminal — só com validade vencida)
  │         └────→ cancelled  (terminal)
  └───────────────→ cancelled (terminal)
```

- Enviar exige ao menos um item e total > 0.
- Cancelar (retirar da mesa) exige `quote.proposal.cancel`.
- Aceitar/recusar exige `quote.proposal.decide` e carimba quem/quando.

## 4. OS SETE FATOS

| Fato | Quando |
|---|---|
| `quote.proposal.registered` | a proposta nasceu (rascunho) |
| `quote.proposal.updated` | mudou fato do rascunho (itens, total, moeda, validade, contraparte) |
| `quote.proposal.sent` | foi posta na mesa |
| `quote.proposal.accepted` | a contraparte aceitou — com o carimbo de quem/quando |
| `quote.proposal.declined` | a contraparte recusou |
| `quote.proposal.expired` | a validade venceu e o calendário foi registrado |
| `quote.proposal.cancelled` | foi retirada da mesa |

⭐ Payload AUTOSSUFICIENTE: itens e carimbo da decisão inclusos.

---

## 5. ⛔ NÃO CONSTRUÍDO — aceite → título no Contas a Receber

A integração óbvia, declarada e **não prometida**. A razão é de produto:
**aceite não é fato financeiro.** O título exige decisão de FATURAMENTO —
vencimento, parcelas, valor final após o combinado — que a proposta não
carrega (validade não é vencimento). Transformar aceite em título inventaria
uma data de vencimento que ninguém decidiu. O que falta, em ordem:

1. o ato de FATURAR (com vencimento e parcelas decididos por gente);
2. handler no `ar` consumindo o fato do faturamento (padrão E10,
   `envelope.producedBy`, projeção idempotente);
3. teste triangular no padrão `05_ap_triangle.sql`.

Sem os três, `consumes` fica vazio — e há guarda no CI conferindo o cartão.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 29/07/2026, na Missão Trina.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `quote` (`0024_quote.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §16) |
| Pacote `@alsham/quotes` (manifesto, tipos, motor, validação) | ✅ construído, com testes |
| Seed (9º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`14_quote_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/propostas` (montar, enviar, decidir, extrato da mesa) | ✅ CONSTRUÍDO |
| Aceite → título no `ar` | ⛔ **NÃO CONSTRUÍDO** — ver §5 |
| Template / PDF / assinatura / numeração automática | ⛔ fora de escopo — ver §2.1 |

---

## 7. APPLY (dono)

1. Aplicar `0024_quote.sql` (depois do `0023`).
2. Reaplicar o seed — o 9º cartão entra no catálogo.
3. ⚠️ **Expor o schema `quote` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
