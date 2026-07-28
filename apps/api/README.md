# apps/api · `@alsham/api`

**A COMPOSIÇÃO DO CORE** — o único lugar do repositório onde os módulos se conhecem.

**Fase do roadmap:** Fase 1 — Core. Item "APIs & Eventos".

**Status:** ✅ **CONSTRUÍDO** — persistência real do correio, composição, endpoint protegido e saúde da fila. 25 testes, os do store contra **Postgres de verdade**.
⚠️ **Construído ≠ no ar.** Nada está agendado; ligar é ato do dono ([runbook §6](../../docs/runbook/APLICAR.md)).

---

## ⛔ Antes de tudo: este app roda com a chave-mãe

`DATABASE_URL` aqui é a conexão **com privilégio de serviço**. Ela ignora toda a RLS: quem a tem enxerga todos os tenants.

**Este app NÃO vai junto com o `apps/portal`.** O painel do cliente fala com o banco pela chave publicável, sob RLS. Juntar os dois deploys põe a chave-mãe do lado onde um bug em qualquer server component a alcança.

Há guarda no CI sobre essa fronteira: o portal não pode importar este pacote, nem um driver de Postgres, nem ler `DATABASE_URL`/`COURIER_SECRET`.

## O mapa das dependências

```
  @alsham/workflow  ──┐  (o correio — não conhece módulo nenhum)
  @alsham/marketing ──┤
  @alsham/billing   ──┼──►  apps/api  ──►  Postgres
  @alsham/core      ──┘
```

**As setas só apontam para cá.** Não há nenhuma entre os pacotes, e há guarda no CI que reprova a primeira que aparecer. É a diferença entre uma plataforma modular e um monólito com pastas: o acoplamento existe, mas num lugar só, declarado e revisável.

## Por que a persistência mora aqui, e não em `packages/`

A Regra de Ouro manda **regra de negócio** para `packages/`. `createPgOutboxStore` não é regra de negócio: é **I/O**. Não escolhe quem recebe, não calcula backoff, não julga se já processou — tudo isso é `deliverDue()`, que continua puro em `@alsham/workflow`.

Teste de bolso do canon: *se eu apagar `apps/` inteiro, perco alguma regra de negócio?* **Não.** Perco a ligação com o Postgres, que se reescreve contra outro banco sem tocar na lógica de entrega.

## As duas coisas que só o banco revelou

Os testes deste app existem porque memória não prova concorrência. Contra Postgres apareceram dois defeitos que o mock não podia mostrar:

**1. A tomada não reivindicava nada.** `for update skip locked` só vale enquanto a transação está aberta — microssegundos. Sem mudar a linha, o próximo worker pegava os mesmos eventos. Dois `claimDue` simultâneos levaram **os mesmos 20**. A correção é o **arrendamento**: a tomada empurra `next_attempt_at` para frente; quem chega depois vê um evento que ainda não venceu. Se o processo morrer no meio, o prazo expira e o evento volta sozinho.

**2. Um handler que falhava nunca era reexecutado.** O correio gravava em `processed_events` antes de agir e não desfazia ao falhar — então a reentrega via "já processado" e marcava o evento como `delivered`. Três rodadas, handler chamado **uma** vez, evento gravado como entregue. Corrigido em `@alsham/workflow` com `unmarkProcessed`.

## Arrendamento ≠ `SKIP LOCKED`

Vale a distinção, porque é fácil creditar a coisa errada: **o arrendamento dá a correção; o `skip locked` dá a fluidez.** Ao sabotar a consulta removendo o `skip locked`, os testes continuaram verdes — o Postgres re-avalia o `where` depois do commit concorrente e devolve zero. O que o `skip locked` impede é o segundo worker **ficar bloqueado** atrás do primeiro, e isso só se prova medindo bloqueio. Há um teste que faz exatamente isso.

## Como rodar

```bash
cp .env.example .env    # e preencha
pnpm --filter @alsham/api start
```

Duas rotas, as duas exigindo o segredo no cabeçalho `x-correio-secret`:

| Rota | O que faz |
|---|---|
| `POST /correio/entregar` | roda uma rodada e devolve o relatório |
| `GET /correio/saude` | a fila: pending, delivered, failed, dead, e há quanto tempo o mais antigo espera |

A rota de saúde **também** exige segredo: contagem de evento por tenant é informação de operação.

## Testes

```bash
DATABASE_URL=postgresql://... pnpm test:api
```

Sem `DATABASE_URL` os testes do store se **pulam** — nunca fingem passar. No CI a variável existe e há guarda que reprova se algum for pulado.

## O que NÃO existe

| Peça | Estado |
|---|---|
| Agendamento em produção | **NÃO LIGADO** — o `0005` traz o `cron.schedule` comentado; ligar é ato do dono |
| Alarme de fila parada | **NÃO CONSTRUÍDO** — a saúde é consulta, não notificação |
| Superfície pública de API dos módulos | **NÃO CONSTRUÍDA** — hoje este app só serve o correio |
| Autenticação por `api_keys` | **NÃO CONSTRUÍDA** — um segredo compartilhado, e só |
