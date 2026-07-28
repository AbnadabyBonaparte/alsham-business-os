# 💰 MÓDULO 3 — CONTAS A PAGAR
## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `ap`, no pacote
> `@alsham/accounts-payable` ou na projeção que o `recon` alimenta a partir
> daqui.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. ⚠️ POR QUE O IDENTIFICADOR É `ap` E NÃO `accounts-payable`

Porque o `CORE-SPEC` define o tipo de evento como `<moduleId>.<agregado>.<fato>`
e o cinto de `emit_event()` confere exatamente esse prefixo.

Com eventos e permissões em `ap.*`, o `module_id` **tem** de ser `ap`: qualquer
outra escolha faria a porta de saída do módulo recusar os próprios eventos dele
— em runtime, no primeiro título registrado, e não no CI.

- **Identificador** (`module_registry.module_id`, prefixo de evento e de
  permissão, nome do schema): `ap`
- **Nome legível** (o que a Store exibe): *Contas a Pagar*
- **Pacote**: `@alsham/accounts-payable`

Só o identificador é curto, e é ele que o contrato exige que seja o prefixo. Há
teste que compara o `id` do manifesto com o cinto da migration.

---

## 1. POR QUE ESTE MÓDULO EXISTE — e não é "porque toda empresa tem contas"

Ele existe para provar a **terceira ponta do Lego**, que era a única que faltava:

- O **Módulo 1** provou que um módulo vive sobre o Core sem tocá-lo indevidamente.
- O **Módulo 2** provou que um módulo **reage** ao fato de outro sem conhecê-lo.
- O **Módulo 3** prova que **o mais antigo vira consumidor** — que a direção do
  Lego não estava escondida no desenho.

`recon.payables` nasceu na Etapa 2 com `source in ('imported','event')`,
`source_module_id` e `unique (tenant_id, external_ref)`. Foi desenhada
**esperando um módulo que ainda não existia**. Quando ele chegou, coube:
**nenhuma linha do `0002_recon.sql` mudou.** É essa a prova, e ela não se pode
fabricar depois.

---

## 2. ⭐ O QUE ATRAVESSA A FRONTEIRA — e o que não

### 2.1 O módulo EMITE

| Evento | Quando | O que carrega |
|---|---|---|
| `ap.payable.registered` | o título nasceu | referência, vencimento, valor, moeda, liquidado, fornecedor, identificador fiscal, descrição, estado |
| `ap.payable.updated` | mudou **valor, vencimento, liquidação ou estado** | o mesmo envelope, com o estado atual |
| `ap.payable.cancelled` | o título foi cancelado | o mesmo envelope, com `status = cancelled` |

**Corrigir a descrição não emite nada**, e é decisão: trabalho interno não é
fato para o mundo. Emitir a cada salvamento encheria a caixa de saída de ruído —
e o tenant paga por evento entregue.

### 2.2 ⭐ O PAYLOAD É AUTOSSUFICIENTE — e isso não é zelo, é a regra

Quem escuta **não pode fazer join**: o schema deste módulo é invisível para ele,
por policy e por lei. Se o envelope trouxesse só um id, o consumidor ficaria com
um identificador que não sabe resolver — e a única saída seria ler a tabela
alheia, que é exatamente o que o Lego proíbe.

Por isso `ap.payable_payload()` monta o envelope inteiro, e há teste SQL que
confere campo a campo.

### 2.3 O módulo CONSOME: **nada**, e é Lei 7

Seria fácil declarar que ele escuta a baixa do Módulo 1 e se liquida sozinho — é
a integração óbvia, e a primeira que um cliente pede. Mas **o handler não
existe**, e consumo declarado sem consumidor faz o Core acordar um módulo que
não sabe responder.

Quando o handler existir, `consumes` muda. Até lá, ele é `[]`, e isso é a
verdade.

---

## 3. ⭐ O LADO QUE FECHA O TRIÂNGULO

O consumidor **não vive aqui**. Ele vive no módulo que escuta —
`packages/finance-reconciliation/src/external-payable.ts` — porque quem consome
é quem constrói o handler.

```
  ap.payables            (insert)
        │  trigger, MESMA transação
        ▼
  core.event_outbox      ap.payable.registered
        │  o correio, com service_role
        ▼
  handleExternalPayable  (packages/finance-reconciliation)
        │  a composição faz a ponte — apps/api
        ▼
  recon.record_external_payable()
        │
        ▼
  recon.payables         source='event', source_module_id=<producedBy>
```

### 3.1 ⛔ A ORIGEM VEM DO ENVELOPE. SEMPRE.

Não há a string `'ap'` nem `'accounts-payable'` no consumidor, no adaptador, nem
na função SQL de projeção. A procedência é lida de `envelope.producedBy` e
desce por argumento até o banco.

Com a origem chumbada, um segundo produtor — outro módulo, uma integração de
ERP, um importador — entraria no `recon` **disfarçado do primeiro**, e a trilha
mentiria sem nunca dar erro. Há guarda no CI que reprova as três formas de
chumbar, e um teste que projeta com um produtor fictício (`erp-bridge`) para
provar que a origem gravada é a dele.

### 3.2 As três garantias, e quem responde por cada uma

| Garantia | Quem responde |
|---|---|
| não entregar duas vezes ao mesmo consumidor | o correio (`core.processed_events`) |
| projetar duas vezes dar o mesmo resultado | o banco (`unique (tenant_id, external_ref)`) |
| não sobrescrever o que uma pessoa digitou | `recon.record_external_payable()` |

A terceira é a mais fácil de errar em silêncio. Se já existe um título com
aquela referência marcado `source = 'imported'`, **a projeção não o
sobrescreve** e devolve `skipped-imported`. O que um humano registrou no `recon`
é verdade local dele, e um evento não apaga trabalho de gente.

Não levanta exceção: evento que falha para sempre entope a fila sem consertar
nada.

---

## 4. ⚖️ O TESTE ANTI-VIÉS, CAMPO A CAMPO

Contas a Pagar é onde a tentação brasileira mora.

### O que ENTROU

| Campo | Por quê |
|---|---|
| `external_ref` | a referência do documento na origem. Texto opaco, escolhido pelo tenant. É também a chave de idempotência de quem projeta |
| `amount_cents bigint` positivo | inteiro em centavos: universal e sem erro de ponto flutuante |
| `currency` ISO 4217, **sem default** | moeda presumida é viés de país |
| `counterparty_tax_id` | nome NEUTRO. Chamar de `cnpj` amarraria o produto ao Brasil |
| `payment_method` como **texto livre** | ver abaixo |
| `due_date`, `supplier_name`, `description` | o mínimo para o título existir |

### O que NÃO entrou

| Recusado | Por quê |
|---|---|
| boleto, PIX, código de barras, linha digitável | são **instrumentos de pagamento de um país**, e alguns nem existiam há dez anos. Um schema com coluna `codigo_de_barras` é um schema que envelhece e que não serve o cliente de fora. Integração de pagamento é Lei 3 |
| banco, agência, conta, lista de bancos homologados | a capacidade *Bancos* é outra peça do Domain |
| plano de contas, centro de custo, rateio | capacidades próprias, de outros módulos |
| alçada de aprovação, política de pagamento | quem aprova é *Aprovações financeiras* (Módulo 1); a POLÍTICA é `settings` do tenant |
| parcelamento como estrutura | parcela é um título com data e valor próprios. "Parcela 3 de 12" aqui duplicaria a linha e criaria dois lugares para a mesma verdade |

**Vencimento no passado NÃO é erro.** Título atrasado é o caso mais comum de
quem começa a usar o sistema — quem migra tem gaveta cheia deles. Recusar seria
impedir a entrada do que já existe.

---

## 5. O CICLO DE VIDA — e por que ele existe em dois lugares

```
  open ──► partially_settled ──► settled
    │            │      ▲            │
    │            │      └────────────┘   (estorno)
    │            │
    └────────────┴──► cancelled          (terminal)
```

- ⛔ **`settled → cancelled` não existe.** Cancelar um título já pago apagaria a
  fronteira entre *"não devíamos isso"* e *"pagamos isso"*. Se o pagamento tem de
  voltar, ele volta primeiro (estorno para `open`) e só então o documento se
  cancela. **Dois atos, dois registros.**
- ⛔ **`cancelled` é terminal.** Se voltarmos a dever, é documento NOVO, com
  referência nova.
- ⛔ **Cancelar é STATUS, nunca `delete`.** `ap.payables` não tem policy nem
  GRANT de DELETE, e há guarda no CI que confere as duas coisas **no banco
  aplicado**, não no arquivo.

A tabela vive em `ap.allowed_transition()` (SQL) **e** em `ALLOWED_TRANSITIONS`
(`@alsham/accounts-payable`), e a duplicação é deliberada: regra que só vive no
TypeScript não protege quem escreve SQL à mão nem o correio; regra que só vive
no SQL faz a tela descobrir o "não" depois do round-trip.

O que torna isso arquitetura em vez de descuido é o terceiro pedaço:
**`lifecycle.test.ts` lê o arquivo da migration e compara par a par.** Se as
duas listas divergirem, o teste quebra antes de o CI chegar no banco.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 28/07/2026, na Etapa 10.*

| Peça | Estado |
|---|---|
| Manifesto, tipos, validação, ciclo de vida | ✅ construído, com testes |
| Schema `ap` (`0007_ap.sql`) | ✅ **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |
| Porta de projeção do `recon` (`0008_recon_ap_projection.sql`) | ✅ **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |
| Consumidor no Módulo 1 (`external-payable.ts`) | ✅ construído — a prova da etapa |
| Inscrição na composição (`apps/api`) | ✅ construída, com teste de ponta contra Postgres |
| Telas: listar, registrar, cancelar | ✅ construídas — com confirmação em dois passos |
| Registro de liquidação pela tela | ⚠️ **schema e domínio prontos, sem tela.** O ciclo de vida aceita liquidação parcial e total; a UI é etapa própria |
| Estorno pela tela | ⚠️ mesma coisa — a transição existe e é provada; o botão não |
| Fluxo de caixa, bancos, plano de contas, centro de custo | **NÃO CONSTRUÍDO** — 18 das 19 capacidades do Domain Financeiro |
| Pagamento de verdade (arquivo de remessa, integração bancária) | **NÃO CONSTRUÍDO**, e é Lei 3: integra-se, não se constrói |
| Agente de IA embarcado | **NÃO CONSTRUÍDO** |

**A penúltima linha merece leitura em voz alta.** Este módulo **não paga nada**.
Ele registra o que se deve e conta isso à plataforma.

---

## 7. O QUE A PRÓXIMA ETAPA HERDA

- **O triângulo está fechado e provado**, mas em ARQUIVO: `0007` e `0008` ainda
  não foram aplicados. Enquanto não forem, o módulo não existe em produção.
- ⚠️ **O schema `ap` precisará ser EXPOSTO na Data API do Supabase pelo dono** —
  lição paga na Etapa 9 com o schema do `marketing`. Sem isso, as telas
  carregam vazias e o erro não diz o motivo. Está no runbook §8.
- O padrão do consumo **em duas direções** está pronto: um mesmo pacote é
  produtor numa ponta e consumidor na outra, sem importar ninguém.
- A dívida do adaptador de banco (`MODULO-RECON-SPEC §7`) **não piorou**: o
  módulo ganhou porta própria, como manda a Lei do Lego §5.5.8.
- ⚠️ **O seed passou a ser `do update` no catálogo** (antes era `do nothing`).
  Reaplicá-lo agora traz a linha do módulo para a verdade do manifesto — e
  desfaz edições feitas à mão no `module_registry`. É o preço de ter uma fonte
  só, e está documentado no próprio seed.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
