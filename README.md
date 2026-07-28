# 🏛 ALSHAM BUSINESS OS™

**Sistema Operacional Empresarial Modular · ALSHAM Global Commerce Ltda**

A empresa não compra "um sistema". Ela monta o sistema dela — Core + módulos, como Lego. Cada cliente novo financia um módulo que vira patrimônio da plataforma para todos os próximos.

> **Status: quatro módulos, e o 4º cartão na Store.** O Módulo 3 (Contas a Pagar) emite, e o **Módulo 1 — o mais antigo, o que ninguém escreveu para escutar — projeta o título** sem que uma linha do schema dele mudasse. Era a última ponta do Lego que faltava demonstrar: a direção não estava escondida no desenho. O Módulo 4 (Relacionamentos) acrescenta o cadastro de contrapartes e o histórico de contato. Existem o contrato do Lego, o schema (provado em CI contra PostgreSQL 17), o correio de eventos no ar, o instalador em runtime, a Store, a contabilidade de uso e oito telas.
>
> **⚡ O correio está no ar.** O dono ligou em 28/07/2026: `apps/api` publicado, `pg_cron` + `pg_net` habilitados, job de 1 em 1 minuto. Fechar um período de conciliação **realmente** faz o Marketing saber. O apply de `0001`→`0005` e do seed também está feito.
>
> ⚠️ **NÃO VERIFICADO por este repositório** — quem conferiu foi o dono, no ambiente dele; nenhum agente daqui conecta a produção. O fato entra datado e como ele informou (Lei 7).
>
> **O que ainda não está de pé:** não há preço, gateway, alarme de fila parada, nem deploy configurado neste repositório.

---

## 📐 A planta antes da obra (VERTEX)

Nenhuma linha de código, schema ou configuração nasce neste repo sem antes ler:

1. **[docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md](docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md)** — o mapa canônico: hierarquia oficial, 407 capacidades, 50 categorias, dimensões de Agentes e Integrações. É a ÚNICA taxonomia (Sol Único).
2. **[docs/canon/ROADMAP-TECNICO-V1.md](docs/canon/ROADMAP-TECNICO-V1.md)** — a ordem de engenharia: Core primeiro, fases, regras de arquitetura.
3. A **Carta Magna do ALSHAM Platform Framework™** (repo `alsham-events-os`) — o canon-mãe de que este produto herda a hierarquia Core → Engines → Domains → OS → Tenant.

E, antes de escolher de onde minerar cada peça:

4. **[docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md](docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md)** — o que o império já tem para cada peça, com estado PROVADO · DOSSIÊ · NÃO TEMOS.
5. **[docs/balancos/BALANCO-SUPABASE.md](docs/balancos/BALANCO-SUPABASE.md)** — o que cada um dos 12 bancos doa, e o que é pedreira de schema (minerar) versus banco a reutilizar (nunca).

Memória, não canon:

6. **[docs/historico/ALSHAM-STORE-CATALOGO-COMPLETO.md](docs/historico/ALSHAM-STORE-CATALOGO-COMPLETO.md)** — a versão anterior da taxonomia (397 módulos · 49 categorias). Fica como histórico; em qualquer divergência, a Taxonomia canônica vence (Sol Único).

## ⚖️ As 6 Leis do Projeto

1. **Lei 7 (fonte):** nenhum número ou promessa vai ao ar sem estar construído e provado.
2. **Lei anti-viés:** o cliente inaugural decide a ORDEM da fila de módulos, nunca o CONTEÚDO. Teste de todo requisito: *"outra empresa do mesmo setor usaria isso exatamente como está?"* Se não — camada de tenant ou serviço à parte.
3. **Construir × INTEGRAR:** folha (eSocial), fiscal (NF/SPED/SAT) e PDV integram-se por padrão; construir só com decisão de dono explícita.
4. **Lei do Reaproveitamento:** CRM = 360° PRIMA · Saúde = Peritus · Eventos = Events OS · Beleza = Suprema · Agentes = Exército/Santuário · Billing = padrão provado da Casa. Nenhum Domain começa do zero se já existe peça no império.
5. **Propriedade:** IP 100% ALSHAM Global. Cliente usa; nunca detém motor nem chaves-mãe. Cliente inaugural = parceiro de desenvolvimento (banca custo em troca de uso), sem exclusividade de setor. **Identidade de cliente nunca entra neste repositório.**
6. **Sol Único:** uma taxonomia, uma fonte de verdade. Documento que organizar capacidades referencia a Taxonomia, nunca cria outra.

## 🧭 Regras de arquitetura (resumo)

Todo módulo: independente, instalável/removível sem recompilar, comunicação SÓ pelo Core, APIs + eventos, permissões próprias, docs + testes, multi-tenant de nascença, agente de IA embarcado sempre que possível (doutrina da Casa). Nada nasce antes do Core.

## 🗂 Estrutura do repositório

```
docs/
  canon/       taxonomia · roadmap · core-spec · identidade-visual
               · modulo-recon-spec · modulo-marketing-spec · modulo-ap-spec
               · modulo-crm-spec
                                                — leitura obrigatória (VERTEX)
  balancos/    tecnologia + supabase            — de onde minerar cada peça
  historico/   catálogo anterior                — memória, não canon
supabase/
  migrations/  0001_core · 0002_recon           — APLICADAS em produção; não editar
               0003_billing · 0004_marketing · 0005_courier_cron
               0006_install · 0007_ap · 0008_recon_ap_projection · 0009_crm
                                                — APLICADAS em produção
               0006_install                     — arquivo; aplicar é ato do dono
  seed/        0001_platform.sql                — catálogo, idempotente
  tests/       shim · isolamento · uso · consumo · instalador
                                                — só CI, nunca no Supabase real
docs/runbook/  APLICAR.md                       — passo a passo para o dono aplicar
.github/scripts/ guarda de defasagem de documento — o CI barra doc que envelheceu
apps/
  portal/                                       — ✅ CONSTRUÍDO (login + 6 telas, com a Store)
  api/                                          — ✅ CONSTRUÍDO (A COMPOSIÇÃO; service_role)
  admin/  store/                                — só README, NÃO INICIADO
packages/
  config/                                       — ✅ CONSTRUÍDO
  core/                                         — ✅ CONSTRUÍDO (contrato, zero runtime)
  finance-reconciliation/                       — ✅ CONSTRUÍDO (Módulo 1)
  marketing/                                    — ✅ CONSTRUÍDO (Módulo 2 — prova o Lego)
  accounts-payable/                             — ✅ CONSTRUÍDO (Módulo 3 — fecha o triângulo)
  crm/                                          — ✅ CONSTRUÍDO (Módulo 4 — anti-viés difícil)
  workflow/                                     — ✅ CONSTRUÍDO (o correio do Core)
  billing/                                      — ✅ CONSTRUÍDO (uso, sem preço)
  permissions/                                  — ✅ CONSTRUÍDO (visão de catálogo da Store)
  auth/ organizations/
  notifications/ documents/ ai/ crm/ finance/
  legal/ hr/ analytics/ integrations/ ui/ sdk/  — só README, NÃO INICIADO
CLAUDE.md      instruções permanentes para qualquer agente neste repo
NOTICE.md      propriedade e reserva de direitos
```

Cada `README.md` de app e de package declara: o propósito, a fase do roadmap a que pertence, de onde a peça será minerada (com o estado que o Balanço registrou) e o status atual.

## 🏗 Estado da obra

**Etapa 0 — Fundação** *(mergeada)*: raiz saneada, esqueleto do monorepo, `CLAUDE.md` e governança mínima.

**Etapa 1 — O contrato do Core** *(esta etapa)*:

- **Stack SELADA pelo dono em 27/07/2026** — Linha A: TypeScript + Next.js + Supabase/Postgres + Vercel. Deixa de ser recomendação do Balanço e passa a ser a língua única da plataforma.
- `@alsham/config` — constantes canônicas.
- `@alsham/core` — **o contrato do Lego**: `ModuleManifest`, `EventEnvelope`, RBAC e auditoria como tipos. Zero runtime.
- `supabase/migrations/0001_core.sql` — o schema do Core, com `tenant_id` e RLS real em todas as tabelas. **Hoje aplicado em produção — não se edita mais.**
- [`docs/canon/CORE-SPEC.md`](docs/canon/CORE-SPEC.md) — o ciclo de vida de um módulo, que amarra as três peças.

**Etapa 2 — O primeiro módulo** *(esta etapa)*: **Conciliação & Aprovações** — o Módulo 1, que prova o Lego.

- `@alsham/finance-reconciliation` — manifesto, tipos e o motor de sugestão de baixa (determinístico, sem I/O, 28 testes).
- `supabase/migrations/0002_recon.sql` — schema **`recon`**, próprio do módulo. **Nenhum objeto criado no schema `core`.**
- [`docs/canon/MODULO-RECON-SPEC.md`](docs/canon/MODULO-RECON-SPEC.md) — o fluxo que substitui régua e caneta: importar → sugerir → conferir → visar com trilha.
- A direção de arte está selada em [`docs/canon/IDENTIDADE-VISUAL.md`](docs/canon/IDENTIDADE-VISUAL.md) e é obrigatória para a UI da Etapa 3.

**Etapa 3 — O motor ligado** *(esta etapa)*: o schema deixa de ser texto e passa a ser **provado**.

- **Versão-alvo selada** em [`CLAUDE.md §5.2`](CLAUDE.md) — Next.js 16.2.x · React 19 · TS 5 strict · Node 20+ · Turbopack · Vercel, com a **Regra de Ouro da Longevidade**: lógica de negócio vive em `packages/`, nunca em `apps/`. O framework é a pele, não o coração.
- As duas migrations **aplicam de verdade** num PostgreSQL 17 limpo, na ordem, a cada push.
- `supabase/tests/01_rls_isolation.sql` — isolamento multi-tenant provado com **usuário real**, não com leitura de policy.
- `supabase/seed/0001_platform.sql` — o catálogo da plataforma, idempotente. **Zero tenant, zero usuário.**
- [`docs/runbook/APLICAR.md`](docs/runbook/APLICAR.md) — o passo a passo do dono, com checklist de segurança pós-apply.
- [`.github/workflows/db-verify.yml`](.github/workflows/db-verify.yml) — o SENTINELA em CI: toda mudança que quebrar o isolamento é barrada antes da main.

**Etapa 4 — A primeira tela** *(esta etapa)*: o Módulo 1 ganha rosto, em `apps/portal`.

- **Mesa de conciliação** e **fila de aprovação**, em Next.js 16.2.12 + React 19 + Tailwind 4.
- Toda cor vem dos 18 tokens `--bos-*` do canon — **zero HEX em componente**, verificado no CI.
- A tela **não decide nada**: chama `suggestMatches()` e `unmatchedLines()` do pacote. O CI barra se o motor for reimplementado em `apps/`.
- Sem env var, roda em **modo demonstração** com dado fabricado e anônimo — a UI se prova sem banco no ar.
- Decisão e ação destrutiva sempre com **confirmação explícita em dois passos**; estados vazio, erro e carregando desenhados.

**Etapa 5 — Operação real** *(esta etapa)*: o cliente loga e usa com dado real.

- **Supabase Auth** — login por senha ou magic link; `proxy.ts` (o "middleware" da Next 16) protege as rotas.
- **O `tenant_id` vem da sessão cruzada com `core.memberships`, nunca do cliente.** Cookie de tenant é preferência, não autoridade.
- **Portal ligado ao banco real**, sob RLS, com a chave publicável. A `service_role` não entra no app — há guarda no CI olhando o bundle de cliente.
- **Importar extrato** (OFX e CSV) — o parser vive em `packages/`, com 35 testes. O layout do CSV é `settings` do tenant, nunca código.
- **Fechar período** — mostra o resumo, e o fechamento dispara `recon.reconciliation.completed` na caixa de saída do Core.

**Etapa 6 — O correio e a cobrança** *(esta etapa)*: o ciclo do Lego fecha.

- **`@alsham/workflow` — o correio do Core.** Entrega o que os módulos põem na caixa de saída, com idempotência por consumidor e backoff exponencial. Sem ele, todo evento ficava preso em `pending` para sempre.
- **`@alsham/billing` — contabilidade de uso.** `usage_ledger` + leitura de limite, minerados do kraken-v2. **Sem preço** — preço é decisão do dono (Lei 7), e há guarda no CI.
- `supabase/migrations/0003_billing.sql` — o livro-caixa, com isolamento de uso entre tenants provado no CI.
- **ENGINE, não módulo:** o correio é serviço compartilhado (Taxonomia §4) — não aparece na Store.

**Etapa 7 — O segundo módulo** *(esta etapa)*: a tese do Lego deixa de ser afirmação sobre o futuro.

- **`@alsham/marketing` — o Módulo 2.** Campanhas: planejar, agendar, publicar, encerrar, medir. Schema `marketing` próprio, RLS forçada, porta única de saída.
- ⭐ **Ele CONSOME `recon.approval.decided`** — e é a primeira vez que um módulo reage ao fato de outro. **Sem importá-lo, sem join no schema dele, sem declará-lo em `package.json`, sem conhecer o correio.** O acoplamento é com o *tipo do evento*: contrato público, como um cabeçalho HTTP.
- **Provado nos dois níveis:** o correio de verdade entregando ao handler de verdade (TypeScript), e o efeito no banco de verdade — o fato entra uma vez, a reentrega não repete, e a decisão de um tenant não carimba a campanha do outro.
- **A cobrança pegou o módulo novo de graça:** nada foi escrito em `@alsham/billing`, porque ela conta **evento**, não módulo.
- **Guarda nova no CI — "módulo não conhece módulo"** — reprova import, dependência declarada e acesso a schema alheio. Sabotada nas três formas antes de entrar.

**Etapa 8 — O correio ligável** *(esta etapa)*: o Lego ganha o que faltava para conversar de verdade.

- **A persistência real do correio**, contra `core.event_outbox`. Duas falhas que memória nenhuma revelaria apareceram no primeiro contato com Postgres: a tomada **não reivindicava** nada (dois entregadores pegavam os mesmos 20 eventos), e um handler que falhava **nunca era reexecutado** — o evento acabava gravado como `delivered` sem nunca ter sido entregue. As duas corrigidas, com teste.
- **`apps/api` — A COMPOSIÇÃO**: o único lugar do repositório onde os módulos se conhecem. Importa `workflow`, `marketing`, `finance-reconciliation` e `billing`; nenhum deles importa nenhum outro.
- **`0005_courier_cron.sql`** — a saúde da fila (`core.courier_status()`) e o agendamento `pg_cron`, **comentado de propósito**: agendar exige extensões e segredos que só o dono tem.
- **25 testes contra Postgres de verdade**, incluindo o de concorrência que só o banco pode dar.
- ⚠️ **Construído ≠ no ar.** Ninguém agendou nada — e há guarda no CI para que nenhum documento diga o contrário.

**Etapa 9 — A Store e o instalador**: o Lego vira produto visível.

- **`0006_install.sql` — o instalador em runtime.** `core.install_module()` e `core.uninstall_module()` fecham os passos 3 e 4 do ciclo de vida que o CORE-SPEC descrevia desde a Etapa 1. Exigem `core.module.install`, só aceitam módulo publicado, respeitam o teto do plano — e emitem `core.module.*`, que a trilha registra sozinha.
- ⭐ **Desinstalar corta o acesso e NÃO apaga dado.** Há teste provando: depois de desinstalar, a campanha continua no banco e some da vista do usuário. Reinstalar devolve o acesso ao mesmo dado.
- **A Store, em `apps/portal/src/app/store/`** — vitrine dos módulos publicados, com capacidades, permissões, o que cada um emite e **de quem escuta**. Instalar e desinstalar com confirmação que diz o que acontece.
- ⚠️ **Um vazamento fechado.** O seed concedia as permissões dos módulos ao papel de **sistema** `admin`, que vale em todo tenant: qualquer tenant novo já nascia com os dois módulos, sem instalar e sem ocupar vaga no plano. O bloco saiu, o instalador recusa papel de sistema, e há guarda no CI. A limpeza do que já existe em produção está no [runbook §7.3](docs/runbook/APLICAR.md).

**Etapa 10 — O triângulo do Lego**: o Módulo 3, e a última ponta que faltava.

- **`@alsham/accounts-payable` + `0007_ap.sql` — o Módulo 3, Contas a Pagar.** Registra o que a empresa deve e conta cada título que nasce, muda ou é cancelado. Schema próprio, RLS forçada, porta única de saída.
- ⭐ **O TRIÂNGULO.** O Módulo 1 — o mais antigo, o que ninguém escreveu para escutar — **virou consumidor**. `recon.payables` nasceu na Etapa 2 com `source='event'` e `source_module_id`, esperando um módulo que ainda não existia; quando ele chegou, **nenhuma linha do `0002_recon.sql` mudou**. Nenhuma coluna nova, nenhuma constraint relaxada. É essa a prova, e ela não se fabrica depois.
- ⛔ **A origem de um fato vem do ENVELOPE, nunca de constante.** Um teste projeta com um produtor fictício (`erp-bridge`) e confere que a origem gravada é a dele. Com a procedência chumbada, um segundo produtor entraria disfarçado do primeiro e a trilha mentiria sem nunca dar erro — há guarda no CI que reprova as três formas de chumbar.
- ⛔ **Cancelar é ESTADO, nunca `delete`.** Sem GRANT e sem policy de DELETE, conferidos **no banco aplicado**. E **título liquidado não se cancela**: estorna-se primeiro, cancela-se depois — dois atos, dois registros.
- ⚠️ **Mão humana ganha do evento.** Se já existe um título com aquela referência digitado por uma pessoa, a projeção **não o sobrescreve**.
- **Telas de contas a pagar** com porta de dados própria, e o item de menu só para quem tem acesso ao módulo.
- ⚠️ **O ciclo de vida vive em dois lugares** — no SQL e no TypeScript — e um teste **lê o arquivo da migration** e compara par a par. É o que torna a duplicação arquitetura em vez de descuido.

**Etapa 11 — O 4º cartão da Store** *(esta etapa)*: Relacionamentos, o CRM base.

- **`@alsham/crm` + `0009_crm.sql` — o Módulo 4.** Contrapartes (pessoa ou organização) e o histórico de contato de cada uma, inteiro num lugar só. Schema próprio, RLS forçada, porta única de saída, quatro fatos contados ao mundo.
- ⚖️ **O anti-viés onde ele é mais difícil.** A Taxonomia lista *WhatsApp* como capacidade do Domain — e ela nomeia as capacidades como o **mercado** as nomeia, não como o schema deve. O canal da interação é **texto livre**; "cliente" e "fornecedor" são **etiquetas** escolhidas pelo tenant, nunca um enum; o identificador fiscal é neutro e **não tem formato** (nem 11 dígitos, nem 14, nem dígito verificador). Cada uma dessas recusas tem teste.
- ⛔ **A interação é IMUTÁVEL em três camadas** — sem policy de UPDATE, sem GRANT, e um gatilho que recusa **até para o dono do banco**. Duas camadas bastariam para o cliente; a terceira é para nós. Fato consumado não se edita: corrigir é registrar outra.
- ⭐ **O ciclo de vida DIFERE do Módulo 3, e a diferença é a lição.** Lá, o título cancelado é terminal, porque dinheiro tem identidade por documento. Aqui, `archived → active` existe: uma contraparte que volta é a MESMA pessoa, e obrigá-la a nascer de novo partiria o histórico em dois. **Copiar a regra anterior "por consistência" teria sido o erro.**
- ⚖️ **Lei 4 aplicada, com divergência declarada.** Minerou-se o schema de `accounts`/`contacts` da pedreira `alsham-core` — e virou **uma** tabela com `kind`, porque duas forçam a hierarquia "contato pertence a conta", que presume um organograma de venda B2B.
- **A guarda "módulo não conhece módulo" passou a GERAR a matriz de pares.** Com três módulos eram 6; com quatro são 12; com cinco serão 20. Lista escrita à mão é lista que um dia esquece um par — e justamente o novo.

**O que NÃO existe** — o estado corrente vive em [CORE-SPEC §5](docs/canon/CORE-SPEC.md), [MODULO-RECON-SPEC §7](docs/canon/MODULO-RECON-SPEC.md), [MODULO-MARKETING-SPEC §6](docs/canon/MODULO-MARKETING-SPEC.md), [MODULO-AP-SPEC §6](docs/canon/MODULO-AP-SPEC.md) e [MODULO-CRM-SPEC §6](docs/canon/MODULO-CRM-SPEC.md), e há guarda no CI contra essas seções envelhecerem:

- **Nenhum alarme.** A saúde da fila é consulta, não notificação — quem olha é o dono. Se a fila parar de madrugada, ninguém é avisado.
- **Instalar não carrega código.** Um módulo que escuta o fato de outro só reage porque o handler existe no repositório e está inscrito à mão na composição. Instalar dá **acesso e permissões**; integração é código. Não há plugin dinâmico, e a Store diz isso na própria tela.
- Do motor do Core, seguem **NÃO CONSTRUÍDOS** o validador de manifesto, o registro de módulo em runtime e o resolvedor de permissão — hoje quem barra acesso é a **RLS no banco**.
- Sem **preço**, sem gateway de pagamento, sem fatura (Lei 7 — decisão do dono, com números medidos).
- Sem leitor de **CAMT.053** e sem rateio N↔M.
- **O Módulo 4 não envia mensagem nenhuma.** Ele registra que o contato aconteceu; não fala com ninguém. Integrar canal é Lei 3. E não há Pipeline, Propostas, Follow-up, Leads, Comissão nem Metas — 11 das 12 capacidades do Domain seguem **NÃO CONSTRUÍDAS**.
- **O Módulo 3 não paga nada.** Registra o que se deve e conta o fato; remessa bancária e integração de pagamento são Lei 3 (INTEGRAR, não construir). Registrar liquidação e estorno **pela tela** também não existe — o ciclo de vida aceita os dois e é provado, mas o botão é etapa própria.
- **Nenhum segredo existe aqui**, e não há deploy configurado neste repositório.

---

*Universo Bonaparte · Powered by ALSHAM · jul/2026*
