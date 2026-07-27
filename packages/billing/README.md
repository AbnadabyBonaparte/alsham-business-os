# packages/billing

**Propósito:** assinatura, cobrança, planos, limites e medição de consumo. Quem paga o quê, e o que o tenant pode usar por isso.

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** **padrão `packages/billing` do casa-bonaparte-saas** — motor Stripe multi-secret, webhook idempotente por `event.id`, reentregador com backoff, cofre de segredos em cascata (Balanço de Tecnologia: **PROVADO ponta a ponta**, com HMAC real, entrega, idempotência e rede de segurança sobre falha real). Cobrança por uso: `usage_ledger` + `plan_limits` do kraken-v2 (**PROVADO**, com economia unitária calculada). Auditoria de eventos: `stripe_events` do alsham-forensic-ai (**PROVADO**).

**Status:** NÃO INICIADO.
