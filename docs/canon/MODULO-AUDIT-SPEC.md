# MODULO-AUDIT-SPEC — Módulo 64: Auditorias (de qualidade)

**Domain 🧪 Qualidade · capacidade _Auditorias_ · `module_id = audit` · schema `audit`**
Onda Quatorze (Fase 2), o SEGUNDO módulo do Domain Qualidade (depois do `nc`,
Módulo 63 — Não Conformidades). Migration `0079_audit.sql`, pacote
`@alsham/audits`.

---

## 1. O QUE É

Uma empresa que leva qualidade a sério **planeja e conduz auditorias** — internas,
externas, de certificação — e **registra os achados** de cada uma. Este módulo é
exatamente isso, e só isso. Duas peças:

- `audit.audits` — a auditoria: `audit_type` e `scope` em TEXTO LIVRE, uma data
  agendada opcional, e o ciclo `planned → completed/cancelled`.
- `audit.findings` — o achado: a observação constatada durante a auditoria,
  IMUTÁVEL, com um vínculo opcional a uma Não Conformidade formal.

⚠️ **Homônimos declarados (Sol Único).** Não é a *Auditoria* do **Core** (a trilha
de acesso da plataforma — `core.audit.read`), nem a *Auditoria jurídica* do
**Legal**, nem as *Auditorias* de **GRC** (governança). Aqui é a auditoria de
QUALIDADE. Uma palavra não pode querer dizer quatro coisas: cada uma vive no seu
Domain, e esta é a do 🧪.

## 2. A FÍSICA

- ⭐ **Os dois fins são TERMINAIS — a física do `proj` (Módulo 53),
  re-perguntada.** `planned → completed` ou `planned → cancelled`, e nem
  `completed` nem `cancelled` reabrem. Copiar sem pensar e divergir sem escrever
  são o mesmo erro (CLAUDE.md); a pergunta foi refeita: uma auditoria concluída
  é a MESMA auditoria que poderia recomeçar (física do `ops`/`mnt`, onde o
  trabalho volta), ou um ato encerrado cujo recomeço é outro ato (física do
  `proj`)? É a segunda: a auditoria de março é a auditoria de março; a próxima
  passagem é uma auditoria NOVA, com sua própria agenda e seus próprios achados.
  O contraste `audit × proj` é assinado no `lifecycle.test.ts` (lê as duas
  migrations). ⭐ **A assimetria do `proj`:** cancelar exige RAZÃO
  (`cancel_reason`), concluir tem nota opcional (`outcome_note`).
- ⭐ **O achado é IMUTÁVEL — a física da Qualidade.** Um achado é um fato
  constatado; não se edita nem se apaga. A imutabilidade vive em três camadas:
  sem policy de UPDATE/DELETE, sem grant além de `select`/`insert`, e um gatilho
  que recusa a alteração até para o dono do banco. Corrigir é registrar OUTRO
  achado.
- ⭐⭐ **Dois vínculos de NATUREZA DIFERENTE, de propósito.** É o ponto do módulo:
  - Ao **auditoria**, por **FK COMPOSTA INTRA-schema**
    `(audit_id, tenant_id) → audit.audits(id, tenant_id)`. O achado é peça do
    PRÓPRIO módulo — a FK é permitida e correta (a Lei do Lego proíbe ler schema
    ALHEIO, não o próprio), e mantém a integridade de tenant.
  - Ao **`nc`** (Módulo 63), por **ID SOLTO opcional** (`nc_entry_id`, sem FK
    cross-schema). Um achado pode virar uma Não Conformidade formal, ou não — e o
    módulo não conhece o schema do `nc`.
- ⛔ **NÃO ENTRA (declarado peça a peça):**
  - **Checklist de auditoria estruturado** — é o `chk` (Checklists, Módulo 19, já
    publicado). A auditoria referencia; não recria a prancheta.
  - **Anexo de evidência** (foto, PDF do laudo) — *Storage & Arquivos* é
    capacidade do **Core** e está NÃO CONSTRUÍDA. Nada de campo de upload fingido.
  - **Não conformidade formal** — é o `nc` (Módulo 63). O achado só aponta para
    ela por id solto.
  - **Plano de ação corretiva/preventiva** — é o `capa` (capacidade *CAPA* da
    Qualidade, futura). O achado não carrega plano.

## 3. AS TELAS

`/auditorias` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica, com a agenda de auditorias e o registro dos achados, é frente de UI
própria, sem dado fabricado até lá).

## 4. OS FATOS

`audit.audit.scheduled` · `audit.audit.completed` · `audit.audit.cancelled` ·
`audit.finding.recorded`. Payload autossuficiente (quem escuta não faz join); o
envelope do achado carrega o `nc` por id solto. `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 5. ANTI-VIÉS

*Tipo* e *escopo* são TEXTO LIVRE. "Interna / externa / certificação" é dado do
tenant, nunca enum do produto: a auditoria de um laboratório clínico não é a de
uma transportadora, e congelar o vocabulário de um setor faria o produto
envelhecer com ele. Não há `create type audit.*` na migration — a lei vive no
schema por AUSÊNCIA, e o `manifest.test.ts` confere.

## 6. ESTADO DA OBRA

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `audit` (`0079_audit.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/audits` | ✅ CONSTRUÍDO |
| Portal `/auditorias` | ✅ CONSTRUÍDO (placeholder) |
| Seed (cartão quality) | ⏳ cartão adicionado pelo dono ao sedimentar a Onda |
| Checklist / anexo / plano de ação | ⛔ **NÃO CONSTRUÍDO** (§2) |

Construído na **Onda Quatorze** (Fase 2 — Domain Qualidade). É ARQUIVO, ainda
NÃO APLICADO: aplicar é ato do dono, `docs/runbook/APLICAR.md §27`. Expor o
schema `audit` na Data API ao aplicar. `consumes` vazio → sem redeploy do
`apps/api`.
