# packages/auth

**Propósito:** identidade e sessão — login, cadastro, recuperação, MFA, tokens, service-role. Fronteira de entrada de todo tenant.

**Fase do roadmap:** Fase 1 — Core.

**De onde será minerado:** **padrão Peritus** — a régua de segurança do império, auditada como referência, com auth pronta e RLS completa (Balanço de Tecnologia: **PROVADO**). Reforço do padrão service-role + `stripe_events` do alsham-forensic-ai (**PROVADO**, RLS em todas as tabelas).

**Anti-referência declarada:** suna-core, com RLS aberta (P0 conhecido). Todo banco deste pacote nasce com RLS ligada e policies reais.

**Status:** NÃO INICIADO.
