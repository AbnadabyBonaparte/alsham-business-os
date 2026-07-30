# 💰 MÓDULO 30 — CONTAS BANCÁRIAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `bank` ou no pacote
> `@alsham/bank-accounts`.
>
> **Leia junto com [MODULO-CASH-SPEC](MODULO-CASH-SPEC.md)** (o irmão de
> dinheiro, que deixou a multi-conta estruturada para cá) e
> [MODULO-RECON-SPEC](MODULO-RECON-SPEC.md) — a conciliação, que este módulo
> NÃO refaz (Sol Único).
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `bank`.** Curto, internacional, greppável com fronteira, zero
colisões na frota (Q5–Q6 conferidas).

**`domain_key` = `finance`.** A Taxonomia §5 põe *Bancos* na linha do 💰
Financeiro.

**⭐ SOL ÚNICO — A CONCILIAÇÃO JÁ EXISTE.** A mesa de conciliação, o parser de
OFX/CSV e o casamento extrato×título são do `recon` (Módulo 1, `0011`–`0014`),
PROVADOS e no ar. Este módulo NÃO os refaz — seria uma segunda fonte de verdade
para o mesmo fato. Ele é o **cadastro das contas** e o **livro de movimentos
por conta** — a capacidade *Bancos* que o `cash` explicitamente deixou de fora
("Multi-conta ESTRUTURADA … é capacidade própria — *Bancos*", cabeçalho do
`0029`).

**⭐ A CONTA É DADO DO TENANT — e volta do arquivo.** Apelido livre;
banco/agência/número em texto (o banco de um país e de uma década não vira
enum). `archived → active` EXISTE (o argumento do crm/cash): a conta reativada
é a MESMA conta, e partir o extrato em dois mentiria no saldo. Cada conta tem
UMA moeda, e ela não muda depois (reclassificaria o passado).

**⭐⭐ O SALDO NEGATIVO É PERMITIDO — o DIVERGE assinado.** O saldo é a soma do
livro (view, nunca coluna), e NENHUMA constraint o proíbe de ficar negativo:
cheque especial e conta garantida são produtos bancários reais. Recusar o
lançamento que deixa o saldo abaixo de zero obrigaria o operador a MENTIR sobre
o que o banco mostra. É a física do `inv` (saldo negativo permitido) re-
perguntada para o DINHEIRO NA CONTA. Teste de contraste inv×bank assina.

**⭐ A TRANSFERÊNCIA É ATÔMICA.** Transferir é uma SAÍDA numa conta e uma
ENTRADA na outra, ligadas por um `transfer_id`, gravadas na MESMA transação por
`bank.transfer()`. Nunca meia-transferência. Checa a permissão de lançar, as
duas contas do mesmo tenant, ativas e na mesma moeda (câmbio é futuro
declarado). O livro é imutável — desfazer é transferir de volta.

**⭐ O FUTURO É RECUSADO** (o DIVERGE do inv mantido com o cash): dinheiro que
"vai mover" é previsão (Orçamento), não extrato.

**⭐ Vínculo com o mundo por ID SOLTO + nome carimbado, nunca FK cruzada:**
`counterparty_name` é texto; `external_ref` é o id solto do documento.

---

## 1. AS PEÇAS

- `bank.accounts`: as contas — dado do tenant, voltam do arquivo, moeda única.
- `bank.movements`: o LIVRO por conta — imutável em três camadas; o sinal é do
  tipo; a transferência liga duas pernas por `transfer_id`.
- `bank.balances`: o saldo por conta — view calculada (`security_invoker`),
  PODE ser negativo.
- `bank.transfer()`: a transferência atômica — duas pernas, uma transação.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `bank.account.registered` | uma conta entrou no cadastro |
| `bank.account.archived` | uma conta saiu de uso — o livro fica |
| `bank.movement.registered` | um movimento entrou no livro de uma conta |
| `bank.transfer.executed` | uma transferência rodou — as duas pernas ligadas |

`consumes` **VAZIO** e honesto (Lei 7): a conciliação é do `recon`; lançar por
consumo cairia na dupla contagem que o `cash §5` declarou sem regra de fonte.

## 3. AS TELAS

`/contas-bancarias`: as contas (cadastrar, arquivar, devolver), o livro e o
saldo por conta (negativo em destaque honesto), lançar entrada/saída/ajuste e
transferir entre contas. Porta própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`account.manage` (as contas), `movement.register` (lançar e transferir) e
`movement.adjust` (ajustar — reescreve a conta, de quem confere, não de quem
lança — o desenho do inv/cash).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Conciliação bancária (mesa, OFX/CSV, casamento) | **JÁ EXISTE no `recon`** — Sol Único: não se refaz aqui |
| Transferência entre MOEDAS (câmbio) | exigiria taxa e o par de valores — capacidade própria, declarada |
| Saldo projetado / previsão de caixa | previsão é Orçamento (Módulo 29), não extrato realizado |
| Lançamento por consumo de evento (cash/ap/ar) | dupla contagem sem regra de exclusividade de fonte (a lição do `cash §5`) |
| Integração bancária real (Open Finance, API do banco) | Lei 3 — integra-se, não se constrói |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sete.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `bank` (`0045_bank.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §20) |
| Pacote `@alsham/bank-accounts` (ciclo, saldo, validações, transferência) | ✅ construído, com testes |
| Seed (30º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`35_bank_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/contas-bancarias` (contas, livro, saldo, transferência) | ✅ CONSTRUÍDO |
| Conciliação · câmbio · previsão · consumo · Open Finance | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0045_bank.sql` (terceiro da Missão Sete).
2. Reaplicar o seed — o 30º cartão entra.
3. ⚠️ **Expor o schema `bank` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

`consumes` vazio: sem redeploy do `apps/api`. Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
