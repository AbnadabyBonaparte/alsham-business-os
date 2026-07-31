# MÓDULO 78 — Gestão de Vulnerabilidades (`vuln`)

> Domain 🔐 **Segurança da Informação** (`infosec`) · Onda Dezenove (Fase 3) · migration `0093_vuln.sql` · pacote `@alsham/vuln`
> **ABRE** o Domain Segurança da Informação.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **registro de vulnerabilidades** encontradas nos **sistemas do tenant**: o
desvio de segurança constatado (uma porta aberta, uma biblioteca desatualizada,
uma configuração frágil), com **título** e **descrição** obrigatórios, **sistema
afetado** e **plano de remediação** em texto livre, e a **severidade** na régua
1–5. O produto acompanha cada vulnerabilidade da constatação ao encerramento.

---

## 2. ⭐ O RECORTE — a vulnerabilidade DO TENANT, não da plataforma

Metade do Domain Segurança da Informação é a ALSHAM cuidando da **própria**
infra — e isso não vira schema de produto: *IAM* é o RBAC do Core; *Cofre de
segredos* é o Vault da infra; *SIEM* e *Backup* são operação da plataforma.
Ficam **DECLARADOS FORA** (ver `ONDA-DEZENOVE-DECISOES.md`).

O que sobra de GENUÍNO para o tenant gerenciar **dentro** do produto é este: as
vulnerabilidades dos **sistemas dele**, com severidade e status de remediação.

---

## 3. ⭐ A IDENTIDADE É A DO `nc` / `capa`

A vulnerabilidade é um **DESVIO constatado** — a mesma física da Não
Conformidade: nasce de uma constatação e caminha para uma **remediação**, e
**fechar exige a evidência** de que a causa foi tratada. É o `nc` re-perguntado
para o terreno da segurança da informação.

⭐ **A severidade 1–5 é CHECK argumentado** — a física do MÉTODO (o precedente do
`risk`/`vperf`/`nps`). Não é vocabulário de casa; é a escala do risco técnico, e
fora de 1..5 o banco recusa.

---

## 4. ⭐⭐ AS DUAS RESPOSTAS TERMINAIS — o DIVERGE assinado

O ciclo é `open → in_progress → remediated` / `accepted_risk`, com
`in_progress → open` (reavaliar). E aqui está a decisão:

- **`remediated`** — corrigi a vulnerabilidade, com a **nota de remediação**.
- **`accepted_risk`** — decidi **conviver** com ela: o **risco aceito**, comum em
  segurança quando o custo de corrigir supera o do risco (com a **justificativa**
  escrita).

**Ambas exigem a resposta escrita e são TERMINAIS.** É o DIVERGE assinado do
`nc`, que fecha por um único caminho: uma vulnerabilidade tem duas saídas
honestas — some, ou assume-se. Uma vulnerabilidade que **reaparece** é registro
**NOVO** (a física do `nc`/`proj`). O conteúdo CONGELA nos fins.

O vínculo ao incidente de segurança que a vulnerabilidade causou (ou que a
revelou) é por **id solto** (`incident_id`) ao `secincident` (Módulo 79).

⛔ FORA: scanner automático / integração CVE (integração/Engine); CVSS calculado
por fórmula (motor futuro — aqui a severidade é ato de gente).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — ABRE o Domain Segurança da
Informação).** **Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook
§32).

- `supabase/migrations/0093_vuln.sql` — `vuln.findings`, RLS, severidade 1–5
  CHECK, ciclo com as duas respostas terminais (`remediated`/`accepted_risk`,
  resposta escrita obrigatória), `in_progress → open`, conteúdo congelado no fim,
  vínculo `incident_id` id solto. Sem DELETE.
- `packages/vuln` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, ordenação por
  severidade) e testes.
- Seed: cartão 78 (`domain_key='infosec'`). Catálogo **77 → 78**.

Permissão: `vuln.finding.manage`. Fatos: `vuln.finding.registered` ·
`.progressed` · `.remediated` · `.accepted` · `.reopened`. **`consumes` VAZIO**
(Lei 7 — sem redeploy do `apps/api`).

⭐ **Ao aplicar (runbook §32):** expor o schema `vuln` na Data API; **sem
redeploy**.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
