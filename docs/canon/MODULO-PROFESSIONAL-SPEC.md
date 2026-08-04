# 💇 MÓDULO 98 — PROFISSIONAIS

## ALSHAM Business OS™ · Especificação do módulo · Vertical `beauty`

> **Vertical 💇 Beleza & Estética (Fase 3).** `module_id` = `professional`.
> Migration `0113_professional.sql` · pacote `@alsham/professional` · teste
> `103_professional_isolation.sql`. **ARQUIVO — apply é ato do dono. NÃO
> MERGEIE — o merge é do dono.**

---

## 0. AS DECISÕES DE CANON

- ⭐ **`active ↔ archived` reversível — o DIVERGE assinado do `hr`.** A pergunta
  foi refeita (copiar sem pensar e divergir sem escrever são o mesmo erro): o
  profissional do salão é GENTE CONTRATADA (a física do `hr`, onde `terminated`
  é TERMINAL — quem retorna assina contrato novo) ou RELAÇÃO que volta (a física
  do `vendor`/`mall`/`crm`)? É relação que volta. O salão vive de
  cadeira-alugada: o(a) cabeleireiro(a) autônomo(a) que sai e volta na temporada
  seguinte é a MESMA pessoa — e sequer é empregado(a), então nem sempre existe
  no `hr`. Obrigá-lo(a) a renascer partiria o histórico em dois. Por isso
  `archived → active` EXISTE, arquivar NÃO exige razão, e a linha arquivada NÃO
  congela. O contraste professional×hr fica assinado no teste de pacote (o
  `vendor` já assina a mesma família contra o `hr`).
- ⭐ **É um ROSTER PRÓPRIO, não uma projeção do `hr`.** Quando o profissional
  TAMBÉM é colaborador registrado, o cadastro de gente continua no `hr`,
  referenciado aqui por `hr_employee_id` — **ID SOLTO** (sem FK, OPCIONAL). Um
  id inexistente insere sem erro: a integridade daquele dado é do `hr`, não
  daqui. Este schema não lê `hr`, e a guarda SCHEMA_DE do CI reprova a leitura
  de schema alheio.
- ⭐ **UMA permissão só.** `professional.professional.manage` cobre registrar,
  editar, arquivar E reativar — o roster do salão não tem o par manage/decide do
  `mall`/`vendor`: cadastrar o profissional e movê-lo no arquivo são o mesmo
  ofício de recepção.
- ⭐ **Especialidade TEXTO LIVRE (anti-viés).** "cabeleireiro"/"manicure"/
  "esteticista"/"barbeiro" é vocabulário de cada casa; um enum congelaria a
  régua de um salão no schema de todos (a mesma Lei 3 do segmento do
  `vendor`/`mall`). OPCIONAL — um profissional sem especialidade é honesto.

---

## 1. AS PEÇAS

- `professional.professionals` — o roster. `name` (neutro, obrigatório),
  `specialty` (TEXTO LIVRE, default `''`), `hr_employee_id` (uuid, id solto
  OPCIONAL), `status` (`active`/`archived`, CHECK), o autor e as datas. Nasce
  sempre `active` (gatilho), o autor carimbado pelo servidor.
- `professional.allowed_transition(from, to)` — o ciclo de vida, espelho de
  `ALLOWED_TRANSITIONS` em `@alsham/professional`: `active ↔ archived`.

---

## 2. OS FATOS

- `professional.professional.registered` (v1) — um profissional entrou no roster.
- `professional.professional.archived` (v1) — saiu do roster vivo (reversível).
- `professional.professional.reactivated` (v1) — voltou ao roster (a MESMA
  pessoa). ⚠️ Verbo no passado, terminando em letra, sem underscore — o outbox
  recusa o resto.

O payload é AUTOSSUFICIENTE (`professional_payload`): quem escuta não faz join
com o `hr`.

---

## 3. AS TELAS

O roster: ativos primeiro, depois por nome (`orderProfessionals`). O motor do
pacote (`validateNewProfessional`, `summarize`, `canArchive`, `canReactivate`)
avisa antes com a MESMA régua da RLS/gatilho. A tela consome; nunca decide.

---

## 4. AS PERMISSÕES

- `professional.professional.manage` — registrar, editar, arquivar e reativar.

RLS: `enable` + `force`. Leitura por `professional.can_access(tenant_id)`;
escrita por `core.has_permission(tenant_id, 'professional.professional.manage')`.
Sem policy/grant de DELETE — arquivar é status. `professional.emit_event` não é
concedida ao cliente; `anon` não recebe nada.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- ⛔ **Agenda/Agendamento** — é a capacidade *Agendamento* do vertical (o `spc`
  genérico, por id solto), à parte.
- ⛔ **Comissões** — capacidade própria do vertical, futura (id solto ao roster).
- ⛔ **Folha/CPF/dado sensível** — é do `hr` genérico, e nem lá: o autônomo não
  tem vínculo trabalhista aqui.
- ⛔ **`consumes` VAZIO** — cruzar com `hr.employee.*` é integração futura
  (Lei 7). Sem handler, sem promessa.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO no Vertical Beleza** — **arquivo, ainda não aplicado**. A
migration `0113_professional.sql`, o pacote `@alsham/professional`, o teste
`103_professional_isolation.sql` e o cartão no seed (`0001_platform.sql`)
existem no disco. `consumes` vazio. **Não aplicado em produção** — aplicar é ato
do dono.

---

## 7. APPLY (dono)

Expor o schema `professional` na Data API. `consumes` vazio → **sem redeploy do
`apps/api`**. Vínculo ao `hr` por ID SOLTO — o mapa SCHEMA_DE do CI reprova a
leitura de schema alheio. Nenhuma FK cruzada, nenhum objeto fora de
`professional`.
