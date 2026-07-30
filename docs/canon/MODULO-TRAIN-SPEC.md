# 🎓 MÓDULO 35 — TREINAMENTOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> **Missão Oito (Onda 5 — o Bloco de Pessoas).** `module_id` = `train`.
> Migration `0050_train.sql` · pacote `@alsham/training` · teste
> `40_train_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §21).**

---

## 0. AS DECISÕES DE CANON

- ⭐ **A identidade do `evt` (Módulo 11) reaproveitada para dentro de
  casa.** O evento universal já provou a física: nasce rascunho; publicar
  ABRE a inscrição; a lotação (capacidade opcional) recusa claro, nunca
  lista de espera silenciosa; a presença é ATO IMUTÁVEL, carimbado pelo
  servidor. Este módulo aplica a MESMA física à turma de treinamento — não
  reinventa, reaproveita.
- ⭐ **O DIVERGE assinado: a inscrição vai ALÉM da presença.** No `evt` a
  inscrição termina em `attended` — comparecer a um evento não tem
  "aproveitamento". Aqui existe um terceiro estado, `completed`: o
  colaborador TERMINOU o programa, com data carimbada e uma nota OPCIONAL
  (texto livre — o método de avaliação é do tenant, nunca escala numérica
  imposta pelo produto). Presença é fato de calendário; conclusão é fato de
  aprendizagem.
- ⭐ **Três tabelas, não duas — a diferença estrutural com o `evt`.**
  PROGRAMA (o curso, ex.: "Integração de Novos Colaboradores") agrupa
  várias TURMAS (as edições concretas, com data e vaga). Uma empresa
  RECICLA o mesmo programa em turmas diferentes ao longo do ano — o evento
  universal do `evt` não precisava desse nível porque não se repete com o
  mesmo conteúdo estruturado.
- ⭐ **`active ↔ archived` no PROGRAMA — a física do `spc`, não do `hr`.**
  Um programa arquivado é o MESMO programa e pode voltar a rodar turmas (a
  física do espaço: "a sala reformada que reabre é a MESMA sala"), **não**
  a do `hr` (`terminated` é terminal). Arquivar não apaga as turmas já
  dadas.
- ⚠️ **Vínculo com pessoa: ID SOLTO + nome carimbado pela tela.**
  `trainee_id` é ID SOLTO (sem FK para `hr` ou qualquer schema alheio — a
  Lei do Lego); `trainee_name` é texto livre, como o `attendee_name` do
  `evt`. Nenhum CPF, dado de saúde ou bancário existe aqui.
- ⛔ **Certificado é Storage do Core — DECLARADO FORA (§5).** Emitir e
  guardar um documento de certificado exigiria armazenamento de arquivo,
  capacidade do Core não construída (Taxonomia §3). Este módulo registra a
  conclusão; gerar o documento é peça futura.

---

## 1. AS PEÇAS

- **`train.programs`** — o curso: `name`, `description`, `status`
  (`active`/`archived`, reversível — a física do `spc`). RLS
  `enable`+`force`; sem DELETE.
- **`train.sessions`** — a turma: `program_id` (FK dentro do próprio
  schema), `title`, `starts_at`, `capacity` (opcional), `status`
  (`draft`/`published`/`concluded`/`cancelled` — `concluded` e `cancelled`
  TERMINAIS, a física do `evt`). RLS `enable`+`force`; sem DELETE.
- **`train.enrollments`** — a inscrição: `session_id` (FK dentro do
  schema), `trainee_id` (ID SOLTO) + `trainee_name` (carimbado pela tela),
  `status` (`registered`/`attended`/`completed`/`cancelled` — `completed` e
  `cancelled` TERMINAIS), o ato da presença (`attended_at`/`by`), o ato da
  conclusão (`completed_at`/`by`) e a nota (`grade`, texto livre opcional).
  RLS `enable`+`force`; sem DELETE.

---

## 2. OS FATOS

`train.session.published` · `train.session.concluded` ·
`train.session.cancelled` · `train.enrollment.registered` ·
`train.attendance.recorded` (emitido quando a inscrição vai a `attended` —
**agregado `attendance`, não `enrollment`**, porque o fato é sobre a
presença, não sobre o registro) · `train.enrollment.completed` ·
`train.enrollment.cancelled`.

⭐ **Nem PROGRAMA nem a criação/edição de TURMA emitem evento.** Só as
transições de status de turma e inscrição — exatamente os sete fatos
acima. Nenhum evento a mais, nenhum a menos (Lei 7).

Os envelopes são autossuficientes: `session_payload` carrega o programa
pelo NOME (join feito no servidor, quem escuta não faz join);
`enrollment_payload` carrega a turma pelo título e o colaborador por ID
SOLTO + nome.

---

## 3. AS TELAS

Território de outra frente (a pele). O motor (`@alsham/training`) já
entrega a régua: `validateNewProgram`, `validateNewSession`,
`validateNewEnrollment`, `canTransitionSession`, `canTransitionEnrollment`,
`whyCannotEnroll`, `whyCannotRecordAttendance`, `summarizeSessions`,
`summarizeEnrollments`.

---

## 4. AS PERMISSÕES

- `train.setup.manage` — desenhar programas e turmas: publicar (abre
  inscrição), concluir e cancelar a turma.
- `train.enrollment.manage` — inscrever colaboradores, registrar presença
  (ato imutável) e a conclusão do programa.

Quem impede de verdade é a RLS; o menu é cortesia.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Certificado** — emissão e guarda de documento; exige Storage do Core,
  capacidade não construída (Taxonomia §3). A conclusão é registrada; o
  documento é peça futura.
- **Trilha de aprendizagem estruturada** (módulos, quizzes, LMS) — este
  módulo é cadastro de programa/turma/presença, não uma plataforma de
  ensino à distância.
- **Lista de espera** — a mesma decisão do `evt`: capacidade opcional,
  quando informada, recusa claro; lista de espera é capacidade futura
  declarada, não construída "por enquanto".
- **`consumes` VAZIO** — nenhum handler de Treinamentos existe nesta onda
  (Lei 7). Integração óbvia mas não construída: provisionar a admissão do
  `hr` como inscrição automática em turma de integração — futuro
  DECLARADO, sem handler e sem promessa.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado**
(runbook §21). A migration `0050_train.sql`, o pacote `@alsham/training`
(manifesto, tipos, motor e testes) e o teste SQL `40_train_isolation.sql`
existem no disco. `consumes` vazio. **Não aplicado em produção** — aplicar
é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §21`. Expor o schema `train` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
