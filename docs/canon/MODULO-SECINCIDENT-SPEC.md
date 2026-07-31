# MÓDULO 79 — Resposta a Incidentes (`secincident`)

> Domain 🔐 **Segurança da Informação** (`infosec`) · Onda Dezenove (Fase 3) · migration `0094_secincident.sql` · pacote `@alsham/secincident`
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **registro e a condução de incidentes de segurança** dos sistemas do tenant: o
vazamento, a invasão, o ransomware, o phishing bem-sucedido. Cada incidente tem
**título** e **descrição**, os campos próprios **vetor de ataque** (como
entraram) e **dados afetados** (o que foi comprometido), a **severidade** 1–5, e
uma **timeline de resposta** que se conduz por fases até o encerramento.

⚠️ **`module_id` = `secincident`.** "incident" solto é vocabulário sobrecarregado
(o `evt`, o `occ`, o outbox); o prefixo composto evita a colisão.

---

## 2. ⭐⭐ O DIVERGE ASSINADO — `secincident` × `occ`

O `occ` (Ocorrências) **já existe**, e a pergunta foi: *um incidente de segurança
é uma Ocorrência com categoria "segurança", ou é física distinta?* É **DISTINTA**,
por **duas** razões — e as duas estão assinadas:

| | `occ` (a OCORRÊNCIA) | `secincident` (o INCIDENTE) |
|---|---|---|
| natureza | **fato consumado** | **operação de resposta que se conduz** |
| ciclo | **1 par** (`open → closed`) | **5 estados** (timeline NIST) |
| mutabilidade | **NASCE imutável** | **editável enquanto aberto**, congela no fim |
| correção | tratativa em linha nova | edita-se o registro (o entendimento evolui) |

1. ⭐ **O ciclo de vida.** A ocorrência é um fato que se registra e se encerra. O
   incidente tem uma **timeline NIST** de várias fases:
   `detected → contained → eradicated → recovered → closed` (+ o atalho de
   falso-positivo `detected → closed`). `closed` é TERMINAL — o que recorre é
   incidente novo.
2. ⭐ **A mutabilidade.** O `occ` nasce IMUTÁVEL (o relato do fato não se
   reescreve). O incidente **não**: o entendimento **EVOLUI** durante a resposta
   — o vetor de ataque se descobre investigando, o escopo dos dados
   comprometidos cresce. Por isso é **editável ENQUANTO ABERTO** e **CONGELA no
   fechamento** — a física do `risk`, não a do `occ`.

⭐ **Os campos próprios** que o `occ` não tem — `attack_vector` e
`affected_data` (texto livre) — mais a timeline, são a prova de que não é o `occ`
com outro nome.

---

## 3. ⭐ O MANTIDO — a resposta é livro IMUTÁVEL de atos

O que **se manteve** do `occ`, de propósito: cada passo da resposta
(`response_actions`) é um **ato carimbado e IMUTÁVEL** — a física da tratativa
do `occ`. O que já se fez para conter/erradicar/recuperar não se reescreve; a
timeline é evidência forense. O cliente não tem porta de UPDATE/DELETE nela; o
gatilho recusa reescrita até para o dono do banco.

Assim o incidente separa duas coisas que o `occ` funde: o **estado corrente**
(editável, porque o entendimento muda) e o **histórico de atos** (imutável,
porque já aconteceu).

⚠️ **O vetor e os dados NUNCA passeiam no correio** — o envelope leva só metadado
(título, severidade, status, datas). O futuro é recusado em `detected_at` (o eco
do `occ`).

⛔ FORA: SOAR/playbook automático (Engine futura); integração SIEM (é
plataforma); forense/coleta de evidência (Storage do Core). O vínculo do `vuln`
a este é por id solto, do lado do `vuln`.

---

## 4. AS PEÇAS · OS FATOS · A PERMISSÃO

- `secincident.incidents` — o incidente (ciclo NIST, editável enquanto aberto,
  congela no fim, futuro recusado).
- `secincident.response_actions` — a timeline imutável de atos.
- Permissão: `secincident.incident.manage`.
- Fatos: `secincident.incident.registered` · `.contained` · `.eradicated` ·
  `.recovered` · `.closed` · `secincident.action.recorded`. **`consumes`
  VAZIO** (Lei 7).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — Domain Segurança da Informação).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §32).

- `supabase/migrations/0094_secincident.sql` — `secincident.incidents` (timeline
  NIST de 5 estados, editável/congela, severidade 1–5 CHECK, campos próprios) +
  `secincident.response_actions` (timeline imutável), RLS, envelope só metadado.
- `packages/secincident` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`) e
  testes.
- Seed: cartão 79 (`domain_key='infosec'`). Catálogo **78 → 79**.

⭐ **Ao aplicar (runbook §32):** expor o schema `secincident` na Data API; **sem
redeploy** (`consumes` vazio).

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
