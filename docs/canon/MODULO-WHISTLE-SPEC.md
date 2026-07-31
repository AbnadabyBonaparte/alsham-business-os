# MÓDULO 77 — Canal de Denúncias (`whistle`)

> Domain 🏛 **Governança, Riscos & Compliance** (`grc`) · Onda Dezenove (Fase 3) · migration `0092_whistle.sql` · pacote `@alsham/whistle`
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **canal de denúncias** do tenant — o *whistleblower channel* que a governança
exige: um membro registra um relato (assédio, fraude, desvio de conduta), com
**assunto**, **categoria** e **descrição**, podendo fazê-lo **anônima** ou
identificadamente. Um **comitê de ética** trata cada denúncia até um desfecho.

---

## 2. ⭐⭐ A FÍSICA CENTRAL — O ANONIMATO EM TRÊS CAMADAS

É o coração deste módulo, e a regra que **nenhum módulo anterior tem**:

> **Se a denúncia é anônima, o sistema NUNCA registra quem denunciou.**

Não é "não mostra" — é **NÃO GRAVA**. O denunciante está autenticado (é um membro
do tenant), mas quando `is_anonymous`, o `reporter_id` fica **NULL para sempre**.
Guardar quem denunciou e só "esconder na tela" seria uma bomba: um vazamento, uma
ordem judicial, um admin curioso — e a proteção que a lei (e a decência) exigem
teria sido uma mentira. **A única forma de nunca vazar é NUNCA TER.**

A lei é defendida em **três camadas**, de propósito:

1. ⭐ **O gatilho** (`guard_report_insert`) **descarta `auth.uid()`** no
   nascimento quando a denúncia é anônima — o valor não chega à coluna.
2. ⭐ **A CHECK constraint** (`whistle_reports_anon_has_no_reporter`): a própria
   tabela recusa uma linha anônima que traga um `reporter_id`.
3. ⭐ **A SELECT-policy**: a denúncia anônima não casa com ninguém
   (`reporter_id` null) — **nem o próprio autor a reencontra**, porque não há
   identidade a casar.

Há teste que prova: denúncia anônima tem `reporter_id` NULL **mesmo com um
usuário autenticado a submetendo**.

---

## 3. ⭐ A CONFIDENCIALIDADE MORA NA RLS

Duas mãos distintas, e a separação está na policy:

- Quem tem **`whistle.report.submit`** pode **denunciar**, e vê apenas a
  **PRÓPRIA** denúncia NÃO-anônima (para acompanhar).
- Quem tem **`whistle.report.handle`** (o **comitê de ética**) lê **TODAS** as
  denúncias e move o status.

Quem só denuncia não lê o canal dos outros. É a confidencialidade escrita na
RLS, não num filtro de tela.

---

## 4. ⭐ O RELATO CONGELA; SÓ O TRATAMENTO ANDA

A denúncia é um **relato de fato consumado** (a física do `occ`): o conteúdo
**CONGELA** no registro — assunto, descrição, categoria e a marca de anonimato
não se reescrevem depois. O que anda é o **tratamento**:

`open → under_review → resolved` / `dismissed`

Os dois fins são **TERMINAIS**, e **exigem desfecho escrito** (`resolution`) —
arquivar sem apurar é apagar com outro nome. Carimbo pelo servidor. Sem DELETE:
denúncia é registro eterno.

⚠️ **O relato NUNCA passeia no correio.** O envelope carrega só metadado seguro
(categoria, status, se é anônima) — nunca o texto do relato, nunca o
denunciante.

⛔ FORA: anexo/evidência (Storage do Core, não construído — `description` é
texto); notificação ao denunciante (Engine de Notificações); júri/votação de
comitê estruturado.

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — Domain GRC).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §32).

- `supabase/migrations/0092_whistle.sql` — `whistle.reports`, RLS confidencial
  (comitê lê tudo, denunciante vê a própria não-anônima), o anonimato em três
  camadas (gatilho + CHECK + SELECT-policy), relato congelado, ciclo
  `open → under_review → resolved/dismissed` com desfecho obrigatório. Envelope
  sem relato nem denunciante.
- `packages/whistle` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, guarda do
  anonimato) e testes.
- Seed: cartão 77 (`domain_key='grc'`). Catálogo **76 → 77**.

Permissões: `whistle.report.submit` · `whistle.report.handle`. Fatos:
`whistle.report.registered` · `.reviewed` · `.resolved` · `.dismissed`.
**`consumes` VAZIO** (Lei 7 — sem redeploy do `apps/api`).

⭐ **Ao aplicar (runbook §32):** expor o schema `whistle` na Data API; **sem
redeploy**.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
