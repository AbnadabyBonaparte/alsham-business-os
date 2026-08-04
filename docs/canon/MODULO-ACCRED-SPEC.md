# 🎪 MÓDULO 94 — CREDENCIAMENTO & CHECK-IN

## ALSHAM Business OS™ · Especificação do módulo · Vertical `events`

> Leitura obrigatória para quem for mexer no schema `accred` ou no pacote
> `@alsham/accred`.
>
> **Leia junto com [MODULO-TRAIN-SPEC](MODULO-TRAIN-SPEC.md)** — a física do
> cadastro → presença que este módulo re-pergunta — e com
> [MODULO-VIS-SPEC](MODULO-VIS-SPEC.md), o evento de presença carimbado pelo
> servidor e imutável cuja física o check-in herda. Ver também
> [ONDA-EVENTOS-DECISOES](ONDA-EVENTOS-DECISOES.md) (capacidades #2 e #7).
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `accred`.** Curto, greppável, sem colisão (grep com fronteira
de palavra: zero). `credential`/`checkin` são vocabulário comum demais para
virar prefixo de módulo; `accred` é único.

**`vertical_key` = `events` — a `VerticalKey` do `@alsham/core`.** O evento
UNIVERSAL (a feira, o workshop que QUALQUER empresa organiza) é o `evt`
(Módulo 11, Domain Marketing). O CREDENCIAMENTO é o OFÍCIO de quem vive de
evento — e o `evt` DE PROPÓSITO o rejeita no schema dele (há teste no `evt`
que reprova ingresso/credenciamento/line-up). *A peça universal desce para o
Domain; a vertical fica só com o ofício* (Taxonomia §1).

**⭐⭐ UM SCHEMA, DUAS CAPACIDADES — o ciclo credencial → presença.** É a
física do `train` (Módulo 35) re-perguntada para o portão de um evento: lá o
par é inscrição → presença; aqui é CREDENCIAL → CHECK-IN. A credencial é o
cadastro (emitida, revogável); o check-in é o ato (imutável). Como o `train`
funde programa/turma/inscrição num schema só, este funde credenciamento e
check-in — são o mesmo ciclo, e separá-los em dois módulos partiria uma peça
em duas metades que não vivem uma sem a outra.

**⭐ O DIVERGE assinado do `train`: a credencial tem ciclo; a chegada é
terminal.** No `train` a inscrição vai ALÉM da presença (`attended →
completed` — o aproveitamento). Aqui NÃO: o check-in é o EVENTO DE PRESENÇA do
`vis` — a passagem pelo portão, um fato sem sequência. Quem volta amanhã faz
OUTRO check-in; não existe "concluir o check-in". Quem tem ciclo é a
CREDENCIAL — mas `active ↔ revoked` (a física do `catalog`/`vendor`, com os
nomes do domínio), não a máquina de estados do evento.

**⭐ O PORTÃO só deixa passar credencial ATIVA.** O check-in é validado contra
a credencial no ato (a física do gate do `train`: só turma publicada recebe
inscrição). Credencial revogada não passa — a recusa chega com nome, não com
erro de constraint.

**⭐ O CARIMBO É DO SERVIDOR, e o check-in é IMUTÁVEL.** `checked_in_at`=now(),
`checked_in_by`=auth.uid() no ATO — a hora e o autor que o cliente mandar são
descartados. Depois de inserido, nem o dono do banco reescreve o check-in (a
física do `vis`/`fisc`/`occ`, em duas camadas: cliente sem porta de UPDATE/
DELETE, gatilho que recusa até para o dono). Corrigir é registrar OUTRO
check-in.

**⭐ O EVENTO É ID SOLTO.** `event_id` aponta o evento do `evt` sem FK cruzada
e sem ler o schema alheio (a Lei do Lego). A única FK é INTRA-schema
(check-in → credencial).

**⚠️ CHECK-OUT FORA nesta onda — decisão, não esquecimento.** O `vis` modela
entrada E saída porque a permanência importa (uma pessoa dentro do prédio). No
portão de um evento, a chegada é o fato que se vende (lotação, comparecimento,
fluxo); a saída não tem valor próprio aqui, e um par entrada/saída pediria
carimbo, coerência de estado e uma máquina que o ato pontual imutável não
precisa. Um único check-in basta; se um dia a reentrada importar, é OUTRO
check-in.

---

## 1. AS PEÇAS

- `accred.credentials`: a credencial emitida para um evento — `event_id` (id
  solto ao `evt`), portador (obrigatório), tipo de credencial (obrigatório,
  texto livre), nível de acesso (opcional, texto livre), ciclo `active ↔
  revoked`, `created_by` carimbado pelo servidor. Nasce ativa; transição
  guardada; revogar/reativar exige `accred.credential.manage`.
- `accred.checkins`: a chegada — FK INTRA-schema à credencial `(credential_id,
  tenant_id)`, os dois carimbos do servidor (`checked_in_at`/`checked_in_by`),
  nota opcional. SEM coluna de status, SEM ciclo. Imutável em duas camadas.
- `@alsham/accred`: o motor puro — `ALLOWED_TRANSITIONS` (espelho do SQL),
  `whyCannotCheckIn`, validação de credencial/check-in, resumos.

---

## 2. O CICLO

- **Credencial:** `active ↔ revoked`. Nasce `active`. Emitir exige
  `accred.credential.manage`; revogar/reativar também. Um evento de fato
  emitido no INSERT (`accred.credential.registered`) — as transições de status
  NÃO emitem fato (a régua do `fisc`: o roster conta só o nascimento).
- **Check-in:** ato pontual, sem ciclo. Insere-se contra credencial ativa,
  carimbado pelo servidor; emite `accred.checkin.recorded`. Não se edita nem
  se apaga.

---

## 3. AS PERMISSÕES

- `accred.credential.manage` — emitir, editar e revogar/reativar credenciais.
- `accred.checkin.record` — registrar a chegada no portão.

Física ASSIMÉTRICA de propósito: quem opera o portão (`checkin.record`) não
emite nem bloqueia crachá; quem emite credencial (`credential.manage`) não
precisa estar no portão. O `can_access` (leitura) é a união das duas.

---

## 4. OS EVENTOS

- `accred.credential.registered` (v1) — uma credencial foi emitida.
- `accred.checkin.recorded` (v1) — uma chegada foi registrada no portão.

`consumes` **VAZIO** (Lei 7): nenhum handler nesta onda — sem redeploy do
`apps/api`.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Ingressos / venda / pagamento | ⛔ **fora (Lei 3 + `canta-siriema`)** — venda de ingresso é pagamento + obrigação fiscal; o `canta-siriema` já é o produto de bilheteria+PIX do império |
| Afiliados de evento | ⛔ **fora (`canta-siriema`)** — revenda por comissão é amarrada à bilheteria, que é FORA |
| QR / crachá / impressão / catraca | integração declarada — hardware/terceiro (Lei 3) |
| Check-out / reentrada | declarado FORA nesta onda — o check-in único basta; a saída é OUTRO check-in se um dia importar |
| Programação/line-up · Patrocínios | módulos-irmãos da mesma onda (`lineup`, `sponsor`) — não moram aqui |
| Pós-evento (pesquisa de satisfação) | é o `nps` (Módulo 27), por id solto |
| Fornecedores de evento | é o `vendor` (Módulo 43), por id solto |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 04/08/2026, na Onda Eventos.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `accred` (`0109_accred.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono |
| Pacote `@alsham/accred` (ciclo, portão, validação) | ✅ construído, com testes |
| Seed (94º cartão) | ⏳ o PARENT wire (seed + store-taxonomy + menu) |
| Teste SQL (`99_accred_isolation.sql`) + ligação no CI | ✅ CONSTRUÍDO (o CI wire é do PARENT) |
| Portal `/credenciamento` | ⏳ o PARENT cria o stub |
| Ingressos · afiliados · QR/crachá · check-out | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

⚠️ Ao aplicar: **expor o schema `accred` na Data API**. Nenhum consome evento.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
