# 💰 MÓDULO 31 — INVESTIMENTOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `invest` ou no pacote
> `@alsham/investments`.
>
> **Leia junto com [MODULO-AR-SPEC](MODULO-AR-SPEC.md)** (que PERMITE receber a
> maior) e [MODULO-INV-SPEC](MODULO-INV-SPEC.md) (que PERMITE saldo negativo) —
> os dois precedentes da terceira resposta.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `invest`.** Curto, greppável com fronteira, zero colisões na
frota (Q5–Q6 conferidas).

**`domain_key` = `finance`.** A Taxonomia §5 põe *Investimentos* na linha do 💰
Financeiro.

**⭐ A POSIÇÃO É A SOMA DOS ATOS — SEM COTAÇÃO AUTOMÁTICA.** O livro tem três
atos: APLICAÇÃO (dinheiro que entra), RENDIMENTO (juro/lucro creditado,
ENTRADO por gente do extrato) e RESGATE (dinheiro que sai). A posição é a soma
deles, calculada na leitura (view, nunca coluna). **O rendimento NUNCA se
calcula de uma taxa nem se busca de um provedor de mercado** — marcar a
mercado, projetar rentabilidade e comparar com índice (CDI, Ibovespa) são
capacidades de PROVEDOR DE DADOS, integração (Lei 3), declaradas FORA. Um número
que o sistema inventasse seria promessa sem fonte (Lei 7).

**⭐⭐ RESGATAR MAIS QUE A POSIÇÃO É RECUSADO — a TERCEIRA resposta, assinada.**
Dois precedentes re-perguntados:
- o `ar` PERMITE receber a maior (o dinheiro já entrou na conta);
- o `inv`/`bank` PERMITEM saldo negativo (o físico e o cheque especial são
  estados reais).

A resposta do investimento é a TERCEIRA e DIFERENTE: não se resgata o que não
está no papel. Não é "o dinheiro já entrou" (não entrou) nem "o saldo pode
ficar negativo" (a posição de um fundo não fica negativa — o custodiante
recusa). Permitir seria o livro afirmar dinheiro que nunca esteve lá. Gatilho
confere a posição ANTES do resgate; teste de contraste ar×inv×invest assina.

**⭐ O investimento é DADO DO TENANT** — nome, tipo e instituição em texto livre
(CDB, cota de fundo, imóvel); nunca enum de produto. Volta do arquivo (o
argumento do crm). O futuro é recusado (o DIVERGE do inv mantido com cash/bank).

`consumes` **VAZIO**: o rendimento é ato de gente, não consumo de evento.

---

## 1. AS PEÇAS

- `invest.holdings`: os investimentos — dado do tenant, voltam do arquivo.
- `invest.movements`: o LIVRO de atos — imutável; aplicação/rendimento somam,
  resgate subtrai; o resgate não passa da posição (o gatilho confere).
- `invest.positions`: a posição por investimento — view calculada
  (`security_invoker`), soma dos atos, NUNCA marcação a mercado.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `invest.holding.registered` | um investimento entrou no cadastro |
| `invest.holding.archived` | um investimento saiu de uso — o livro fica |
| `invest.movement.registered` | um ato entrou (aplicação, rendimento, resgate) |

`consumes` **VAZIO** e honesto (Lei 7).

## 3. AS TELAS

`/investimentos`: os investimentos (cadastrar, arquivar, devolver), a posição
por investimento (aplicado, rendimento, resgatado) e registrar atos (com o
resgate barrado além da posição). Porta própria, mock honesto, menu por
permissão.

## 4. AS PERMISSÕES

`holding.manage` (o cadastro) e `movement.register` (os atos: aplicar, render,
resgatar).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Marcação a mercado / cotação automática | provedor de dados de mercado — integração (Lei 3) |
| Rentabilidade projetada / simulação | previsão é achismo até virar fato (Lei 7) |
| Comparação com índice (CDI, Ibovespa) | benchmark exige a série do índice — integração |
| Cálculo de rendimento por taxa | o rendimento é ATO registrado do extrato, não fórmula |
| Imposto de renda / come-cotas | ofício fiscal — Lei 3, integração declarada |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sete.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `invest` (`0046_invest.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §20) |
| Pacote `@alsham/investments` (ciclo, posição, terceira resposta, validações) | ✅ construído, com testes |
| Seed (31º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`36_invest_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/investimentos` (investimentos, posição, atos) | ✅ CONSTRUÍDO |
| Cotação · rentabilidade projetada · índice · IR | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0046_invest.sql` (quarto da Missão Sete).
2. Reaplicar o seed — o 31º cartão entra.
3. ⚠️ **Expor o schema `invest` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

`consumes` vazio: sem redeploy do `apps/api`. Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
