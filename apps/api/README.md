# apps/api

**O que será:** a superfície pública de APIs e eventos da plataforma. Todo módulo expõe API e emite eventos por aqui — e nenhum módulo fala com outro diretamente: a comunicação passa pelo Core (regra de arquitetura do roadmap).

**Fase do roadmap:** Fase 1 — Core (`docs/canon/ROADMAP-TECNICO-V1.md`). Item "APIs & Eventos" do Core.

**Origem candidata:** padrão de webhook idempotente por `event.id` + reentregador com backoff de `casa-bonaparte-saas` (Balanço de Tecnologia: **PROVADO ponta a ponta**) e o bloco `webhooks_in`/`webhooks_out`/`api_keys` minerável do schema alsham-core (**pedreira — minerar schema, jamais reutilizar o banco**).

**Status:** NÃO INICIADO.
