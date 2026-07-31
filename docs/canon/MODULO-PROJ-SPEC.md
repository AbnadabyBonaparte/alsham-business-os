# MODULO-PROJ-SPEC — Módulo 53: Projetos

**Domain 📋 PMO & Projetos · capacidade _Projetos_ · `module_id = proj` · schema `proj`**
Onda Doze parte 1/2 (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10
capacidades). Migration `0068_proj.sql`, pacote `@alsham/proj`, teste
`58_proj_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A física do encerramento é a do `bud`/`dem` — RE-PERGUNTADA.** O projeto
  nasce `planning`, vira `active`, e termina em `completed` ou `cancelled` — os
  dois TERMINAIS. O projeto encerrado NÃO reabre (o próximo é registro novo). É
  o DIVERGE dos módulos que reabrem (o `ops`/`sched`): reabrir um projeto
  fechado seria fingir que o encerramento não aconteceu. O contraste `proj ×
  dem` é assinado no `lifecycle.test.ts`.
- ⭐ **Concluir e cancelar não pedem a mesma coisa.** Cancelar (ABANDONAR) exige
  uma RAZÃO — abandonar precisa de porquê. Concluir tem uma nota OPCIONAL — o
  fim natural não se justifica. A assimetria é a decisão.
- ⭐ **Nome e descrição são TEXTO LIVRE** (anti-viés). O que é um "projeto" — uma
  obra, uma campanha, uma implantação — é vocabulário de cada casa.
- ⛔ **FORA:** orçamento consolidado do projeto (é o `pcost` desta mesma onda,
  módulo próprio, por id solto); aprovação formal de abertura (capacidade
  futura, seria o `recon` genérico por id solto); WBS/EAP estruturada.

## 1. AS PEÇAS

- `proj.projects` — o registro: `name` (texto livre, obrigatório), `description`
  (opcional), `status` (`planning`/`active`/`completed`/`cancelled`), nota de
  conclusão (opcional), razão do cancelamento (obrigatória ao cancelar), carimbos
  de ativação e fechamento (servidor).
- `proj.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/proj`.
- Gatilhos: nascimento sempre `planning` + autor do servidor; transição gated por
  `proj.project.manage`, carimbos de ativação/fechamento pelo servidor, cancelar
  exige razão; nome/descrição congelam depois do encerramento; emissão de fato.

## 2. OS FATOS

`proj.project.registered` · `proj.project.activated` · `proj.project.completed` ·
`proj.project.cancelled`. Payload autossuficiente. `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 3. AS TELAS

`/projetos` — placeholder por ora (o módulo vive no banco e no motor; a tela rica
é frente de UI própria).

## 4. AS PERMISSÕES

- `proj.project.manage` — criar/editar, iniciar, concluir e cancelar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Orçamento consolidado do projeto — é o `pcost` (livro) e/ou o `bud` genérico
  por id solto.
- Aprovação formal de abertura — capacidade futura (o `recon` genérico).
- WBS/EAP estruturada — próxima frente.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `proj` (`0068_proj.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/proj` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `58_proj_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/projetos` | ✅ CONSTRUÍDO (placeholder) |
| Orçamento / aprovação / WBS | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §25`. Expor o schema `proj` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
