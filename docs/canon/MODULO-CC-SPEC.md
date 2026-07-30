# 💰 MÓDULO 28 — CENTROS DE CUSTO & RATEIO

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `cc` ou no pacote
> `@alsham/cost-centers`.
>
> **Leia junto com [MODULO-CASH-SPEC](MODULO-CASH-SPEC.md)** — a mesma casa
> financeira, a categoria como dado do tenant — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), o argumento da volta do arquivo.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `cc`.** Abreviação consagrada de "centro de custo",
greppável com fronteira, zero colisões na frota (Q5–Q6 conferidas).

**`domain_key` = `finance`.** A Taxonomia §5 põe *Centro de custo* e
*Rateio* na linha do 💰 Financeiro — a casa do `cash`.

**⭐ O CENTRO É DADO DO TENANT — e volta do arquivo.** Nome livre,
ativa↔arquivada. JAMAIS um plano de centros semeado ("administrativo/
comercial/produção" é o organograma de UMA casa; uma construtora rateia
por obra, uma agência por cliente). `archived → active` EXISTE (o
argumento do crm/cash): o centro reorganizado é o MESMO centro, e partir
a série histórica em dois mentiria em todo relatório que soma o antes e o
depois.

**⭐ A REGRA FECHA 100% — e isso é FÍSICA.** A regra é DESENHO do tenant
(quais centros, que percentuais). Mas uma regra ATIVA que não soma 100%
distribui 83% de um custo e perde 17% no nada — e um custo que evapora
mente no número de TODO centro. Por isso: o RASCUNHO desenha incompleto à
vontade; ATIVAR exige a soma exata de **10000 pontos-base (100,00%)**.
Constraint por gatilho, com o porquê escrito no arquivo. E a regra ativa
CONGELA o desenho: mexer nas linhas de uma regra que já rateou
reescreveria o passado.

**⭐ EXECUTAR É ATO DE GENTE — sem cron.** Não há relógio que rateia
sozinho. `cc.execute_rateio()` é disparada por gente, gera lançamentos
IMUTÁVEIS (um por centro), com competência e ORIGEM por **ID SOLTO + nome
carimbado**. Corrigir é EXECUTAR DE NOVO com razão — as duas execuções
ficam no livro. ⭐ **O resto da divisão vai ao último centro**: cent
nenhum se perde — a mesma física do 100%.

**⚠️ GENÉRICO POR LEI.** Zero vocabulário de vertical no schema. O Fundo
de Promoção da Vertical (Q6 · `fund`) vai se PENDURAR aqui pela origem
(id solto + nome), como o `mnt` deixou a ponte para o `pat`. Nenhuma FK
cruzada nasce para um módulo que não existe.

---

## 1. AS PEÇAS

- `cc.centers`: os centros — dado do tenant, volta do arquivo.
- `cc.rules` + `cc.rule_lines`: as regras de rateio — desenho do tenant,
  fecham 100% ao ativar, congelam depois.
- `cc.executions` + `cc.allocations`: o LIVRO de rateio — imutável,
  escrito só por `cc.execute_rateio()`.
- `cc.by_center`: o rateado acumulado por centro — view calculada.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `cc.center.registered` | um centro entrou no cadastro |
| `cc.center.archived` | um centro saiu de uso — a história fica |
| `cc.rule.activated` | uma regra fechou 100% e passou a ratear |
| `cc.rateio.executed` | um rateio rodou — o total e a origem no envelope |

`consumes` **VAZIO** e honesto (Lei 7): quem executa é gente. Rateio por
consumo é capacidade futura declarada — exigiria a regra de exclusividade
de fonte que ninguém desenhou (a lição do `cash`).

## 3. AS TELAS

`/centros-de-custo`: os centros (cadastrar, arquivar, devolver), as
regras (desenhar linhas, ativar com o aviso do 100%, arquivar), executar
um rateio (com a prévia calculada) e o rateado por centro. Porta própria,
mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`center.manage` (os centros), `rule.design` (as regras) e
`rateio.execute` (a execução). Quem desenha a regra não é
necessariamente quem a dispara sobre o dinheiro.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Rateio por relógio (automático) | cron fingido — quem rateia é gente; quando houver agenda, é o correio do Core |
| Rateio por consumo de evento | exigiria a regra de exclusividade de fonte + idempotência que o `cash` §5 declarou não existir — dupla contagem sem ela |
| Integração contábil (débito/crédito, plano de contas) | ofício do contador — **Lei 3**, integração declarada |
| Custeio ABC (direcionadores de atividade) | capacidade futura — o rateio de hoje é por percentual fixo |
| Fundo de Promoção da Vertical | Q6 · `fund` pendura-se aqui pela origem (id solto) quando nascer — a ponte já está aberta, sem FK |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sete.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `cc` (`0043_cc.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §20) |
| Pacote `@alsham/cost-centers` (ciclos, física do 100%, matemática do rateio) | ✅ construído, com testes |
| Seed (28º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`33_cc_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/centros-de-custo` (centros, regras, execução, por centro) | ✅ CONSTRUÍDO |
| Rateio automático · consumo · contábil · ABC | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0043_cc.sql` (primeiro da Missão Sete).
2. Reaplicar o seed — o 28º cartão entra.
3. ⚠️ **Expor o schema `cc` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
