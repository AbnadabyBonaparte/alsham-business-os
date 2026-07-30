# 💰 MÓDULO 29 — ORÇAMENTOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `bud` ou no pacote
> `@alsham/budgets`.
>
> **Leia junto com [MODULO-GOAL-SPEC](MODULO-GOAL-SPEC.md)** — a física da
> trave que congela na ativação, aqui re-perguntada para o dinheiro — e com
> [MODULO-CASH-SPEC](MODULO-CASH-SPEC.md), o livro de onde o realizado é
> calculado.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `bud`.** Abreviação de *budget*, greppável com fronteira,
zero colisões na frota (Q5–Q6 conferidas). ⚠️ **"Orçamento" tem dois
donos:** a proposta comercial (`quote`, capacidade *Orçamentos* do CRM) e
o teto de gasto por período (este). Sol Único: o id curto não disputa a
palavra.

**`domain_key` = `finance`.** A Taxonomia §5 põe *Orçamento* na linha do
💰 Financeiro — a casa do `cash`.

**⭐ ATIVAR CONGELA A TRAVE — a física do `goal` no DINHEIRO (MANTIDO
assinado).** O orçamento nasce no rascunho (edita-se à vontade). ATIVAR
carimba e CONGELA a trave: categoria, período e teto. Mover o teto no meio
do período desmoraliza o controle — um orçamento que se ajusta ao gasto
não controla nada. É o MANTIDO consciente do `goal` (a meta congela o alvo
ao ativar): dinheiro e ambição partilham a verdade "a régua não se move no
meio do jogo". Há teste de contraste goal×bud que lê as DUAS migrations e
assina a decisão. **O nome segue editável** — gente renomeia. Período
fechado é **TERMINAL** — o que vem é orçamento novo.

**⭐ O REALIZADO É CALCULADO, NUNCA COLUNA — e vem do LIVRO do `cash`.** O
gasto realizado NÃO se digita e NÃO é coluna. É a SOMA dos lançamentos do
Fluxo de Caixa (desembolso) que casam a categoria, o período e a moeda do
orçamento — projetados localmente por evento. O saldo (teto − realizado)
é VIEW (`bud.budget_realized`, `security_invoker`). Coluna de realizado é
coluna que alguém edita; o CI barra qualquer uma.

**⭐⭐ `consumes` NÃO É VAZIO — e o handler EXISTE (Lei 7 do jeito
certo).** O módulo escuta `cash.entry.registered` — o quinto consumidor do
repositório (recon, marketing, ar, dun, e agora bud), o padrão E10. O
tradutor (`realized.ts`) lê a origem de `envelope.producedBy` (nunca
chumbada — um segundo produtor do mesmo formato grava a origem DELE), e a
projeção grava só por `bud.record_external_movement()` (service_role, pela
composição do `apps/api`). **Não importa o `cashflow`, não lê o schema
dele, não cita o nome de quem emite** — o acoplamento é com o TIPO DO
EVENTO (guarda "módulo não conhece módulo" no CI). ⚠️ **Esta onda EXIGE
redeploy do `apps/api`** no apply — a inscrição da projeção só existe no
build novo (runbook §20, em vermelho).

**⭐ Lançamento SEM categoria é IGNORADO, não erro.** O orçamento casa por
categoria; um gasto sem categoria não se atribui a nenhum. Ignorar sem
encher dead letter é a decisão — a categoria é O dado (a lição do `cash`,
onde a categoria é texto livre e opcional).

---

## 1. AS PEÇAS

- `bud.budgets`: os orçamentos — teto por categoria e período; nascem
  rascunho, a trave congela na ativação, o período fecha terminal.
- `bud.realized_movements`: a PROJEÇÃO do livro do cash — escrita só por
  `bud.record_external_movement()`; o cliente lê.
- `bud.budget_realized`: o realizado e o saldo — view calculada
  (`security_invoker`), jamais coluna.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `bud.budget.opened` | um orçamento nasceu no rascunho |
| `bud.budget.activated` | foi ativado — a trave congelou |
| `bud.budget.closed` | o período foi fechado — terminal |

`consumes` **NÃO VAZIO**: `cash.entry.registered` — com handler construído
(`realized.ts`). A Lei 7 nos dois sentidos: o consumo declarado é
exatamente o que o handler cobre (teste assina), e nenhum consumo se
declara sem handler.

## 3. AS TELAS

`/orcamentos`: os orçamentos (criar rascunho, ativar com o aviso de que a
trave congela, fechar o período), o realizado e o saldo por orçamento
(barra de consumo, estouro honesto). Porta própria, mock honesto, menu por
permissão.

## 4. AS PERMISSÕES

`budget.manage` (criar, editar, ativar) e `budget.close` (fechar o
período — decisão terminal). Quem desenha e ativa a trave não é,
necessariamente, quem encerra o período.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Orçamento de RECEITA (teto de entrada) | leitura futura — hoje o realizado soma o desembolso; a receita orçada é o espelho, declarado |
| Orçamento por CENTRO de custo | pendura-se no `cc` (Módulo 28) pela categoria/origem quando houver a leitura cruzada — sem FK cruzada |
| Rolagem automática de período | cron fingido — o próximo período é orçamento novo, aberto por gente; quando houver agenda, é o correio do Core |
| Alerta de estouro (notificação) | *Notificações* é capacidade do Core (NÃO INICIADA); a tela mostra, o correio não avisa ainda |
| Previsão / forecast | previsão é achismo até virar meta; Lei 7 |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sete.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `bud` (`0044_bud.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §20) |
| Pacote `@alsham/budgets` (ciclo, trave congelada, saldo calculado, consumidor cash) | ✅ construído, com testes |
| Consumidor `cash.entry.registered` (`realized.ts` + composição + adaptador) | ✅ CONSTRUÍDO — padrão E10 |
| Seed (29º cartão, `consumes` não-vazio) | ✅ CONSTRUÍDO |
| Teste SQL (`34_bud_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/orcamentos` (orçamentos, realizado, saldo) | ✅ CONSTRUÍDO |
| Receita orçada · por centro · rolagem · alerta · forecast | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0044_bud.sql` (segundo da Missão Sete).
2. Reaplicar o seed — o 29º cartão entra.
3. ⚠️ **Expor o schema `bud` na Data API.**
4. ⚠️⚠️ **REDEPLOYAR o `apps/api`** — a inscrição da projeção
   (`cash.entry.registered` → `bud.record_external_movement`) só existe no
   build novo. Sem isso o realizado nasce sempre zero, sem erro que diga o
   motivo.
5. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
