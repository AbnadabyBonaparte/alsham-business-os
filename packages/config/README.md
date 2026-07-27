# packages/config · `@alsham/config`

**Propósito:** as constantes canônicas do Business OS — quem é o produto e quem é a empresa. É a fonte única **para o código**; a declaração jurídica vive em [`NOTICE.md`](../../NOTICE.md), e em divergência o NOTICE vence.

**Fase do roadmap:** Fase 1 — Core (encanamento; precede os módulos).

**O que exporta:** `PRODUCT` (nome, nome de exibição, slug) e `COMPANY` (razão social, CNPJ, e-mail comercial). Nada além.

**O que NUNCA entra aqui:**

- ❌ número de marketing — quantidade de módulos, capacidades, clientes, uptime (Lei 7);
- ❌ dado de cliente de qualquer espécie (Lei anti-viés);
- ❌ segredo — chave, token, connection string, URL de projeto. Segredo mora em variável de ambiente e é lido pelo Core.

**Não confundir com cofre de segredos.** Segredo de tenant é assunto do Core/billing (padrão `private.config` da casa-bonaparte, **PROVADO**). Aqui nunca entra valor real.

**Status:** ✅ **CONSTRUÍDO** — `package.json` + `tsconfig.json` + `src/index.ts`. Passa em `pnpm typecheck`.
