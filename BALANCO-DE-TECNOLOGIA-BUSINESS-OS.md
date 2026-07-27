# ⚖️ BALANÇO DE TECNOLOGIA — ALSHAM BUSINESS OS™
## O que o império JÁ TEM para cada peça da plataforma
**Data:** 27/07/2026 · **Regra que este documento serve:** Lei do Reaproveitamento — nenhum Domain começa do zero se já existe peça na casa.

**Fontes:** os 28 dossiês em `alshamglobalcommerce/docs/produtos/` + as provas das rondas de julho (o que foi ABERTO e testado, não só descrito). Cada linha marca o estado: **PROVADO** (testado/contra-provado em ronda) · **DOSSIÊ** (descrito no código, sem prova de funcionamento) · **NÃO TEMOS** (obra nova real).

---

## 1. FASE 1 — CORE: o que já existe pra cada peça

| Necessidade do Core | O que já temos | Onde | Estado |
|---|---|---|---|
| Multi-tenant / Organizações | Hierarquia tenant_id + tabela domains (Carta Magna); padrão core/clients white-label | alsham-events-os · dra-fernanda-conversion-os | **PROVADO** (Fernanda→Juliano: 94 arquivos idênticos, fork funcional) |
| Auth + RBAC | Segurança nível profissional (referência do império); auth pronta; RLS completa | Peritus · alsham-os (Diamond) · forensic-ai | **PROVADO** (Peritus auditado como referência) |
| Billing / Pagamento | Motor Stripe multi-secret, webhook idempotente por event.id, reentregador com backoff, cofre de segredos em cascata | casa-bonaparte-saas `packages/billing` + Edge Functions | **PROVADO ponta a ponta** (24/07: HMAC real, entrega, idempotência, rede de segurança sobre falha real) |
| Cobrança por uso (metered) | `usage_ledger` medindo consumo por workspace | kraken-v2 | **PROVADO** (95 lançamentos reais, economia unitária calculada) |
| Padrão Stripe + auditoria de eventos | Tabela `stripe_events` + service-role + paywall | alsham-forensic-ai | **PROVADO** (deploy READY, schema com RLS em todas as tabelas) |
| Motor da Store / Marketplace | Schema de marketplace: price_cents, is_subscription, categoria, capabilities por item | cognitive-mirror-ai | **PROVADO** no schema ("monetização é UPDATE, não obra") |
| Checkout direto funcionando | Checkout Stripe ativo em HTML puro | AGENTEX.0 | **DOSSIÊ** (checkout existe; deploy pendente) |
| Workflow / Jobs / Fila | pg_cron + pg_net + job de reentrega por minuto; pipeline de jobs com estados | casa-bonaparte-saas · kraken-v2 (78 jobs) | **PROVADO** nos dois |
| IA Base (roteador + execução) | agent-router + task-executor + evolution-engine, chamando Claude e GPT | suna-alsham-automl (motor do Quantum) | **DOSSIÊ** (motor lido; ⚠️ banco suna-core com RLS aberta — P0) |
| Formato da alma de agente | Cápsula X.2 (profile.md + attributes + skills + knowledge) + registry + 4 agentes cabeados | alsham-os (Diamond) | **DOSSIÊ** |
| Agente autônomo com memória | HUNTER X.1 — memória em banco, caça real ao mundo, tribunal de julgamento | Quantum/santuário | **PROVADO** (26/07: 20 achados, 2 adotados) |
| Notificações / E-mail | Entrega transacional real (Resend) com confirmação | casa-bonaparte-saas | **PROVADO** (Carta-prévia entregue no teste) |
| Storage de mídia | Matusalém (raiz canônica de toda mídia) | raiz do universo | Canon vigente |
| Dashboard | Painéis operacionais em produção | ALSHAM-360-PRIMA | **PROVADO** vivo (vazio de dados, esperado pré-lançamento) |

**Leitura do Core:** das ~15 peças da Fase 1, o império já tem ~12 com peça existente — e as mais difíceis (billing idempotente, multi-tenant white-label, cobrança por uso) estão na coluna PROVADO. O Core do Business OS é majoritariamente obra de **montagem e padronização**, não de invenção.

## 2. DOMAINS — o que já existe

| Domain | Peça existente | Estado |
|---|---|---|
| **CRM / Comercial** | 360° PRIMA em produção (app.alshamglobal.com.br) | **PROVADO** vivo |
| **Marketing / Conteúdo** | Kraken v2: pipeline completo texto→imagem→clip→entrega→publicação, 174 peças geradas, custo unitário provado | **PROVADO** (melhor motor do império) |
| **Financeiro (base)** | Motor de pagamento da Casa + padrão Forensic | **PROVADO** — mas conciliação/DRE/tesouraria: **NÃO TEMOS** |
| **Jurídico** | LEXIS (agente) + 5 páginas legais transferíveis (GPT-Force) + packages/legal parametrizado por mundo | **PROVADO** (legais da Casa no ar) |
| **Arquitetura de oferta** | RevenueX: configurador "monte seu pacote", escada 3 níveis — é literalmente a UX da Store | **DOSSIÊ** (⚠️ prova social fabricada a remover) |
| **Lead magnet white-label** | Diagnóstico de Obra: motor de perguntas trocáveis, sem banco | **DOSSIÊ** |
| **IA / Agentes** | As 3 casas (Quantum=motor, Diamond=alma, Cognitive Mirror=marketplace) + Exército 112+ GPTs + 200 almas em resgate | **PROVADO** em partes |
| **Eventos** | Events OS (11 engines) + canta-siriema (ingressos + afiliados) | **DOSSIÊ** |
| **BI / Analytics** | Painéis do 360° PRIMA | **PROVADO** vivo |
| **Documentos/GED, OCR, Assinatura digital** | — | **NÃO TEMOS** |
| **RH, Compras, Operações/Facilities** | — | **NÃO TEMOS** |

## 3. VERTICAIS — o que já existe

| Vertical | Peça | Estado |
|---|---|---|
| Saúde | Peritus / Medical OS™ (SSR, segurança referência, 2 prefeituras, produção em setembro) | **PROVADO** — a vertical mais madura |
| Governo | Peritus (mesmo motor) | **PROVADO** |
| Autoridade individual | Conversion OS (Fernanda + Juliano + dentista entrando) | **PROVADO** |
| Beleza | Suprema Beleza | **DOSSIÊ** |
| Shopping · Varejo/Supermercado · Energia | — | **NÃO TEMOS** — é exatamente o que o cliente inaugural financia |

## 4. ⚠️ DECISÃO DE DONO — O CONFLITO DE STACK

O achado mais importante do balanço: **o império fala duas línguas de banco.**

- **Linha A (maioria + tudo que está PROVADO):** Next.js/React + Supabase (Postgres, RLS, Edge Functions) + Stripe + Vercel — Casa, Conversion OS, Peritus, Forensic, Kraken, Cognitive Mirror, 360° PRIMA
- **Linha B (só no papel da Carta Magna):** React + tRPC + Drizzle + **MySQL** + turbo — desenhada no alsham-events-os, nunca provada em produção

O Business OS precisa nascer numa língua só. A recomendação do guia é a **Linha A** (Supabase/Postgres): é onde estão TODAS as peças provadas deste balanço — reaproveitar o billing da Casa, a RLS do Forensic, o padrão do Peritus exige Postgres. Escolher MySQL/Drizzle jogaria fora a coluna PROVADO inteira. Se aceita, a Carta Magna ganha uma emenda de stack. **Decisão é sua.**

## 5. LIÇÕES PAGAS — o que o Business OS NÃO repete

1. **RLS aberta** (suna-core, P0): todo banco nasce com RLS ligada e policies reais — padrão Peritus/Forensic
2. **Banco-mãe compartilhado** (alsham-core servindo 3 sistemas): cada tenant do Business OS com isolamento claro
3. **Motor único acoplado** (bug no core propaga a todos): atualização por versão — doutrina "fábrica que estampa"
4. **Nome ≠ conteúdo** (kraken×kraken-v2, canta-siriema=Pulso): repo novo nasce com nome definitivo — já cumprido
5. **Doc interno em public/** (2 vazamentos): docs comerciais nunca em pasta servida; repo privado
6. **Prova social fabricada** (RevenueX): a UX vem, os depoimentos falsos ficam

## 6. O QUE FALTA VERIFICAR (obra de sonda, não de opinião)

- Estado real dos 28 dossiês um a um contra o código de hoje (dossiês são de 22/07; Kraken já mudou desde então)
- Qual banco o kraken-v2 usa (nunca contra-provado)
- Supabase/Stripe de alsham-quantum e do projeto `api`
- O que o STAGESET-VISION.md descreve (dossiê novo, ainda não lido pelo guia)

**Recomendação:** essa varredura repo-a-repo é serviço do SENTINELA/Claude Code com a ficha de 6 perguntas — prompt pronto quando você quiser.

---

## RESUMO EXECUTIVO

O Business OS **não começa do zero — começa do meio.** Core: ~80% das peças têm origem na casa, com as três mais difíceis já provadas em produção (billing idempotente, multi-tenant white-label, cobrança por uso). As obras genuinamente novas são: conciliação financeira avançada, GED/assinaturas, RH, Compras/Operações — e as três verticais que o cliente inaugural financia (Shopping, Varejo, Energia). Uma decisão de dono trava o início: **a língua do banco (Linha A recomendada).**

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
