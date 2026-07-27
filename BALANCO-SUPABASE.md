# 🗄️ BALANÇO SUPABASE — O QUE OS 12 BANCOS DOAM AO BUSINESS OS
**Data:** 27/07/2026 · **Método:** listagem dos projetos + abertura das tabelas de 6 bancos-chave (contra-prova, não opinião). Complementa o BALANCO-DE-TECNOLOGIA.

## OS 12 BANCOS (censo oficial)

| Projeto | Ref | Estado | Veredito pro Business OS |
|---|---|---|---|
| **casa-bonaparte** (Banco do Universo) | ospnhmyjsyysirrithfr | ATIVO, RLS 100% | 🏆 Motor de comércio PROVADO |
| **kraken-v2** | icoounivgnevzgzgjosl | ATIVO, RLS 100% | 🏆 MELHOR referência multi-tenant viva |
| **peritus** | tutluattkjcswuowgjwv | ATIVO, RLS 100%, dados reais | 🏆 Referência de segurança + vertical Saúde/Governo |
| **alsham-core** (banco-mãe 360° PRIMA) | rgvnbtuqtxvfxhrdnkjg | ATIVO, ~130 tabelas | ⛏️ PEDREIRA DE SCHEMA (minerar, nunca reutilizar o banco) |
| **cognitive-mirror-ai** | tnctogqaclnuwqjuqwdq | ATIVO | Schema de agentes/marketplace presente, VAZIO hoje |
| **dra-fernanda** | rkjvszphwplnyzbtkaby | ATIVO, **0 tabelas** | Reservado, nunca migrado |
| **alsham-events-os** | rtosqxglvgjcfmjjqzzs | ATIVO, **0 tabelas** | Reservado — e MUDA o conflito de stack (ver §3) |
| **suna-core** (Quantum) | vktzdrsigrdnemdshcdp | ATIVO | ☠️ P0 conhecido: RLS aberta — anti-referência |
| **ALSHAM-DEV-OS** | rmomtdeojaxsnyqwikcr | ATIVO | Melhor schema de ALMA de agente (1 linha de teste) |
| **ALSHAM_MPC_CORE** | lcnuipkypzcuohgqhizj | ATIVO | Vazio (já verificado em ronda anterior) |
| **alsham-suprema-beleza** | kuyhgxgxqeufkgzbpsdw | ATIVO | Vertical Beleza (não aberto nesta sonda) |
| **brocraft** | ipciokoudftjopyqgpgh | ⚠️ **INACTIVE (pausado)** | Confirma o diagnóstico: por isso o site trava em "Carregando" |

**Não existe banco "bazar":** o Bazar vive DENTRO do casa-bonaparte (tabelas bazarProducts=7, bazarCategories=4, bazarClicks, bazarMidias) — exatamente como o canon manda (dado na raiz, trono como reflexo). ✅ Canon cumprido na prática.

---

## 1. O QUE CADA BANCO ABERTO DOA (contra-provado hoje)

### 🏆 casa-bonaparte — o Core financeiro
`private.pedidos` + `private.eventos_processados` (idempotência) + `private.config` (cofre de segredos, 3 chaves) + `private.leads` + `private.membros/apoios` — separação public/private exemplar, RLS em tudo. **Doa ao Business OS:** o padrão inteiro de billing + webhook + cofre. Já provado ponta a ponta em 24/07.

### 🏆 kraken-v2 — o mini-Core multi-tenant que já existe
`workspaces` + `workspace_members` + `platform_admins` + `plan_limits` (5 planos!) + `billing_events` + `usage_ledger` (98 lançamentos) + `invite_codes`/`invite_redemptions` + `app_settings` (config global) + jobs (86) + content_pieces (184) + versionamento de peça. **Doa ao Business OS:** o esqueleto tenant→membro→plano→limite→consumo COMPLETO e em produção. É a peça mais próxima do Core da Fase 1 que o império possui.

### 🏆 peritus — a régua de segurança + assinatura
11 tabelas limpas com DADOS REAIS (2 municípios, 7 servidores, 14 processos): `audit_log`, `timeline`, `junta_votos`, `relatorio_assinaturas`, `documentos`, `agendamentos`. **Doa ao Business OS:** o padrão de auditoria/trilha e — surpresa útil — `relatorio_assinaturas` é um embrião do domínio Assinaturas/GED que o balanço marcou como "não temos".

### ⛏️ alsham-core — a pedreira (e o alerta)
~130 tabelas, quase todas 0 linhas = um RASCUNHO GIGANTE do Business OS já desenhado: `organizations`/`user_organizations`/`teams`/`user_roles`/`org_policies` (Core RBAC) · `accounts`/`contacts`/`deals`/`quotes`/`invoices`/`support_tickets` (Comercial+CX) · `campaigns`/`landing_pages`/`social_media`/`ads_manager`/`seo` (Marketing) · `notifications`/`tasks`/`comments`/`webhooks_in/out`/`api_keys`/`automation_rules+executions` (Engines) · bloco de segurança com RLS comentada (SECURITY_FIXPACK_v3). **Estratégia: minerar o SCHEMA, jamais reutilizar o BANCO** (banco-mãe compartilhado é a lição nº2 a não repetir). Resíduos confirmados: tabelas kraken_v1 + pulso_cards ainda aqui, e ~20 tabelas esotéricas (ai_solar_flux, ai_infinitum_resonance…) do experimento antigo.
⚠️ **ACHADO NOVO — RUÍDO CARO:** `system_health_log` com **267.273 linhas** e crescendo — algum cron grava saúde para sempre, num banco de resto vazio. Marcar pra faxina (truncate + retenção).

### cognitive-mirror-ai — divergência a investigar
As tabelas do marketplace existem (`agents`, `agent_subscriptions`, `agent_knowledge`, `archetypes`) mas estão **VAZIAS hoje** — diverge do dossiê de 22/07 (que citava 7 prompts reais e 1 assinatura). Hipóteses: prompts vivem no código, ou dados foram limpos. Uso real presente (sessions=5, deep_mirror_messages=8). **A verificar antes de contar com ele como base da Store de Agentes.**

### dra-fernanda + alsham-events-os — os dois bancos vazios
Projetos criados (16/07 e 08/07), zero tabelas. A captura de leads do Conversion OS ainda NÃO mora no banco próprio da Fernanda. São terrenos reservados.

## 2. LEITURA EXECUTIVA

O Supabase confirma e melhora o balanço: **o Core da Fase 1 já existe em pedaços vivos** — tenancy/planos/consumo no kraken-v2, billing/cofre/idempotência na casa-bonaparte, auditoria/assinatura no peritus, e o rascunho completo de RBAC+CRM+Marketing+Engines na pedreira do alsham-core. A obra do Core é **unificar quatro padrões provados num schema só**, não inventar.

## 3. O CONFLITO DE STACK — ATUALIZADO

Achado que pesa na decisão: **já existe projeto Supabase reservado para o events-os** (rtosqxglvgjcfmjjqzzs, vazio). Ou seja, a própria prática já caminhou pra Postgres/Supabase mesmo onde a Carta escreveu MySQL/Drizzle. Os 12 projetos do império são TODOS Postgres 17 no Supabase. A recomendação da Linha A sai reforçada: não é mudança, é reconhecer o que já é.

## 4. PENDÊNCIAS QUE ESTA SONDA ABRIU

1. Cognitive Mirror: conferir onde vivem os 7 prompts (código vs banco) antes de ancorá-lo como Store de Agentes
2. alsham-core: faxina do `system_health_log` (267k linhas) + desligar o cron que o alimenta
3. suprema-beleza e suna-core: não abertos nesta sonda (suna já tem dossiê P0)
4. brocraft: decidir se despausa (restaurar projeto) ou arquiva — hoje o site vende um app que não abre

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
