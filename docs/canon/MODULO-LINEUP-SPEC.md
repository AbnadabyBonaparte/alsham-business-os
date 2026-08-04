# MODULO-LINEUP-SPEC — Módulo 95: Programação/line-up

**Vertical 🎪 Eventos · capacidade _Programação/line-up_ · `module_id = lineup` · schema `lineup`**
Onda Eventos (Fase 3 — o Vertical 🎪 Eventos, "vertical viva: Events OS™"). O
SEGUNDO dos três módulos construídos da onda (`accred` · **`lineup`** · `sponsor`).
Migration `0110_lineup.sql`, pacote `@alsham/lineup`, teste
`100_lineup_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A DECISÃO ASSINADA: a agenda é PLANO MUTÁVEL, não livro imutável.** Um
  item de line-up (`lineup.slots`) é uma atração/sessão/palestra no programa de
  um evento. A pergunta é a do CLAUDE.md: ele é FATO CONSUMADO (imutável, como o
  `recv`/`pcost`/a vistoria do `sec`) ou é PLANO (mutável, como a aresta do
  `gantt` e o reagendamento do `edcal`)? **Resposta: PLANO MUTÁVEL, e a linha se
  APAGA.** O programa muda até (e durante) o dia — a palestra troca de palco, o
  horário desliza, a banda cancela e outra entra. É a MESMA física do `gantt`
  ("a dependência é metadado do plano — some quando o plano muda") e do `edcal`
  ("o calendário é PLANO, não fato"). Logo: o item é livremente EDITÁVEL e
  APAGÁVEL (há GRANT de DELETE — a única forma honesta de "removi a atração da
  grade").
  - **O contraste com o `sched` (a referência primária):** o marco do `sched`
    carrega uma MÁQUINA DE ESTADOS (`planned → done/cancelled`, com o reabrir)
    porque um marco tem um FIM que se atinge. Uma atração de line-up NÃO tem
    ciclo de vida — não existe "line-up concluído": existe a grade, que se edita
    e reordena até não fazer mais sentido, e então se apaga. Por isso ⛔ **NÃO
    há coluna `status`, NÃO há `create type lineup.…`, NÃO há
    `allowed_transition`.** Copiar o ciclo do `sched` "por consistência" seria o
    erro que o canon proíbe. A lei vive no schema e no pacote **por AUSÊNCIA** de
    máquina de estados, e um teste assina a ausência (o pacote não exporta
    `ALLOWED_TRANSITIONS`/`canComplete`/`canCancel`; os tipos não declaram
    `SlotStatus`; a migration não tem `allowed_transition`).
- ⭐ **O evento entra por ID SOLTO.** O item aponta o evento (o módulo universal
  de eventos, Módulo 11) por `event_id` (sem FK) + `event_name` carimbado pela
  tela. A migration NÃO referencia o schema daquele módulo (módulo não conhece
  módulo — a Lei do Lego). O nome carimbado é o que faz a grade sobreviver ao
  redesenho do cadastro de evento. ⛔ **O vínculo CONGELA na criação** (mudar de
  evento seria outra atração, em outra grade) — o gatilho recusa a troca.
- ⭐ **Título, palco/trilha e atração são TEXTO LIVRE; o horário é OPCIONAL**
  (anti-viés). O que é um "item" — uma trilha de congresso, um palco de festival,
  uma sessão de workshop — é vocabulário de cada casa, e o programa pode nascer
  **TBD** ("a definir"), sem horário. A física do intervalo (sem início não há
  fim; o fim não antecede o início) é uma constraint.
- ⭐ **A ordenação é MANUAL** (`position`) — a leitura ordena por posição, depois
  por horário (os sem horário ao fim), depois por título. É o `orderSlots()` do
  pacote, espelho do índice `lineup_slots_agenda_idx`.
- ⚠️ **Os fatos são dois: `lineup.slot.registered` e `lineup.slot.updated`.** O
  outbox exige verbo no passado terminando em `ed`, sem underscore. Não há fato
  de "conclusão" — o item não conclui, se edita: a edição é o fato.
- ⛔ **FORA:** ingressos/QR/credenciamento/check-in/patrocínio (outras
  capacidades do vertical — ver `ONDA-EVENTOS-DECISOES.md`); tipo de evento (é o
  módulo universal, por id solto); enum de palco/trilha; vínculo FK ao evento.

## 1. AS PEÇAS

- `lineup.slots` — o item da grade: `event_id` (id solto, obrigatório) +
  `event_name` (carimbado pela tela), `title` (texto livre, obrigatório),
  `stage` (texto livre, opcional), `starts_at`/`ends_at` (opcionais — TBD),
  `performer` (texto livre, opcional), `position` (inteiro >= 0). MUTÁVEL e
  APAGÁVEL — sem `status`, sem ciclo de vida.
- Gatilhos: nascimento com autor do servidor (`created_by`); `updated_at`
  tocado no update; ⛔ o vínculo com o evento CONGELA; emissão dos dois fatos.
- Constraint `lineup_slots_window_coherent` — a física do intervalo.

## 2. OS FATOS

`lineup.slot.registered` (o item nasceu) · `lineup.slot.updated` (o item mudou —
a agenda é plano, a edição é o fato). Payload autossuficiente (inclui
`eventId`/`eventName`). `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/programacao` — placeholder por ora (o módulo vive no banco e no motor; a grade
rica, arrastável, é frente de UI própria). Parent faz o stub + o menu.

## 4. AS PERMISSÕES

- `lineup.slot.manage` — criar, editar, reordenar e **remover** itens da grade.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Ingressos, credenciamento, check-in, patrocínio — outras capacidades do
  vertical (ver `ONDA-EVENTOS-DECISOES.md`; parte FORA por Lei 3 /
  `canta-siriema`, parte nos módulos `accred`/`sponsor`).
- Grade arrastável (drag-and-drop) — próxima frente de UI.
- Conflito de horário/palco (dois itens no mesmo palco ao mesmo tempo) — a
  física de EXCLUSION do `spc`/`shift` re-perguntada; próxima frente, sem
  promessa (Lei 7).

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `lineup` (`0110_lineup.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/lineup` | ✅ CONSTRUÍDO |
| Teste SQL `100_lineup_isolation.sql` | ✅ CONSTRUÍDO |
| Seed (cartão events) | ⏳ wiring do parent (a onda registra os 3 juntos) |
| Store-taxonomy (chave `events`) | ✅ já existe |
| Portal `/programacao` | ⏳ stub do parent |
| Grade arrastável / conflito de horário | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

Expor o schema `lineup` na Data API. `consumes` vazio → sem redeploy do
`apps/api`. Ver `ONDA-EVENTOS-DECISOES.md`.
