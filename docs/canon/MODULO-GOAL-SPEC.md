# 📊 MÓDULO 23 — METAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `bi`

> Leitura obrigatória para quem for mexer no schema `goal` ou no pacote
> `@alsham/goals`.
>
> **Leia junto com [MODULO-PAT-SPEC](MODULO-PAT-SPEC.md)** — o livro por
> seq e o vigente calculado que aqui são re-perguntados para a AMBIÇÃO — e
> com [MODULO-CTR-SPEC](MODULO-CTR-SPEC.md), o pai do padrão "vigente
> nunca é coluna".
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `goal`.** Curto, greppável (`meta` colidiria com o
vocabulário de HTML/build e com a empresa homônima). Grep com fronteira de
palavra: zero colisões.

**`domain_key` = `bi` — e os HOMÔNIMOS declarados.** "Metas" existe em
três lugares da Taxonomia. O bloco do 📊 BI (Dashboards · KPIs ·
Indicadores · METAS · Relatórios) é o da LEITURA do negócio — e este
módulo é a peça de ESCRITA desse bloco: o alvo declarado e o livro de
check-ins; o painel lê. A *Metas* do CRM é o recorte comercial (uma meta
com métrica "vendas" — nenhuma coluna a mais); os *OKRs* do RH são a
cascata de gente — ofício próprio, FUTURO declarado (§5). Há teste que
ancora os três lugares.

**⭐ O PROGRESSO É O ÚLTIMO CHECK-IN — calculado, nunca coluna.** O termo
vigente do ctr e o lugar do pat, re-perguntados para a ambição: view
`goal.goal_progress` (security_invoker), livro ordenado por `seq` identity
(a lição do pat). Placar editável não constrange ninguém.

**⭐ O SISTEMA NÃO MEDE NADA SOZINHO.** Quem reporta é GENTE — medir
automático seria consumir eventos que esta onda não constrói (Lei 7).
`consumes` VAZIO.

**⭐ O CICLO:** `draft → active → achieved | missed | cancelled` (e
`draft → cancelled`). Em DRAFT edita-se tudo; **ATIVAR CONGELA alvo,
métrica e período** — mover a trave no meio do jogo desmoraliza o placar
(descrição e dono seguem vivos). **achieved/missed é DECISÃO DE GENTE**
carimbada: o alvo informa, o dono decide (a métrica é texto livre — só o
dono sabe se "faturamento" com imposto conta); **exige ≥1 check-in** —
fechar sem número na mesa é achismo. Cancelar exige razão. **Os três fins
são TERMINAIS**: a identidade da meta é o PERÍODO + o alvo declarado — a
meta do trimestre que vem é meta NOVA; reabrir misturaria épocas do placar.

**⭐ Alvo OPCIONAL, moeda junto quando é dinheiro** (moeda declarada exige
valor); a unidade mora na MÉTRICA (texto livre). **Sem percentual mágico**:
sem direção declarada, % é número decorativo — o pacote mostra último ×
alvo e o dono lê.

---

## 1. AS PEÇAS

- `goal.goals`: a ambição — título, métrica texto livre, alvo opcional
  (+moeda junto), período, dono via `core.memberships`, desfecho carimbado.
- `goal.checkins`: o livro do andamento — valor + nota + carimbo do
  servidor; `seq` identity; imutável em 3 camadas; só em meta ATIVA.
- `goal.goal_progress`: view com `security_invoker` — o último check-in e
  a contagem, calculados.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `goal.goal.opened` | a ambição foi declarada (rascunho) |
| `goal.goal.activated` | passou a correr — a trave congelou |
| `goal.goal.updated` | mudou no que segue vivo |
| `goal.goal.reported` | um check-in entrou no livro |
| `goal.goal.achieved` / `missed` | a época fechou — decisão de gente. Terminal |
| `goal.goal.cancelled` | desistida, com razão. Terminal |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/metas`: o quadro na ordem da urgência (`orderGoals()`), declarar meta,
ativar (congelando a trave), check-in com valor e nota, fechar a época em
dois passos (batida/perdida — com o aviso do achismo), cancelar com razão.
Porta própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`manage` (declarar, editar rascunho, ativar), `report` (o número na mesa)
e `decide` (fechar a época). Quem declara a ambição não é quem reporta o
número, nem quem fecha a época.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Cascata/árvore de OKR | ofício do RH (a Taxonomia lista *OKRs* lá) — quando vier, é módulo próprio; a meta não vira nó de árvore em silêncio |
| Medição automática (consumir cash/dre/deal) | **Lei 7** — seria handler sem construção; quem reporta é gente. Quando um consumo nascer, virá com handler completo + composição + teste triangular |
| Percentual mágico de progresso | sem direção declarada (piso × teto), % é decorativo — e direção é desenho que nenhum tenant pediu ainda |
| Vínculo meta → NPS/pesquisa | ponte por ID SOLTO quando o tenant precisar — declarada, sem coluna até haver ofício |
| Alerta de meta vencendo | *Notificações* é capacidade do Core, não construída |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sexta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `goal` (`0038_goal.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §19) |
| Pacote `@alsham/goals` (ciclo, progresso, validação) | ✅ construído, com testes |
| Seed (23º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`28_goal_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/metas` (quadro, check-in, fechar a época) | ✅ CONSTRUÍDO |
| Cascata OKR · medição automática · % · alertas | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0038_goal.sql` (depois do `0037`).
2. Reaplicar o seed — o 23º cartão entra.
3. ⚠️ **Expor o schema `goal` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
