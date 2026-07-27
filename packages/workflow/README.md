# packages/workflow

**Propósito:** o motor de fluxo e de fila — jobs, estados, agendamento, reentrega, aprovações e automações que qualquer módulo dispara.

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** `pg_cron` + `pg_net` com job de reentrega por minuto de `casa-bonaparte-saas` e o pipeline de jobs com estados do kraken-v2 (Balanço de Tecnologia: **PROVADO nos dois**). Complemento minerável: `automation_rules` + `automation_executions` da pedreira alsham-core.

**Lição paga a respeitar:** cron que grava para sempre vira ruído caro — todo job nasce com política de retenção (ver `system_health_log`, Balanço Supabase §1).

**Status:** NÃO INICIADO.
