# MODULO-CAPA-SPEC — Módulo 65: Ações Corretivas e Preventivas (CAPA)

**Domain 🧪 Qualidade · capacidade _CAPA_ · `module_id = capa` · schema `capa`**
Onda Quatorze (Fase 2 — abre o Domain Qualidade). É o **TERCEIRO** cartão da
onda. Migration `0080_capa.sql`, pacote `@alsham/capa`, teste de isolamento no
CI. `consumes` VAZIO.

---

## 0. AS DECISÕES DE CANON

- ⭐ **O que este módulo É:** o registro das ações corretivas e preventivas —
  uma ação que se PLANEJA, se EXECUTA e, o que a define, se VERIFICA (alguém
  confirma que ela funcionou). CAPA = _Corrective And Preventive Action_.
- ⭐ **O TIPO é CHECK, não texto do tenant.** `corrective` × `preventive` é a
  FÍSICA do MÉTODO CAPA — a norma o define, não é vocabulário de uma casa. É a
  lição do `mnt` (corretiva/preventiva) e do `nps` (0–10): quando o valor é do
  método e não da empresa, ele é CHECK. Corretiva nasce de um desvio já
  ocorrido; preventiva evita um que ainda não ocorreu.
- ⭐ **O ciclo `open → verified → closed` foi ESCOLHIDO de propósito** — e não o
  `open → closed` direto. Copiar sem pensar e divergir sem escrever são o mesmo
  erro (CLAUDE.md): a pergunta foi refeita. Uma CAPA é um marco de cronograma
  (`sched`, que só é "feito") ou algo mais? É mais: **sem passar por `verified`,
  não fecha.** A VERIFICAÇÃO — a nota de quem confirmou que a ação pegou — é
  exatamente o que separa este módulo de um marco genérico. Permitir fechar
  direto reduziria a CAPA a um "feito" sem prova, que é o que a norma proíbe.
- ⭐ **`closed` é TERMINAL** (a física do `proj`): não há "reabrir". Uma ação
  que volta é ação nova. O plano é EDITÁVEL enquanto `open`; ao ser verificado,
  congela — a partir dali só o fechamento.
- ⭐ **A verificação carimba QUEM pelo servidor** (o digitado é descartado), a
  mesma lei do `care`/`occ`.

---

## 1. AS PEÇAS

- `capa.actions` — a ação. `action_type` (CHECK `corrective`/`preventive`),
  `description` e `responsible` em texto livre, `due_date` (data, opcional),
  `nc_entry_id` (ID SOLTO ao Módulo 63, opcional), `status`
  (`open`/`verified`/`closed`), `verification_note` + os carimbos
  `verified_at`/`verified_by`/`closed_at`/`closed_by`.

O motor `@alsham/capa` é o espelho puro: `ALLOWED_TRANSITIONS`
(`open→verified→closed`), `canVerify`/`canClose`, `orderActions`,
`summarizeActions`, `validateNewAction` (o tipo recusa qualquer valor fora dos
dois) e `validateVerification` (a nota é obrigatória).

## 2. A FÍSICA

- ⭐ **O tipo é CHECK** — `action_type in ('corrective', 'preventive')` na
  migration; **sem `create type capa.*`**. A física do método, não um enum de
  vocabulário. Um teste lê a migration e confere.
- ⭐ **O ciclo de 3 estados, sem `open → closed`.** `capa.allowed_transition()`
  declara SÓ `('open','verified')` e `('verified','closed')`. O
  `lifecycle.test.ts` lê a migration e prova que o atalho não existe: sem
  verificação, não fecha. `closed` é terminal — o gatilho recusa qualquer
  UPDATE de uma ação fechada.
- ⭐ **Verificar exige a nota E carimba QUEM** pelo servidor; o plano não se
  edita junto de uma transição (uma coisa de cada vez), e o carimbo não se forja
  por UPDATE de plano.
- ⭐ **Vínculo ao `nc` por ID SOLTO** (`nc_entry_id uuid`, sem FK cross-schema):
  a ação pode nascer de uma NC (corretiva) ou ser preventiva sem NC nenhuma.
- ⛔ **FORA:** eficácia medida por indicador (é o `goal`); anexo de evidência
  (Storage do Core, NÃO CONSTRUÍDA — `nc_entry_id` e as notas são texto/id, não
  arquivo); workflow de aprovação multinível (é configuração do tenant). O
  `consumes` é VAZIO.

## 3. AS TELAS

A rota `/capa` existe como placeholder honesto (o módulo vive no banco e no
motor; nenhum dado fabricado). A tela rica — o quadro por estado (aberta →
verificada → fechada), o formulário com o tipo CHECK e o campo de nota de
verificação — é frente de UI à parte.

## 4. OS FATOS

- `capa.action.opened` — a ação foi aberta (sempre `open`).
- `capa.action.verified` — a ação foi verificada (a nota de quem confirmou).
- `capa.action.closed` — a ação foi fechada. Terminal.

O envelope é AUTOSSUFICIENTE (o `nc` por id solto); quem escuta não faz join.

## 5. ANTI-VIÉS

> _"Outra empresa do mesmo setor usaria isso exatamente como está?"_

Sim. Toda casa com um sistema de qualidade abre ações corretivas e preventivas,
e a norma define os dois tipos e a exigência de verificação de eficácia — não é
recorte de um cliente. O que É de cada casa (a descrição da ação, o responsável,
o prazo, de qual NC a ação nasceu) é texto livre / id solto, nunca coluna
rígida. Por isso o tipo é CHECK (do método) e o resto é dado do tenant.

## 6. ESTADO DA OBRA

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `capa` (`0080_capa.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/capa` | ✅ CONSTRUÍDO |
| Seed (cartão quality) | ⛔ **NÃO CONSTRUÍDO** — cartão adicionado pelo dono |
| Teste SQL de isolamento + CI | ⛔ **NÃO CONSTRUÍDO** |
| Portal `/capa` | ✅ CONSTRUÍDO (placeholder) |
| Eficácia por indicador · anexo · workflow multinível | ⛔ **NÃO CONSTRUÍDO** (§2) |

**Apply (dono):** `docs/runbook/APLICAR.md §27`. Expor o schema `capa` na Data
API. `consumes` vazio → sem redeploy do `apps/api`.
