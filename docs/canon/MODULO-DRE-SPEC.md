# 💰 MÓDULO 32 — DRE GERENCIAL

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `dre` ou no pacote
> `@alsham/dre`.
>
> **Leia junto com [MODULO-CASH-SPEC](MODULO-CASH-SPEC.md)** e
> [MODULO-CC-SPEC](MODULO-CC-SPEC.md) — os dois livros de onde os valores
> nascem — e com [MODULO-NPS-SPEC](MODULO-NPS-SPEC.md), a lição do "sem
> lançamento, sem linha".
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `dre`.** A sigla consagrada de Demonstração do Resultado do
Exercício; greppável com fronteira, zero colisões na frota (Q5–Q6 conferidas).

**`domain_key` = `finance`.** A Taxonomia §5 põe *DRE* na linha do 💰
Financeiro.

**⛔ GERENCIAL, NÃO FISCAL (Lei 3, em garrafal).** Este módulo NÃO emite SPED,
ECD, ECF nem obrigação acessória. DRE fiscal, plano de contas contábil e
apuração de tributos são OFÍCIO DO CONTADOR e se INTEGRAM (Lei 3), nunca se
constroem aqui. O que ele faz é a leitura gerencial: quanto entrou, quanto
saiu, quanto sobrou — com as linhas que o TENANT desenha.

**⭐ O PLANO DE LINHAS É DESENHO DO TENANT — jamais plano de contas semeado.**
`dre.lines`: nome livre, uma NATUREZA (receita/custo/despesa — CHECK
argumentado, física contábil universal) e a CATEGORIA que a linha agrega.
"Receita Bruta / CMV / Despesas Administrativas" é a estrutura de UMA empresa;
não se semeia. A natureza é o único vocabulário fixo — porque receita soma e
custo/despesa subtraem, e isso vale em toda casa.

**⭐⭐ OS VALORES NASCEM DO LIVRO — consumidor real de cash.* E cc.*.** A DRE
NÃO tem lançamento próprio. Os valores nascem de DOIS produtores, projetados
por evento (padrão E10, o SEXTO consumidor do repositório e o primeiro com dois
produtores):
- `cash.entry.registered` — o desembolso/recebimento, pela categoria;
- `cc.rateio.executed` — o custo rateado, pela origem do rateio (sinal
  negativo).

A projeção grava só por `dre.record_external_entry()` (§5); a origem vem de
`envelope.producedBy`. O módulo NÃO importa o `cashflow` nem o `cost-centers`,
não lê os schemas deles e não conhece o correio.

**⚠️ A DRE NÃO inventa exclusividade de fonte** (a lição do `cash §5`): ela
agrega o que o PLANO aponta. Se o tenant criar uma linha que casa a categoria
do caixa E outra que casa o nome do rateio do MESMO custo, o dobro aparece — e
é escolha visível no plano, não erro do sistema.

**⭐ LINHA SEM LANÇAMENTO NÃO APARECE (a lição do nps):** o demonstrativo é o
INNER JOIN das linhas com o livro projetado — linha sem valor não vira zero
decorativo, não entra. Totais e subtotais são VIEWS calculadas, nunca colunas.
A competência vem da DATA do lançamento (mês).

---

## 1. AS PEÇAS

- `dre.lines`: o plano — desenho do tenant; natureza (física), categoria de
  casamento; volta do arquivo.
- `dre.realized_entries`: a PROJEÇÃO dos livros (cash e cc) — escrita só por
  `dre.record_external_entry()`.
- `dre.statement`: o demonstrativo por linha e mês — view calculada
  (`security_invoker`, INNER JOIN); linha sem lançamento não aparece.
- `dre.result`: o resultado por mês (receita, custo, despesa, resultado) — view.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `dre.line.registered` | uma linha entrou no plano |
| `dre.line.archived` | uma linha saiu do plano — o histórico fica nos livros |

`consumes` **NÃO VAZIO**: `cash.entry.registered` **e** `cc.rateio.executed` —
os dois com handler construído (`realized.ts`).

## 3. AS TELAS

`/dre`: o plano de linhas (criar, arquivar, devolver, ordenar), o demonstrativo
por mês (receita, custos, despesas) e o resultado calculado. Porta própria,
mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`line.manage` (desenhar o plano) e `statement.read` (ler o demonstrativo sem
alterar o plano).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| DRE FISCAL (SPED/ECD/ECF) | ofício do contador — **Lei 3**, integração declarada |
| Plano de contas contábil | idem — o plano aqui é gerencial e do tenant |
| Apuração de tributos (IRPJ, CSLL…) | fiscal — integração (Lei 3) |
| Regime de competência contábil (provisões, apropriações) | a competência aqui é a data do lançamento; apropriação é ofício contábil |
| Exclusividade de fonte (anti-dupla-contagem automática) | regra que ninguém desenhou (a lição do `cash §5`); o plano do tenant decide |
| DRE por centro de custo | leitura cruzada futura — o `cc` já projeta pela origem |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sete.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `dre` (`0047_dre.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §20) |
| Pacote `@alsham/dre` (ciclo, resultado, consumidor de dois produtores, validações) | ✅ construído, com testes |
| Consumidor `cash.entry.registered` + `cc.rateio.executed` (`realized.ts` + composição + adaptador) | ✅ CONSTRUÍDO — padrão E10, dois produtores |
| Seed (32º cartão, `consumes` com dois tipos) | ✅ CONSTRUÍDO |
| Teste SQL (`37_dre_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/dre` (plano, demonstrativo, resultado) | ✅ CONSTRUÍDO |
| DRE fiscal · plano de contas · tributos · competência contábil | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0047_dre.sql` (quinto e último da Missão Sete).
2. Reaplicar o seed — o 32º cartão entra.
3. ⚠️ **Expor o schema `dre` na Data API.**
4. ⚠️⚠️ **REDEPLOYAR o `apps/api`** — as inscrições da projeção
   (`cash.*` e `cc.*` → `dre.record_external_entry`) só existem no build novo.
   Sem isso o demonstrativo nasce sempre vazio, sem erro que diga o motivo.
5. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
