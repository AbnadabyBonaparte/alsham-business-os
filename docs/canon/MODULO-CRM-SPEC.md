# 🤝 MÓDULO 4 — RELACIONAMENTOS (CRM BASE)
## ALSHAM Business OS™ · Especificação do módulo · Domain `crm`

> Leitura obrigatória para quem for mexer no schema `crm` ou no pacote
> `@alsham/crm`.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DUAS DECISÕES DE CANON

**1. O `module_id` é `crm`.**

O [CORE-SPEC §3](CORE-SPEC.md) define o tipo de evento como
`<moduleId>.<agregado>.<fato>`, e o cinto de `emit_event()` confere esse
prefixo. Com eventos e permissões em `crm.*`, o `module_id` **tem** de ser
`crm` — qualquer outra escolha faria a porta de saída recusar os próprios
eventos do módulo, em runtime, no primeiro cadastro. Foi a lição que o Módulo 3
documentou; aqui ela já é padrão, e há teste que compara o id do manifesto com
o cinto da migration.

**2. O `domain_key` é `crm` — [Taxonomia §5](TAXONOMIA-EMPRESARIAL-ALSHAM.md),
"🤝 Comercial & CRM (12)".**

A seção lista, literalmente: *CRM · Pipeline · Propostas · Orçamentos ·
Follow-up · Visitas · Clientes · Leads · WhatsApp · Ligações · Comissão ·
Metas*, com a nota *"reaproveita 360° PRIMA"* — que é a Lei 4 em letra.

### ⚠️ Uma capacidade daquela lista não pode virar schema, e é `WhatsApp`

A Taxonomia nomeia as capacidades **como o mercado as nomeia**. É um mapa do
que empresas fazem, não um projeto de tabela. Congelar "WhatsApp" numa coluna
ou num enum congelaria o instrumento de um país e de uma década dentro de um
produto que nasce servindo qualquer um.

Aqui o canal da interação é **texto livre** — e é assim que a capacidade
continua atendida quando o instrumento mudar de nome, de dono ou de país. Há
teste que reprova a palavra no schema.

### E por que se declara `CRM` e não `Clientes`

"Clientes" seria mais modesto e seria **errado**: este módulo cadastra
*contrapartes* — cliente, fornecedor, parceiro, prospecto —, e chamar isso de
"Clientes" descreveria menos do que ele faz **e** presumiria que toda
contraparte compra alguma coisa.

---

## 1. LEI 4 — O REAPROVEITAMENTO, E A DIVERGÊNCIA DELIBERADA

`packages/crm/README.md` e o [Balanço Supabase](../balancos/BALANCO-SUPABASE.md)
mandam minerar o SCHEMA do `alsham-core` — `accounts` / `contacts` / `deals` /
`quotes` — **jamais o banco** (banco-mãe compartilhado é a lição nº 2 a não
repetir).

Minerou-se a ideia, com uma divergência que precisa estar escrita:

> A pedreira separa `accounts` (organização) de `contacts` (pessoa).
> **Aqui é UMA tabela, com `kind`.**

Duas tabelas forçam uma hierarquia — o contato PERTENCE a uma conta — e essa
hierarquia presume um organograma de venda B2B. Um fornecedor autônomo é pessoa
sem conta; um cliente de uma pessoa só é os dois ao mesmo tempo; um parceiro não
é nem um nem outro. Com `kind` numa tabela só, o módulo serve os três sem
presumir o negócio de ninguém — e, o que mais importa, **o histórico de contato
fica inteiro num lugar só**, que é a razão de este módulo existir.

⚠️ **NÃO VERIFICADO:** este repositório não leu o schema real do `alsham-core`.
A mineração partiu do que o Balanço registra, e o Balanço é documento — não é o
banco. Nenhum agente daqui conecta a banco com dado de cliente.

---

## 2. ⭐ O QUE ATRAVESSA A FRONTEIRA — e o que não

### 2.1 O módulo EMITE

| Evento | Quando |
|---|---|
| `crm.party.registered` | uma contraparte entrou na carteira |
| `crm.party.updated` | mudou nome, identificador, contato ou etiquetas |
| `crm.party.archived` | saiu da carteira — a ação destrutiva |
| `crm.interaction.registered` | um contato foi registrado no histórico |

**Corrigir a observação interna não emite nada**, e trazer uma contraparte de
volta também não. Emitir a cada salvamento encheria a caixa de saída de ruído —
e o tenant paga por evento entregue.

⭐ **O payload é AUTOSSUFICIENTE**, e no caso da interação isso é literal: o
envelope carrega os dados da contraparte junto, porque quem receber
`crm.interaction.registered` **não tem como resolver um `partyId` sozinho** — o
schema deste módulo é invisível para ele, por policy e por lei.

### 2.2 O módulo CONSOME: **nada**, e é Lei 7

A integração óbvia existe e é tentadora: o fornecedor de um título a pagar
virar contraparte aqui, sozinho, pelo evento `ap.payable.registered` — que já
carrega `supplierName` e `counterpartyTaxId` no envelope, justamente porque o
payload é autossuficiente. **Tecnicamente daria hoje.**

Não entra por duas razões, e as duas importam:

1. **O handler não existe.** Consumo declarado sem consumidor faz o Core acordar
   um módulo que não sabe responder, e a Store passaria a anunciar uma
   integração que não acontece.
2. **Há uma decisão de produto por baixo, e ela é do dono.** Nem todo fornecedor
   pago é contraparte que se quer na carteira comercial. Criar contraparte
   sozinho encheria o cadastro de linhas que ninguém pediu. Quando isso for
   construído, é com regra de *quando* criar — e a regra é `settings` do tenant,
   nunca constante no módulo.

---

## 3. ⚖️ O TESTE ANTI-VIÉS, CAMPO A CAMPO

CRM é onde o viés entra mais fácil de todos: o funil de UMA empresa vira enum, e
o produto passa a vender o processo de um cliente para todos.

### O que ENTROU

| Campo | Por quê |
|---|---|
| `kind` com **dois** valores | pessoa/organização é a distinção que muda o comportamento no mundo real, e a única que vale em qualquer país e setor |
| `tax_id`, neutro e **opcional** | "identificador fiscal". Cada país põe o seu; nem toda contraparte tem um |
| `tags text[]` | é aqui que "cliente", "fornecedor", "VIP" vivem, e é aqui que eles DEVEM viver |
| `email`, `phone`, opcionais e sem formato | formato de telefone é de um país |
| `channel` da interação, **texto livre** | ver §0 |
| `occurred_at` separado de `created_at` | quando ACONTECEU não é quando foi DIGITADO |

### O que NÃO entrou

| Recusado | Por quê |
|---|---|
| `type` com enum de negócio (`cliente`/`fornecedor`/`lead`) | parece inofensivo e é o viés inteiro: uma empresa que compra e vende para a mesma contraparte precisaria de duas linhas, e o histórico se partiria em dois |
| funil, estágio, pipeline, probabilidade, valor esperado | *Pipeline* é outra capacidade e é MÓDULO próprio |
| `whatsapp`, `instagram`, `celular`, `telefone_fixo` | instrumento de contato de um país e de uma década |
| dono/responsável/vendedor, comissão, meta | organograma de cliente |
| endereço estruturado (rua/CEP/estado) | formato de endereço é o que mais varia entre países, e o módulo não precisa dele para existir |
| `direction`, `outcome`, `sentiment`, `next_step`, `duration` na interação | cada um é o processo de uma equipe de venda virando obrigação de todas |

### E o que a VALIDAÇÃO deliberadamente não faz

- **o identificador fiscal não tem formato.** Nada de 11-ou-14 dígitos, nada de
  dígito verificador, nada de máscara. É o erro mais fácil de cometer neste
  módulo inteiro, e há teste com seis formatos de países diferentes;
- **o telefone não tem formato**;
- **o e-mail só precisa parecer um e-mail** — um `@` com coisa dos dois lados.
  Regex "completa" recusa endereços válidos, e quem paga é o usuário que tem um;
- **data de interação no futuro não é erro.** Registrar a visita marcada para
  amanhã é uso legítimo; quem separa "planejado" de "aconteceu" é *Follow-up*,
  que **NÃO está construída**.

---

## 4. O CICLO DE VIDA — e por que ele difere do Módulo 3

```
  active ⇄ archived
```

⭐ **`archived → active` EXISTE, e a diferença para o Módulo 3 é a lição.**

Lá, `cancelled` é TERMINAL: um título que volta a ser devido é documento NOVO,
com referência nova, porque **dinheiro tem identidade por documento**.

Aqui, uma contraparte que volta é a **MESMA pessoa**. Obrigá-la a nascer de novo
criaria uma segunda linha para alguém que é um só — e partiria o histórico de
contato em dois, que é exatamente o que este módulo existe para manter inteiro.

**Copiar a regra do módulo anterior "por consistência" teria sido o erro.**

A tabela vive em `crm.allowed_transition()` (SQL) **e** em
`ALLOWED_TRANSITIONS` (`@alsham/crm`), e um teste **lê o arquivo da migration** e
compara par a par — mesma arquitetura do Módulo 3.

⚠️ **Arquivar é STATUS, nunca `delete`**, nas duas tabelas: sem GRANT e sem
policy de DELETE, conferidos no banco aplicado. E a chave estrangeira da
interação é `on delete restrict`: se um dia alguém conseguir apagar uma
contraparte, o banco recusa enquanto houver histórico.

---

## 5. ⭐ A INTERAÇÃO É IMUTÁVEL — em três camadas

Uma interação é o registro de que **algo aconteceu**. Fato consumado não se
edita. Se o registro saiu errado, a correção é **outra interação** dizendo o que
se corrigiu — como um livro-caixa se corrige com estorno, nunca com borracha.

| Camada | O que é | De quem protege |
|---|---|---|
| 1 | sem policy de UPDATE — a RLS nega por ausência | do cliente |
| 2 | sem GRANT de UPDATE nem de DELETE — a porta nem existe | do cliente |
| 3 | um trigger que levanta erro em UPDATE e DELETE | **de nós mesmos** — um script de manutenção rodando como `postgres` passaria pelas duas primeiras sem esbarrar em nada |

Duas bastariam para o cliente. A terceira é a que o teste SQL exercita rodando
como dono do banco.

**A tela não tem botão de editar nem de apagar, e a ausência é a mensagem** — um
botão ali só produziria uma mensagem de erro bonita.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 28/07/2026, na Etapa 11.*

| Peça | Estado |
|---|---|
| Manifesto, tipos, validação, ciclo de vida, busca | ✅ construído, com testes |
| Schema `crm` (`0009_crm.sql`) | ✅ **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |
| Telas: lista com busca e filtro, cadastrar, editar, arquivar | ✅ construídas |
| Linha do tempo de interações, com registrar | ✅ construída |
| Consumo de eventos de outros módulos | **NÃO CONSTRUÍDO**, e é Lei 7 — ver §2.2 |
| Pipeline, Propostas, Orçamentos, Follow-up, Visitas, Leads, Comissão, Metas | **NÃO CONSTRUÍDO** — 11 das 12 capacidades do Domain |
| Envio de mensagem por qualquer canal | **NÃO CONSTRUÍDO** — o módulo REGISTRA que o contato aconteceu; ele não fala com ninguém |
| Importação de carteira (CSV, agenda, ERP) | **NÃO CONSTRUÍDO** |
| Deduplicação por semelhança de nome | **NÃO CONSTRUÍDO** — a unicidade é só por identificador, e só quando informado |
| Agente de IA embarcado | **NÃO CONSTRUÍDO** |

**A terceira linha de baixo merece leitura em voz alta.** Este módulo **não
envia mensagem nenhuma**. Ele registra que o contato aconteceu. Integrar canal é
*Construir × INTEGRAR* (Lei 3) e é decisão de dono.

---

## 7. O QUE A PRÓXIMA ETAPA HERDA

- **O módulo está pronto e provado, mas em ARQUIVO:** `0009` ainda não foi
  aplicado. Enquanto não for, o módulo não existe em produção.
- ⚠️ **O schema `crm` precisará ser EXPOSTO na Data API do Supabase pelo dono** —
  lição da Etapa 9, repetida na 10. Sem isso as telas carregam vazias e o erro
  não diz o motivo. Está no runbook §9.0.
- **A guarda "módulo não conhece módulo" agora gera a matriz de pares** em vez de
  listá-los à mão. Com três módulos eram 6 pares; com quatro são 12; com cinco
  serão 20. Uma lista escrita à mão é uma lista que um dia esquece um par — e
  justamente o par novo. Acrescentar um módulo agora é acrescentar **uma linha**
  ao mapa de schemas.
- ✅ **A dívida do N+1 na tela FOI PAGA** (Etapa 15), e do jeito que esta seção
  previa: uma consulta agrupada **na porta** — `loadInteractionsFor()` traz o
  histórico de todas as contrapartes de uma vez —, nunca um `fetch` no cliente,
  que exigiria expor outra rota e outra checagem de permissão.
  ⚠️ O teto de 2000 é **do conjunto, não por contraparte**: com 500
  contrapartes na porta, um teto por contraparte seria um teto que não existe.
- A integração `ap → crm` é a primeira candidata natural a consumo, e está
  descrita em §2.2 com o que falta decidir antes.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
