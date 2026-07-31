# MODULO-SOP-SPEC — Módulo 49: S&OP / Rodadas de Consenso

**Domain 🔗 Supply Chain · capacidade _S&OP_ · `module_id = sop` · schema `sop`**
Onda Onze (Fase 2 — o Domain Supply Chain, SEPARADO de Compras — Taxonomia §5).
Migration `0064_sop.sql`, pacote `@alsham/sop`, teste `56_sop_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **NÃO É O PLANO DE NOVO — É A GOVERNANÇA SOBRE O PLANO.** O Módulo 48
  (Planejamento de Demanda) É o plano: linhas planejadas, publicar congela as
  linhas. A rodada de S&OP é a **CAMADA DE CONSENSO** por cima dele. Ela
  **referencia** um plano por **ID SOLTO** (`plan_id uuid`, sem FK) + nome
  carimbado (`plan_name`, o padrão do `deal`): a governança não conhece o schema
  do plano, não lê tabela alheia e não o importa. A migration `0064_sop.sql`
  NÃO menciona o schema do plano em lugar nenhum — e um teste (`lifecycle.test`)
  confere que a palavra do outro schema não aparece ali. Copiar sem pensar e
  divergir sem escrever são o mesmo erro: cada decisão foi refeita.
- ⭐ **A separação de poderes é o ponto — `sop.round.approve` é permissão
  SEPARADA de quem desenha.** Quem RASCUNHA a rodada (juntar áreas, montar a
  pauta) usa `sop.round.manage` — ato de operação. Quem APROVA o consenso usa
  `sop.round.approve` — papel tipicamente mais sênior, o carimbo de governança
  que fecha o alinhamento entre vendas, produção e finanças. Fundir as duas
  apagaria a separação que a rodada existe para representar. `can_access` = OR
  das duas; o gate de `approved` vive no gatilho de transição; o aprovador +
  `approved_at` são carimbados pelo SERVIDOR (o valor da tela é descartado).
- ⭐ **APROVAR CONGELA — a física do documento que decide.** Nasce `draft`;
  `draft→approved` (TERMINAL) e `draft→cancelled` (TERMINAL, com razão). A
  aprovada não anda mais — a próxima rodada é rodada nova. O consenso é
  REGISTRADO por gente (aprovado), não calculado.
- ⭐ **Uma coerência de estado na CONSTRAINT:** `status='approved'` ⇔
  `approved_at is not null`. Fora de `approved`, não há carimbo. Estado e
  carimbo contam a mesma história ou um mente.
- ⭐ **O período é TEXTO LIVRE** (anti-viés). "Q1 2027", "Ciclo Março/2027" é
  vocabulário de cada empresa — nunca enum.
- ⭐ **Sem tabela de linhas, de propósito** (o DIVERGE do plano): a rodada é um
  cabeçalho + uma DECISÃO de consenso; o conteúdo detalhado vive no plano
  referenciado por id solto, não se copia para cá.

## 1. AS PEÇAS

- `sop.rounds` — a rodada: `period` (texto livre, obrigatório), `title`
  (opcional), `plan_id` (uuid, id SOLTO, nullable — sem FK), `plan_name`
  (carimbado pela tela, opcional), `status`
  (`draft`/`approved`/`cancelled`), `cancel_reason`, carimbo do consenso
  (servidor). Constraint de coerência da aprovação. **Sem tabela de linhas.**
- `sop.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/sop`:
  `draft→approved`, `draft→cancelled`.
- Gatilhos: nascimento sempre rascunho + autor do servidor; transição para
  `approved` gated por `sop.round.approve` (carimba `approved_at`/`approved_by`);
  cancelamento gated por `sop.round.manage` (exige razão); conteúdo (período,
  título, vínculo com o plano) congela fora do rascunho; emissão de fato.

## 2. OS FATOS

`sop.round.registered` (insert) · `sop.round.approved` (→approved) ·
`sop.round.cancelled` (→cancelled). Payload autossuficiente: período, título, o
vínculo SOLTO com o plano (id + nome) e o carimbo do consenso — **nunca as
linhas do plano** (a governança não copia conteúdo alheio). `consumes` VAZIO
(sem redeploy do `apps/api`).

## 3. AS TELAS

`/sop` — placeholder por ora (o módulo vive no banco e no motor; a tela rica é
frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `sop.round.manage` — criar/editar rascunho, vincular o plano de demanda e
  cancelar (com razão).
- `sop.round.approve` — **aprovar** o consenso (o carimbo de governança, papel
  mais sênior do que desenhar).
- `sop.can_access` = OR das duas.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Reconciliação automática de múltiplas áreas** (vendas × produção ×
  finanças) — isso consumiria eventos de outros módulos por handler real (Lei 7
  — não construído). Aqui o consenso é REGISTRADO por gente, não calculado.
- FK ao plano de demanda — o vínculo é ID SOLTO, de propósito.
- Coleta estruturada de números por área, versionamento de cenários — capacidade
  futura.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `sop` (`0064_sop.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/sop` | ✅ CONSTRUÍDO |
| Seed (cartão supply-chain) | ✅ CONSTRUÍDO |
| Teste SQL `56_sop_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/sop` | ✅ CONSTRUÍDO (placeholder) |
| Reconciliação automática de áreas | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §24`. Expor o schema `sop` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
