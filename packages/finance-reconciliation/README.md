# packages/finance-reconciliation · `@alsham/finance-reconciliation`

**Módulo 1 — Conciliação & Aprovações.** O primeiro módulo de produto sobre o Core, e a prova de que o Lego funciona.

**Taxonomia:** Domain `finance` (§5, Financeiro). Implementa **2** das 19 capacidades: *Conciliação bancária* e *Aprovações financeiras*. As outras 17 não existem e não estão declaradas (Lei 7).

**Fase do roadmap:** Fase 3 — Smart Reconciliation™.

---

## O que este pacote é

**Contrato + domínio puro.**

| Arquivo | O que é |
|---|---|
| `src/manifest.ts` | o `ModuleManifest` — como o módulo se declara ao Core |
| `src/types.ts` | os tipos do domínio, espelhando `0002_recon.sql` |
| `src/matching.ts` | o motor de sugestão de baixa — determinístico, sem I/O |
| `src/matching.test.ts` | 28 testes, `node --test` (zero dependência de teste) |

## O que este pacote **não** é

Não tem UI. Não abre conexão de banco. Não chama rede. **Não importa nenhum outro módulo** — a única dependência é `@alsham/core`, que é contrato de tipos e nem runtime tem.

O **parser de OFX/CSV mora aqui** (`src/parsing/`, 35 testes) — ler extrato é decidir o que é data, valor e sinal, e isso é regra de negócio, não tela. O que ele recebe é texto e o que devolve é domínio: não abre arquivo, não lê disco.

Fora daqui, e de propósito: as **telas** (`apps/portal`) e o **adaptador de banco** (`apps/portal/src/lib/data/`). Leitor de **CAMT.053**: **NÃO CONSTRUÍDO** — o parser recusa com mensagem clara em vez de tentar adivinhar.

---

## As quatro regras que este módulo não quebra

1. **Não cria nada no schema `core`.** Todo objeto nasce em `recon`.
2. **Não conhece outro módulo.** A única porta para fora é `recon.emit_event()`, que escreve na caixa de saída do Core.
3. **Não lê tabela de outro módulo.** `recon.payables` é **projeção local**, alimentada por importação ou por evento.
4. **Depende só do Core.** `requiresCore` é o único campo de dependência que o `ModuleManifest` tem.

## Permissões que registra

| Chave | O que libera |
|---|---|
| `recon.statement.import` | importar extratos e títulos |
| `recon.match.manage` | criar, ajustar e desfazer casamentos |
| `recon.approval.decide` | aprovar ou rejeitar itens da fila |

As duas últimas são separadas de propósito: **quem concilia não precisa ser quem visa.** Uma empresa que queira a mesma pessoa põe as duas no mesmo papel — o produto permite, mas não presume.

## Eventos que emite

`recon.reconciliation.completed` · `recon.approval.decided` · `recon.statement.discarded`

Consome: **nada, hoje.** O schema já prevê alimentar `payables` por `finance.payable.registered`, mas o handler está **NÃO CONSTRUÍDO** — declarar consumo sem consumidor seria promessa no ar (Lei 7).

---

## Onde a Lei anti-viés vive

`suggestMatches()` recebe `MatchingSettings` como **parâmetro**, e não tem valor padrão embutido. Tolerância de valor, tolerância de data e limiar de score vêm de `core.tenant_modules.settings` — uma empresa aceita casar automático a 0.95, outra exige 0.99, outra não aceita nada sem humano olhar.

Há um teste que passa o **mesmo par** com duas configurações e verifica que o resultado muda. Se alguém amarrar um limiar no código um dia, esse teste quebra.

A lista completa do que virou `settings` e por quê está em [`docs/canon/MODULO-RECON-SPEC.md`](../../docs/canon/MODULO-RECON-SPEC.md) §6.

---

## Comandos

```bash
pnpm typecheck   # da raiz — cobre este pacote
pnpm test        # da raiz — 28 testes
```

**Status:** ✅ **CONSTRUÍDO como contrato + domínio.** Sem UI, sem banco, sem parser.
