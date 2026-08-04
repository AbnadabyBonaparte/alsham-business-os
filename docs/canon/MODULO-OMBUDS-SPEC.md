# MÓDULO 86 — Ouvidoria (`ombuds`)

> Vertical 🏛 **Governo** (`government`) · Onda Governo (Fase 3) · migration `0106_ombuds.sql` · pacote `@alsham/ombuds`
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

A **Ouvidoria** do órgão público (Lei 13.460/2017) — o canal pelo qual o
**cidadão** se dirige à Administração: um cidadão registra uma **manifestação**
(reclamação, denúncia, sugestão, elogio ou informação), com **assunto**,
**natureza** e **descrição**, podendo fazê-lo **anônima** ou identificadamente.
Um setor de **ouvidoria** trata cada manifestação até uma resposta.

Cada manifestação recebe um **protocolo público** (carimbo do servidor) que o
cidadão — inclusive o anônimo — cita para acompanhar.

---

## 2. ⭐⭐ A FÍSICA CENTRAL — O ANONIMATO, REAPROVEITADO DO `whistle`

A física do anonimato é **exatamente** a do `whistle` (Módulo 77, Canal de
Denúncias), e reaproveitá-la é lícito e consciente — o precedente `spc → shift` /
`fund`: **duplicar física é correto quando o ESCOPO diverge e cada decisão é
re-perguntada e reescrita** (nunca cópia cega).

> **Se a manifestação é anônima, o sistema NUNCA registra quem se manifestou.**

Não é "não mostra" — é **NÃO GRAVA**. O cidadão está autenticado (é um membro do
tenant), mas quando `is_anonymous`, o `reporter_id` fica **NULL para sempre**.
Guardar quem se manifestou e só "esconder na tela" seria uma bomba: um
vazamento, uma ordem judicial, um servidor curioso. **A única forma de nunca
vazar é NUNCA TER.**

A lei é defendida em **três camadas**, de propósito (as mesmas do `whistle`):

1. ⭐ **O gatilho** (`guard_manifestation_insert`) **descarta `auth.uid()`** no
   nascimento quando a manifestação é anônima — o valor não chega à coluna.
2. ⭐ **A CHECK constraint** (`ombuds_manifestations_anon_has_no_reporter`): a
   própria tabela recusa uma linha anônima que traga um `reporter_id`.
3. ⭐ **A SELECT-policy**: a manifestação anônima não casa com ninguém
   (`reporter_id` null) — **nem o próprio autor a reencontra** pela RLS.

Há teste que prova: manifestação anônima tem `reporter_id` NULL **mesmo com um
cidadão autenticado a submetendo**.

⭐ **O PROTOCOLO público** é o carimbo do servidor que substitui o `reporter_id`
que a lei do anonimato apagou: é por ele que o cidadão anônimo acompanha. A
**consulta pública por protocolo** é integração **FUTURA** via API com chave
(padrão `nps`/Forja) — ⛔ `anon` **NÃO** ganha grant aqui.

---

## 3. ⭐ O DIVERGE DO `whistle` (RE-PERGUNTADO E ASSINADO)

| Eixo | `whistle` (Módulo 77) | `ombuds` (Módulo 86) |
|---|---|---|
| **Escopo** | GRC — colaborador → má-conduta interna (comitê de ética) | Vertical Governo — cidadão → órgão público (Lei 13.460) |
| **Classificação** | `category` texto livre | **`manifestation_type` CHECK** — as 5 naturezas da Lei 13.460 |
| **Identidade pública** | — (o identificado reencontra pela RLS) | **`protocol`** público (o anônimo acompanha por ele) |
| **Nomes do ciclo** | `open → under_review → resolved/dismissed` | `received → under_review → answered/dismissed` |

- **`manifestation_type`** é FÍSICA DO MÉTODO (a Lei 13.460 define o rol das 5
  naturezas: `complaint`/`report`/`suggestion`/`compliment`/`information`), não
  vocabulário de casa — por isso um CHECK, a lição do `nps` (0–10) e do `mnt`
  (corretiva/preventiva).
- **Nomes adaptados:** a máquina de estados tem a MESMA forma do `whistle`; só os
  nomes falam a língua da Lei 13.460 — a manifestação é **recebida** (protocolada)
  e **respondida**. Adaptação consciente, não cópia cega.

---

## 4. ⭐ A CONFIDENCIALIDADE MORA NA RLS · O RELATO CONGELA

Duas mãos distintas, a separação na policy (o padrão do `whistle`):

- Quem tem **`ombuds.manifestation.submit`** pode **se manifestar**, e vê apenas
  a **PRÓPRIA** manifestação NÃO-anônima (para acompanhar).
- Quem tem **`ombuds.manifestation.handle`** (a **ouvidoria**) lê **TODAS** as
  manifestações e move o status.

A manifestação é um **relato de fato consumado**: o conteúdo **CONGELA** no
registro — assunto, descrição, natureza, a marca de anonimato e o protocolo não
se reescrevem depois. O que anda é o **tratamento**:

`received → under_review → answered` / `dismissed`

Os dois fins são **TERMINAIS**, e **exigem resposta escrita** (`response`) —
arquivar sem responder é apagar com outro nome. Carimbo (`answered_at`/
`answered_by`) pelo servidor. Sem DELETE: manifestação é registro eterno.

⚠️ **O relato NUNCA passeia no correio.** O envelope carrega só metadado seguro
(natureza, status, se é anônima, o protocolo público) — nunca o texto do relato,
nunca o cidadão.

⛔ FORA: anexo/evidência (Storage do Core, não construído — `description` é
texto); notificação ao cidadão (Engine de Notificações); consulta pública anônima
por protocolo (integração futura via API com chave).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Governo (Fase 3 — Vertical Governo).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono.

- `supabase/migrations/0106_ombuds.sql` — `ombuds.manifestations`, RLS
  confidencial (a ouvidoria lê tudo, o cidadão vê a própria não-anônima), o
  anonimato em três camadas (gatilho + CHECK + SELECT-policy), o protocolo
  público carimbado pelo servidor, o relato congelado, `manifestation_type` CHECK
  (as 5 da Lei 13.460), ciclo `received → under_review → answered/dismissed` com
  resposta obrigatória. Envelope sem relato nem cidadão.
- `packages/ombuds` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, guarda do
  anonimato `redactReporter`, `MANIFESTATION_TYPES`) e testes.
- Seed: cartão 86 (`vertical_key='government'`).

Permissões: `ombuds.manifestation.submit` · `ombuds.manifestation.handle`.
Fatos: `ombuds.manifestation.registered` · `.reviewed` · `.answered` ·
`.dismissed`. **`consumes` VAZIO** (Lei 7 — sem redeploy do `apps/api`).

⭐ **Ao aplicar:** expor o schema `ombuds` na Data API; **sem redeploy**.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
