# packages/workflow · `@alsham/workflow`

**O correio do Core** — o entregador da caixa de saída de eventos.

**Fase do roadmap:** Fase 1 — Core.

**Status:** ✅ **CONSTRUÍDO** — lógica de entrega, reentrega com backoff, idempotência e consumidor de trilha. 15 testes.

---

## Por que ele existe

Sem o correio, **todo evento que qualquer módulo emite fica preso em `pending` para sempre**, e o "Lego que conversa por eventos" não conversa. Esta é a peça que fecha o ciclo do [`CORE-SPEC §3`](../../docs/canon/CORE-SPEC.md), passo 5 — e que a Etapa 5 apontou como a que mais faltava.

## É ENGINE, não módulo

Taxonomia §4: serviço compartilhado da plataforma. **Não aparece na Store, não se vende, não tem tenant dono.** Serve todos os módulos e não conhece nenhum — entrega envelope, não lê carta.

Vive aqui porque o propósito deste pacote já estava escrito desde a Etapa 0: *"o motor de fluxo e de fila — jobs, estados, agendamento, reentrega"*, minerado do `pg_cron` + `pg_net` do `casa-bonaparte-saas` (Balanço: **PROVADO**) e do pipeline de jobs com estados do kraken-v2.

## Zero I/O

Persistência, relógio, destino e política de reentrega entram por `CourierDeps`. A lógica não abre conexão, não lê a hora e não chama rede — é o que a torna testável sem banco, e é a Regra de Ouro aplicada a uma engine.

⛔ **Quem implementa `OutboxStore` roda com `service_role`.** `core.event_outbox` e `core.processed_events` não têm GRANT nem policy para `authenticated`. O correio é infraestrutura de servidor e **nunca** deve ser instanciado num app cliente.

---

## As duas garantias

### Idempotência — o mesmo evento, o efeito uma vez

O correio grava em `processed_events` **antes** de chamar o handler. Se o evento voltar — reentrega, retry, replay — o `unique (event_id, consumer)` recusa e o handler não é chamado de novo.

**É por consumidor, não por evento.** Chave só em `event_id` faria o segundo consumidor achar que já foi tratado, e perder o fato em silêncio.

### Backoff — insiste, e desiste sem apagar

Falhou: `attempts` sobe, `next_attempt_at` afasta em curva exponencial com teto, `last_error` fica gravado. Esgotou as tentativas: vira `dead` — **e a linha continua na caixa, com o erro**, para conferência humana. Perder evento em silêncio é a falha que a caixa de saída existe para impedir; desistir e apagar seria recriá-la.

A política (`baseDelayMs`, `maxDelayMs`, `maxAttempts`) vem de fora. Uma plataforma que fixa isso no código obriga um deploy para mudar de ideia. Os números do `DEFAULT_RETRY_POLICY` são ponto de partida — **NÃO VERIFICADOS** contra carga real (Lei 7).

---

## Como se liga à cobrança

O correio **não conhece billing**. Ele chama um gancho opcional `onDelivered`; quem liga um no outro é a composição:

```ts
await deliverDue({
  store, subscriptions, policy,
  now: () => new Date(),
  onDelivered: eventUsageHook(recorder, () => new Date()),  // de @alsham/billing
});
```

Se billing sumir amanhã, o correio continua entregando.

---

## Como rodar (as duas opções)

Ver [`docs/runbook/APLICAR.md`](../../docs/runbook/APLICAR.md) §6. Em resumo: **pg_cron dentro do Supabase** (o padrão da Casa, sem servidor a manter) ou **endpoint protegido** chamado por um agendador externo. A lógica é a mesma; muda só quem a aciona.

**Nenhuma das duas está montada em produção** — a lógica existe e é testada; a ligação é ato do dono.

## Testes

```bash
pnpm test    # da raiz
```

Provam: idempotência por consumidor, registro antes da ação, curva de backoff com teto, `dead` sem apagar, evento futuro não é pego, evento sem consumidor não fica batendo, e a ligação com a cobrança.
