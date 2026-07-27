# packages/marketing · `@alsham/marketing`

**Módulo 2 — Campanhas de Marketing.** Domain `marketing` (Taxonomia §5).

**Fase do roadmap:** Fase 6 — Marketing.

**Status:** ✅ **CONSTRUÍDO** — manifesto, máquina de estados da campanha e o handler que consome o fato de outro módulo. 34 testes.

---

## ⭐ Por que ele existe: a prova do Lego

O Módulo 1 provou que um módulo não toca o Core indevidamente. Este prova o nível seguinte — **dois módulos coexistindo, um reagindo ao fato do outro, sem que nenhum conheça o outro.**

Enquanto houvesse um módulo só, "o Lego funciona" era afirmação sobre o futuro.

## O que este pacote **não** é

Não tem UI. Não abre conexão de banco. Não chama rede.

E, o que importa mais aqui: **não importa `@alsham/finance-reconciliation`.** Confira — não está no `package.json`, não está em nenhum `import`, e `0004_marketing.sql` não tem um `select` sequer em `recon.*`. Há guarda no CI que reprova as três formas.

## O consumo, em uma frase

Ele escuta `recon.approval.decided` e guarda a **cópia local** da decisão, montada só com o que veio no payload. Quando a referência bate com a `budget_ref` de uma campanha, a campanha fica sabendo — ninguém digita nada.

O único acoplamento é a **string do tipo do evento**: contrato público, como um cabeçalho HTTP. Se ninguém emitir aquele tipo, este módulo não é acordado e nada quebra.

E o handler lê `producedBy` do **envelope**, não de uma constante — no dia em que um Contas a Pagar emitir o mesmo formato, é atendido sem uma linha a mais.

## Onde mora cada garantia

| Garantia | Quem dá |
|---|---|
| uma entrega por consumidor | o correio (`processed_events`) — **não reimplementado aqui** |
| o fato não conta duas vezes | `unique (tenant_id, source_module_id, external_ref)` no banco |
| o cliente não forja aprovação | ausência de policy de escrita em `spend_approvals` |
| quem cria não publica | trigger `campaigns_guard_publish` — policy não vê o `old` |

## A Lei anti-viés, onde ela dói

Exigir verba aprovada antes de publicar é o processo de **algumas** empresas. Virou `settings.publishing.requireBudgetClearance`, com **default `false`** — e há teste provando que o default não exige nada. Se fosse um `if` sem configuração, o produto teria adotado a burocracia de um cliente.

Também não existem aqui: enum de canal, tipo de campanha, segmentação estruturada, ROI. Ver [`docs/canon/MODULO-MARKETING-SPEC.md §4`](../../docs/canon/MODULO-MARKETING-SPEC.md).

## ⚠️ O que este módulo NÃO faz

**Não publica em rede social.** "Publicar" muda o estado e conta o fato à plataforma; não posta em lugar nenhum. Integrar canal é Lei 3 (Construir × INTEGRAR) e é decisão de dono.

## Testes

```bash
pnpm test    # da raiz
```

`consumption.test.ts` roda o **correio de verdade** entregando ao handler de verdade — `@alsham/workflow` entra como devDependency porque esse arquivo faz o papel da composição, não do módulo.
