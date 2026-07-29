# 💰 MÓDULO 5 — CONTAS A RECEBER
## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `ar` ou no pacote
> `@alsham/accounts-receivable`. **Leia junto com [MODULO-AP-SPEC](MODULO-AP-SPEC.md):**
> este módulo é o espelho consciente daquele, e metade das decisões daqui só faz
> sentido ao lado da decisão de lá.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `ar`.** Quinta vez que esta decisão aparece e já é padrão: o
CORE-SPEC define o evento como `<moduleId>.<agregado>.<fato>` e o cinto de
`emit_event()` confere o prefixo. Com eventos em `ar.*`, qualquer outro id faria
a porta de saída recusar os próprios eventos. O pacote é
`@alsham/accounts-receivable`; só o identificador é curto.

**`domain_key` = `finance`** — [Taxonomia §5](TAXONOMIA-EMPRESARIAL-ALSHAM.md),
"💰 Financeiro (19)", que lista *Contas a pagar · **Contas a receber** · PIX ·
Boletos · …*.

⭐ **É o mesmo Domain do Módulo 1 e do Módulo 3, e é assim que tem de ser.**
Domain é classificação da Taxonomia, não fronteira de módulo. A Store passa a
mostrar três cartões do Domain financeiro, cada um instalável sozinho — e isso é
o desenho funcionando, não uma anomalia.

---

## 1. ⭐ O QUADRO DO ESPELHO — o que se manteve, e por quê

Copiar sem pensar e divergir sem escrever são o mesmo erro. Cada decisão do
Módulo 3 foi **re-perguntada**, e a resposta está aqui e no cabeçalho do
`0010_ar.sql`.

| Decisão do `ap` | Resposta no `ar` | Por quê |
|---|---|---|
| `external_ref` único por tenant | ✅ **mantido** | o documento não entra duas vezes; é a chave de idempotência de quem projetar |
| `amount_cents` inteiro e positivo | ✅ **mantido** | o valor é o direito de crédito. O sinal é de quem lê o extrato |
| `currency` sem default | ✅ **mantido** | moeda presumida é viés de país — e a receber em várias moedas é o caso de quem exporta |
| identificador fiscal neutro | ✅ **mantido**, com o **mesmo nome** (`counterparty_tax_id`) | quem paga não muda de natureza por estarmos recebendo |
| cancelar é status, nunca `delete` | ✅ **mantido** | título apagado é dinheiro que sumiu do registro |
| `cancelled` é terminal | ✅ **mantido** | se voltarem a dever, é documento novo |
| permissão própria para cancelar | ✅ **mantido** | registrar e matar são atos diferentes; o produto PERMITE que sejam a mesma pessoa |
| vencimento no passado não é erro | ✅ **mantido** | quem migra tem gaveta cheia — e é justamente o que se quer cobrar |
| forma de pagar/receber é texto livre | ✅ **mantido** | instrumento é de um país e de uma década |
| `settled → cancelled` não existe | ✅ **mantido** como `received → cancelled` | ver abaixo — foi a pergunta mais fácil de errar |
| `payables_no_overpay` | ⛔ **DIVERGE** | ver §3 — a decisão mais importante do módulo |

### A pergunta mais fácil de errar: `received → cancelled`

No `ap`, cancelar um título pago apagaria a fronteira entre *"não devíamos
isso"* e *"pagamos isso"*.

Aqui apagaria a fronteira entre *"não tínhamos a receber"* e **"recebemos o
dinheiro"** — e o segundo é mais grave, porque **o dinheiro entrou na conta**.
Se o recebimento tem de voltar (devolução, chargeback, cheque devolvido, estorno
de cartão), ele volta primeiro e só então o documento se cancela. Dois atos,
dois registros.

**Resposta: mantido, e por uma razão mais forte que a do original.**

---

## 2. ⭐ O QUE ATRAVESSA A FRONTEIRA

### 2.1 O módulo EMITE

| Evento | Quando |
|---|---|
| `ar.receivable.registered` | o título nasceu |
| `ar.receivable.updated` | mudou valor, vencimento, recebimento ou estado |
| `ar.receivable.cancelled` | o título foi cancelado |

**Corrigir a descrição não emite nada.** O payload é **autossuficiente**: quem
escuta não pode fazer join.

### 2.2 O módulo CONSOME: **nada**

### 2.3 ⭐⭐ POR QUE `consumes` É VAZIO — e o que o Módulo 1 já fechou

A integração óbvia é o espelho do triângulo da Etapa 10: assim como o Módulo 1
projeta o título a **pagar** e casa contra os **débitos** do extrato, ele
projeta o título a **receber** e casa contra os **créditos**.

**Isso passou a existir no Módulo 1** (`0011_recon_receivables.sql`,
`external-receivable.ts`, `scoreReceivablePair`). O `recon` declara
`ar.receivable.*` em `consumes`.

**Este módulo (`ar`) continua com `consumes` vazio** porque a outra metade —
escutar a confirmação da baixa no recon e liquidar o título aqui — **ainda não
tem handler**. Declarar consumo sem consumidor seria Lei 7 quebrada. Quando o
handler existir, a lista muda.

O que o §2.3 pedia ao Módulo 1 (e já está em arquivo):

1. `recon.receivables` — criado;
2. matches polimórficos (`payable_id` XOR `receivable_id`) — migration `0011`;
3. motor direcional — `scoreReceivablePair` + `MatchSuggestion` união;
4. teste triangular — `08_ar_recon_triangle.sql`.

---

## 3. ⭐⭐ A DIVERGÊNCIA: RECEBER A MAIOR É PERMITIDO

O `0007_ap.sql` tem, textualmente:

```sql
-- Não se paga mais do que se deve.
constraint payables_no_overpay check (settled_amount_cents <= amount_cents)
```

**Aqui essa constraint não existe, e a ausência é a decisão mais importante do
módulo.**

Pagar a mais do que se deve é **erro de quem paga**, e o sistema que paga pode e
deve recusar. **Receber a mais não é erro de ninguém que esteja aqui dentro** —
é o que o pagador fez, e o dinheiro já está na conta. Acontece o tempo todo:

- o pagador arredondou para cima;
- pagou com juros ou multa por atraso, que este módulo não modela (política de
  cobrança é a capacidade *Cobrança*, **NÃO CONSTRUÍDA**);
- quitou dois documentos numa transferência só, contra uma referência só;
- pagou em moeda com conversão e sobrou.

Se o banco recusasse, o operador teria de **mentir sobre o que entrou** —
registrar menos do que recebeu para caber na constraint. Um sistema que obriga o
operador a mentir para funcionar é pior do que um que aceita a verdade e a
mostra.

### As três consequências, e onde cada uma é tratada

| Consequência | Onde |
|---|---|
| `received_amount_cents` pode passar de `amount_cents`, e o estado continua `received` | o `check` de coerência usa `>=`, não `=` |
| o saldo ficaria negativo | `outstandingCents()` devolve **zero**, nunca negativo — senão a tela somaria um valor sem sentido no total em aberto |
| o excedente ficaria invisível | `overpaidCents()` existe **para a tela mostrá-lo**; um excedente invisível é um número que não bate e ninguém sabe por quê |

⚠️ **Isto não é "o `ap` está errado".** Lá a constraint está certa pelo mesmo
motivo que aqui ela está ausente: nos dois casos o schema **recusa o que o
sistema controla e aceita o que o mundo impõe.**

### Como a divergência é guardada

- **teste de pacote:** lê os dois arquivos de migration e exige que o `ap` tenha
  `payables_no_overpay` e que o `ar` **não** tenha equivalente;
- **teste SQL (`07_ar_isolation.sql`, cenários 5 e 5.1):** insere um recebimento
  a maior (passa) e um pagamento a maior (é recusado) **no mesmo banco**;
- **guarda de CI:** confere as duas constraints no banco **aplicado**.

Um "conserto por simetria" em qualquer um dos lados reprova em três lugares.

---

## 4. ⚖️ O TESTE ANTI-VIÉS

As mesmas recusas do Módulo 3, porque a tentação é a mesma vestida do outro
lado:

| Recusado | Por quê |
|---|---|
| boleto, PIX, carnê, código de barras, link de pagamento | instrumentos de cobrança de um país e de uma década. A forma de receber é `settlement_method`, texto |
| banco, agência, conta, adquirente, bandeira | capacidade *Bancos*, outra peça do Domain |
| juros, multa, correção, desconto, régua de cobrança | **política de cobrança é o processo de UMA empresa**. *Cobrança* é capacidade própria |
| nota fiscal, série, CFOP | ver Lei 4 abaixo: título não é nota |
| parcelamento como estrutura | parcela é um título com data e valor próprios — mesma decisão do `ap` |
| score de crédito, limite, análise de risco | não é deste módulo, e talvez não seja deste produto |

E a validação **não** impõe formato ao identificador fiscal nem ao telefone —
mesma decisão do `crm` e do `ap`.

### Lei 4 — o que se minerou

O Balanço Supabase registra `invoices` na pedreira do `alsham-core`. Minerou-se a
ideia, com uma distinção escrita: **"invoice" não é "título a receber"**. A nota
fiscal é o documento; o título é o direito de crédito. Uma nota parcelada gera
vários títulos, e um título pode existir sem nota nenhuma (adiantamento, acordo,
reembolso).

⚠️ **NÃO VERIFICADO:** este repositório não leu o schema real do `alsham-core`.

---

## 5. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 28/07/2026, na Etapa 12.*

| Peça | Estado |
|---|---|
| Manifesto, tipos, validação, ciclo de vida, saldo e excedente | ✅ construído, com testes |
| Schema `ar` (`0010_ar.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §10) |
| Telas: listar, registrar, cancelar | ✅ construídas, com os selos por moeda |
| Consumo de eventos de outros módulos | **NÃO CONSTRUÍDO** — AR ainda não escuta a baixa do recon (fechamento do ciclo); ver §2.3 |
| Conciliação de recebimentos (crédito × título) | ✅ **obra do Módulo 1 CONSTRUÍDA** — `0011_recon_receivables.sql` + consumidor `ar.receivable.*` no recon. Este módulo **emite**; o recon projeta e casa |
| Registro de recebimento **pela tela** | ⚠️ **schema e domínio prontos, sem tela.** O ciclo aceita recebimento parcial e total, e é provado; o botão é etapa própria |
| Estorno pela tela | ⚠️ mesma coisa — a transição existe e é provada; o botão não |
| Baixa por perda (`written_off`) | **NÃO CONSTRUÍDA**, e foi considerada. Distinguir *"cancelei porque o documento estava errado"* de *"era devido e não vamos receber"* é um controle real em financeiro. Ficou de fora porque o estado não existe no schema, e uma permissão a mais guardaria uma porta que não existe. Quando entrar, entra como estado + permissão + evento, numa etapa própria |
| Cobrança: régua, mensagem, juros, negativação | **NÃO CONSTRUÍDO** — capacidade própria do Domain |
| Agente de IA embarcado | **NÃO CONSTRUÍDO** |

**A linha da baixa por perda merece leitura em voz alta.** Sem ela, um título
que nunca vai ser recebido só tem dois destinos, e os dois são errados: ficar
aberto para sempre (inflando o total a receber, que passa a ser uma promessa
falsa) ou ser cancelado (o que apaga que ele foi devido). Está registrado como
buraco conhecido, não como esquecimento.

---

## 6. O QUE A PRÓXIMA ETAPA HERDA

- **O módulo está pronto e provado, mas em ARQUIVO:** `0010` não foi aplicado.
- ⚠️ **O schema `ar` precisará ser EXPOSTO na Data API do Supabase pelo dono** —
  quarta vez que este aviso aparece. Runbook §10.0.
- **A conciliação de recebimentos do Módulo 1 está CONSTRUÍDA em arquivo**
  (`0011_recon_receivables.sql`). Apply: `0010` depois `0011`, redeploy do
  `apps/api`.
- **Ainda NÃO CONSTRUÍDO neste módulo:** botões de recebimento/estorno na tela;
  baixa por perda; AR escutar confirmação do recon (`consumes` continua `[]`).
- **O par `ap`/`ar` agora tem três guardas de espelho** (teste de pacote, teste
  SQL com os dois lados no mesmo banco, guarda de CI contra as constraints
  aplicadas). Quem mexer num dos dois ciclos de vida sem mexer no outro descobre
  imediatamente.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
