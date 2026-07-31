# ONDA DEZENOVE — as decisões dos 3 Domains pendentes (Fase 3)

> Investigação de canon da **Onda Dezenove** — os **três últimos Domains** do
> mapa sem nenhum módulo: 🤖 **IA Aplicada** (9 capacidades), 🏛 **GRC** (7) e
> 🔐 **Segurança da Informação** (7). **23 capacidades** ao todo.
>
> Este documento registra a decisão de **cada uma das 23** — *módulo novo*,
> *reaproveita X* ou *FORA* — **com o porquê, inclusive das que ficam de fora**.
> Negar uma decisão silenciosa é a Lei 7 com o sinal trocado; declará-la é o
> ofício.
>
> **Resultado:** 6 módulos novos (75–80). IA Aplicada entrega **zero** — e isso
> é honestidade, não falha. O catálogo vai de **74 → 80**.

---

## 0. O PRINCÍPIO — o anti-viés e a Lei do Reaproveitamento aplicados ao Domain

Antes de abrir um schema, a pergunta do CLAUDE.md §4 vale para a CAPACIDADE
inteira: *outra empresa do setor usaria isso exatamente assim?* E a Lei do
Reaproveitamento (Taxonomia §9): *já existe peça no império que faz isso?*

Duas armadilhas moram aqui:

1. **Construir o que já é Core/Engine.** Metade da IA Aplicada e metade da
   Segurança da Informação são **capacidades da plataforma**, não do produto do
   tenant — a IA que gera texto, o correio que automatiza, o RBAC que controla
   acesso. Reconstruí-las como módulo seria duplicar o motor.
2. **Construir o que já é outro módulo genérico.** *Auditorias* de compliance é
   a mesma física da auditoria de qualidade; *Compliance corporativo* é a mesma
   física do requisito com conformidade mutável; *Políticas* de GRC é
   literalmente a política versionada com ciência que já existe.

O que **sobra** — o recorte GENUÍNO que nenhum motor e nenhum módulo cobre — é o
que vira schema. E às vezes o que sobra é **nada**, e o honesto é dizê-lo.

---

## 1. 🤖 IA Aplicada (9 capacidades) — RESULTADO: 0 módulos

O Domain inteiro é **Core e Engine** (Taxonomia §3–§4 e §7, a Dimensão 2 do
Marketplace de agentes). Nenhuma das nove é um recorte de **DADO** do tenant —
todas são **capacidade de motor** que os outros módulos já consomem sem
conhecer. Zero módulo é a leitura correta, não uma lacuna.

| # | Capacidade | Decisão | Por quê |
|---|---|---|---|
| 1 | **Agentes** | FORA | é a **Dimensão 2 — AI Marketplace** (Taxonomia §7): o Exército ALSHAM de agentes, um marketplace à parte, não uma tabela de tenant. |
| 2 | **Chat corporativo** | FORA | é a **Engine de Chat** (§4): capacidade transversal do motor, consumida por qualquer módulo; não é dado de um Domain. |
| 3 | **Automações** | FORA | é o **Workflow Engine** — o correio do Core (§3), que já entrega e orquestra os fatos entre módulos. Automatizar é a função dele. |
| 4 | **Resumos** | FORA | é a **IA Base do Core** (§3, a Forja) chamada como ferramenta: resumir é uma geração, capacidade de motor — o botão vive onde há geração medida, não num schema. |
| 5 | **Análise de dados** | FORA | é a **Engine de Analytics & Dashboards** (§4) sobre o Domain BI: a leitura do negócio já tem casa. |
| 6 | **Classificação** | FORA | é uma **chamada de IA** (a Forja), não um dado: classificar é gerar um rótulo, capacidade de motor. |
| 7 | **OCR IA** | FORA | é a **Engine de OCR** (§4): serviço de motor, consumido; não um schema de tenant. |
| 8 | **Pesquisa inteligente** | FORA | é a **Engine de Busca Inteligente** (§4): capacidade transversal do motor. |
| 9 | **Copiloto** | FORA | é o **Engenheiro** (o agente existente): assistência é motor, não dado. |

⭐ **Nenhum recorte de DADO genuíno sobra** — e por isso o Domain fica sem cartão.
Forçar um módulo aqui seria inventar um schema para hospedar uma chamada de
motor, exatamente o que a Regra de Ouro (§5.3) proíbe: a tela consome o motor,
não o reconstrói.

---

## 2. 🏛 GRC — Governança, Riscos & Compliance (7) — 3 módulos novos, 3 reaproveitam

| # | Capacidade | Decisão | Por quê |
|---|---|---|---|
| 1 | **Gestão de riscos** | módulo NOVO `erisk` | o DIVERGE do `risk` (que é project-scoped): risco ESTRATÉGICO/corporativo, sem projeto, que vive enquanto a empresa vive. Ver `MODULO-ERISK-SPEC`. |
| 2 | **Matriz de riscos** | `erisk` (mesma peça) | a matriz é a **leitura** do registro (severidade = prob × impacto), não uma segunda tabela. Uma capacidade, dois ângulos. |
| 3 | **Controles internos** | módulo NOVO `control` | o cadastro do controle (tipo COSO CHECK) + o livro imutável de testes. Não é `pol`, não é `audit`, não é `erisk`. Ver `MODULO-CONTROL-SPEC`. |
| 4 | **Canal de denúncias** | módulo NOVO `whistle` | a física do anonimato em três camadas (nunca grava quem denunciou, quando anônimo). Ver `MODULO-WHISTLE-SPEC`. |
| 5 | **Auditorias** | reaproveita `audit` | auditoria de compliance é a MESMA física da auditoria de qualidade: ciclo planejado + achados, escopo texto livre. O `audit` já existe e serve os dois — não se duplica. |
| 6 | **Compliance corporativo** | reaproveita `iso` | um requisito de compliance é um requisito com **conformidade mutável** — a mesma física do requisito de norma que o `iso` já modela (avaliação que muda a cada auditoria, sem ciclo terminal). Reusa-se. |
| 7 | **Políticas** | reaproveita `pol` | é literalmente a política versionada com ciência já entregue no Bloco de Pessoas. O homônimo GRC×RH está declarado no próprio manifesto; a peça é uma só (Sol Único). |

⭐ **A régua da decisão:** os três NOVOS têm física que **nenhum** módulo cobria
(risco corporativo, controle interno, anonimato); os três REAPROVEITADOS têm
física **idêntica** a uma peça pronta. Construir `audit`, `iso` ou `pol` de novo
"para o GRC" seria a duplicação que a Lei do Reaproveitamento existe para
impedir.

---

## 3. 🔐 Segurança da Informação (7) — 3 módulos novos, 4 são plataforma

⭐ **A régua aqui é outra:** metade do Domain é a ALSHAM cuidando da **PRÓPRIA
infra** — controle de acesso, segredos, monitoração, backup. Isso é **operação
da plataforma**, não schema do produto do tenant. O que sobra de genuíno para o
tenant gerenciar **dentro** do produto são três recortes de dado.

| # | Capacidade | Decisão | Por quê |
|---|---|---|---|
| 1 | **IAM (identidade e acesso)** | FORA — é Core | é o **RBAC do Core** (`core.has_permission`, §3): quem pode o quê já é decidido pela plataforma. Um módulo de IAM reconstruiria o motor de permissão. |
| 2 | **Cofre de segredos** | FORA — é infra | é o **Vault da infra** (env vars, segredos de deploy): credencial não entra na Store genérica (a lição do `.pfx` do certificado, Lei 3 + segurança). |
| 3 | **SIEM / Monitoramento** | FORA — é plataforma | correlação de eventos de segurança é operação da plataforma, não dado do tenant. |
| 4 | **Backup** | FORA — é plataforma | backup e restauração são operação da infra; o tenant não os modela como registro. |
| 5 | **Gestão de vulnerabilidades** | módulo NOVO `vuln` | as vulnerabilidades dos SISTEMAS DO TENANT — a identidade do `nc`/`capa`, severidade 1–5, duas respostas terminais (remediada / risco aceito). Ver `MODULO-VULN-SPEC`. |
| 6 | **Resposta a incidentes** | módulo NOVO `secincident` | o DIVERGE do `occ`: timeline NIST de 5 estados + campos próprios (vetor, dados), editável enquanto aberto. Ver `MODULO-SECINCIDENT-SPEC`. |
| 7 | **Continuidade de negócios** | módulo NOVO `continuity` | o documento do plano é o `pol`; o que justifica o módulo é a PRÁTICA — os alvos RTO/RPO + o livro imutável de drills. Ver `MODULO-CONTINUITY-SPEC`. |

⭐ **O corte é claro:** o que a plataforma FAZ pelo cliente (IAM, Vault, SIEM,
backup) fica com a plataforma; o que o cliente REGISTRA e GERENCIA sobre a
própria segurança (vulnerabilidades, incidentes, continuidade) vira módulo.

---

## 4. ⚠️ A INCONSISTÊNCIA LATENTE ENCONTRADA — documentada, não tocada

Durante a investigação achou-se uma divergência dormente na chave do Domain de
IA Aplicada, entre as duas fontes que a nomeiam:

- `packages/core/src/taxonomy.ts` — o tipo `DomainKey` traz **`applied-ai`**.
- `apps/portal/src/lib/store-taxonomy.ts` — a taxonomia da Store traz
  **`ai-applied`**.

São dois nomes para o mesmo Domain. **A inconsistência está DORMENTE** porque a
IA Aplicada entrega **zero módulo** (§1): nenhum cartão referencia essa chave,
então nada quebra hoje. Se um dia um módulo nascer sob esse Domain, a chave terá
de ser unificada **antes**, ou o cartão apontará para um Domain que uma das
fontes não conhece.

⛔ **Não foi tocada nesta onda, de propósito:** unificar `DomainKey` é mudança de
contrato do `@alsham/core` que atravessa Store, seed e taxonomia — não é escopo
de uma onda que não usa o Domain. Fica **registrada aqui** para que a próxima
frente que abrir IA Aplicada a resolva com intenção, não por susto (a mesma
disciplina do `middleware.ts` → `proxy.ts`: a armadilha documentada não pega
ninguém).

---

## 5. FECHAMENTO DA ONDA

- **6 módulos novos** (75–80): `erisk`, `control`, `whistle` (GRC) · `vuln`,
  `secincident`, `continuity` (InfoSec).
- **6 capacidades reaproveitadas ou remetidas a peça existente:** Matriz de
  riscos (→ `erisk`), Auditorias (→ `audit`), Compliance corporativo (→ `iso`),
  Políticas (→ `pol`); e, na Segurança, os quatro serviços de plataforma.
- **9 capacidades de IA Aplicada** absorvidas por Core/Engine — 0 módulos.
- Migrations `0090`–`0095` (arquivo; apply do dono, runbook §32). Todos com
  **`consumes` VAZIO** — sem redeploy do `apps/api`. Próxima livre: **`0096`**.
- Catálogo: **74 → 80 módulos publicados.**

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
