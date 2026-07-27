# packages/organizations

**Propósito:** multi-tenant e multiempresa — organizações, times, membros, convites, hierarquia e o `tenant_id` que atravessa toda query da plataforma.

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** **esqueleto kraken-v2** — `workspaces` + `workspace_members` + `platform_admins` + `invite_codes`/`invite_redemptions`, a cadeia tenant→membro→plano completa e em produção (Balanço Supabase: **a peça mais próxima do Core que o império possui**). Complemento: `organizations`/`user_organizations`/`teams` da pedreira alsham-core (minerar schema, nunca o banco) e a hierarquia `tenant_id` + tabela `domains` da Carta Magna.

**Status:** NÃO INICIADO.
