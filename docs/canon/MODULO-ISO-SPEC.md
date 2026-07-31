# MODULO-ISO-SPEC — Módulo 66: Requisitos ISO

**Domain 🧪 Qualidade · capacidade _ISO_ · `module_id = iso` · schema `iso`**
Onda Quatorze (Fase 2). ⭐ **O QUARTO e ÚLTIMO módulo da onda** e o que fecha o
Domain Qualidade com 4 módulos próprios (`nc` · `audit` · `capa` · `iso`) — as
outras 3 capacidades (Indicadores, Documentos, Procedimentos) já são o
`goal`/`pol` e ficam DECLARADAS FORA. Migration `0081_iso.sql`, pacote
`@alsham/iso`, teste `71_iso_isolation.sql`.

---

## 1. O QUE É

Um requisito ISO é uma CLÁUSULA de norma que a empresa precisa cumprir — "ISO
9001:2015 — 8.5.1", "ISO 14001 — 6.1.2", "IATF 16949 — 8.3" — junto com o
julgamento de quão bem ela é cumprida hoje: a CONFORMIDADE. Uma peça só:
`iso.requirements` (a cláusula + a sua conformidade + o seu estado de
arquivamento). É o inventário vivo do que a certificação exige, e onde a empresa
está em relação a cada exigência.

## 2. A FÍSICA — as decisões de canon

- ⭐⭐ **A conformidade é MUTÁVEL — o DIVERGE de TODOS os módulos com ciclo de
  vida terminal, e POR QUÊ.** Os outros módulos desta onda têm um ciclo com fim
  (o `nc`: open→closed; o `audit`/`capa`: fins terminais). O requisito ISO **não
  tem ciclo de vida terminal**: a conformidade — `compliant` × `non_compliant` ×
  `not_applicable` — é uma AVALIAÇÃO que muda a cada auditoria. Hoje a cláusula
  8.5.1 está conforme; na auditoria que vem pode virar não conforme; num escopo
  diferente, não se aplica. Então **qualquer valor vai para qualquer valor**,
  quantas vezes for preciso. Copiar sem pensar e divergir sem escrever são o
  mesmo erro (CLAUDE.md): a pergunta "isto tem ciclo de vida?" foi refeita, e a
  resposta é NÃO. Não há `allowed_transition` de conformidade — nem no schema,
  nem no motor (`@alsham/iso` não exporta `canComplianceTransition` nem tabela de
  pares). Reavaliar é um UPDATE honesto. O contraste é assinado no
  `lifecycle.test.ts`, que prova a AUSÊNCIA de uma máquina de estados de
  conformidade.
- ⭐ **A norma é TEXTO LIVRE — dado do tenant, jamais lista fechada.**
  `clause_reference` é texto: cada empresa certifica a norma que quiser.
  Congelar as normas num enum faria o produto envelhecer com a edição da norma.
- ⭐ **`active ↔ archived` — o ciclo REVERSÍVEL de arquivamento (a física do
  `vendor`/`dc`/`pfolio`).** Uma cláusula que SAI de escopo quando a versão da
  norma muda é arquivada — e VOLTA se voltar ao escopo. É a MESMA cláusula, não
  um fim terminal: arquivar é metadado reversível. É OUTRO conceito, distinto da
  conformidade: um requisito tem um estado de arquivamento E uma conformidade, e
  os dois não se confundem.
- ⛔ **Cláusula ARQUIVADA não se reavalia.** Fora de escopo não tem conformidade
  a medir: só o restore (status → active) a devolve à avaliação. O gatilho de
  UPDATE recusa a reavaliação de um requisito arquivado.
- ⛔ **FORA (declarado):** anexo de evidência documental (Storage & Arquivos é
  capacidade do Core, NÃO CONSTRUÍDA); vínculo AUTOMÁTICO com `audit`/`nc` —
  cruzar na tela, porque módulo não conhece módulo. `consumes` VAZIO.

## 3. AS TELAS

`/iso` — placeholder por ora (o módulo vive no banco e no motor; a tela rica,
com a matriz de conformidade por cláusula, é frente de UI própria, sem dado
fabricado até lá).

## 4. OS FATOS

`iso.requirement.registered` · `iso.requirement.assessed` (a conformidade mudou)
· `iso.requirement.archived` · `iso.requirement.restored`. Payload
autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 5. ANTI-VIÉS

- A norma é texto livre: qualquer empresa de qualquer setor certifica a norma
  que precisar sem uma linha de código diferente — é produto, não configuração
  de um cliente.
- A conformidade mutável (não terminal) atende igualmente a quem audita uma vez
  por ano e a quem revisa toda semana: a régua não presume um ritmo de auditoria.
- Indicadores, Documentos de qualidade e Procedimentos NÃO viram tabela nova:
  são o `goal`/`pol`, e ficam DECLARADOS FORA (Sol Único).

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `iso` (`0081_iso.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/iso` | ✅ CONSTRUÍDO |
| Seed (cartão quality) | ✅ CONSTRUÍDO (cartão adicionado pelo dono) |
| Teste SQL `71_iso_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/iso` | ✅ CONSTRUÍDO (placeholder) |
| Anexo de evidência / vínculo automático audit·nc | ⛔ **NÃO CONSTRUÍDO** (§2) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §27`. Expor o schema `iso` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
