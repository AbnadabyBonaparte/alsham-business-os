# packages/permissions

**Propósito:** RBAC — papéis, políticas, escopos e a checagem de permissão que todo módulo consulta. Cada módulo declara as próprias permissões; a decisão é sempre aqui.

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** `user_roles` + `org_policies` da pedreira alsham-core (minerar schema, nunca o banco) casados com o padrão de RLS do **Peritus/Forensic** (Balanço de Tecnologia: **PROVADO**). RLS não é alternativa à autorização de aplicação — as duas camadas coexistem.

**Status:** NÃO INICIADO.
