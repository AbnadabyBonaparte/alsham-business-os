# packages/core

**Propósito:** a fundação. Barramento de eventos, registro de módulos, contexto de tenant, contratos que todo módulo obedece. Nunca muda de forma; tudo depende dele. **Nenhum Domain nasce antes do Core** (Taxonomia §3, regra 7).

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** obra de **montagem e padronização, não de invenção** — o Balanço de Tecnologia registra ~12 das ~15 peças da Fase 1 com peça existente na casa. O Core unifica quatro padrões provados num schema só: tenancy/planos/consumo (kraken-v2), billing/cofre/idempotência (casa-bonaparte), auditoria (peritus), e o rascunho RBAC+Engines da pedreira alsham-core — **minerar o schema, jamais reutilizar o banco** (lição paga nº2).

**Status:** NÃO INICIADO.
