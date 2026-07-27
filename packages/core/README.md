# packages/core · `@alsham/core`

**Propósito:** **o contrato do Lego** — os tipos que todo módulo do Business OS obedece. Barramento de eventos, tenancy, RBAC, registro de módulos e trilha de auditoria, expressos como contrato. Nunca muda de forma; tudo depende dele. **Nenhum Domain nasce antes do Core** (Taxonomia §3, regra 7).

**Fase do roadmap:** Fase 1 — Core.

**Zero runtime, de propósito.** Este pacote não tem uma função, uma constante ou um import de banco. Compilá-lo produz apenas `export {}` — nenhum byte de JavaScript efetivo. A razão é a regra de arquitetura mais dura do Roadmap: *"nunca depender diretamente de outro módulo — toda comunicação ocorre através do Core"*. Um Core sem runtime não tem como ser acoplado por acidente.

**O que exporta:**

| Arquivo | Contrato |
|---|---|
| `primitives.ts` | `TenantId`, `UserId`, `ModuleId`, `IsoDateTime`, `Uuid`, `SemVer` |
| `taxonomy.ts` | `DomainKey` (18), `VerticalKey` (29), `ModuleTaxonomy`, `CapabilityDeclaration` |
| `tenant.ts` | `Tenant`, `Membership`, `Role`, `Permission`, `PermissionKey` |
| `module.ts` | **`ModuleManifest`**, `ModuleRegistration`, `TenantModule`, `PlanLimit`, `AgentSlot` |
| `events.ts` | `EventEnvelope` / `DomainEvent`, `EventType`, `OutboxEntry` |
| `audit.ts` | `AuditEntry`, `AuditActor` |

**De onde foi minerado:** obra de **montagem e padronização, não de invenção** — o Core unifica quatro padrões provados num contrato só: tenancy/planos/consumo (kraken-v2, **PROVADO**), billing/idempotência (casa-bonaparte + forensic, **PROVADO ponta a ponta**), auditoria (peritus, **PROVADO**), e o rascunho de RBAC da pedreira alsham-core — **minerar o schema, jamais reutilizar o banco** (lição paga nº2). Cada tipo cita a origem no próprio JSDoc.

**Leia antes de escrever um módulo:** [`docs/canon/CORE-SPEC.md`](../../docs/canon/CORE-SPEC.md) — o ciclo de vida completo (declara → registra → instala → recebe permissões → conversa por eventos).

**Status:** ✅ **CONSTRUÍDO como contrato.** Passa em `pnpm typecheck`.

Do **motor**, uma peça já existe e três não (CORE-SPEC §5): o **despachante da caixa de saída** foi construído na Etapa 6 e vive em `@alsham/workflow` — engine, fora daqui, porque este pacote é zero runtime e assim continua. **Validador de manifesto, registro de módulo em runtime e resolvedor de permissão seguem NÃO CONSTRUÍDOS** — hoje quem barra acesso é a RLS no banco, não código de aplicação.
