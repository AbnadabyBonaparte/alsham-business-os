# `@alsham/ops` — Módulo 7: Esteira de Produção

> Especificação completa: [`docs/canon/MODULO-OPS-SPEC.md`](../../docs/canon/MODULO-OPS-SPEC.md)

**Domínio PURO.** Nem banco, nem rede, nem relógio, nem UI.

| Onde | O quê |
|---|---|
| `src/manifest.ts` | o `ModuleManifest` — e as duas decisões de canon, com a razão |
| `src/order.ts` | ciclo de vida, leitura da esteira, quadro, versionamento |
| `src/types.ts` | os tipos — e a **ausência** de qualquer nome de etapa |

---

## ⭐ A Lei das Etapas vive aqui **por ausência**

Procure neste pacote por um `type Stage = 'briefing' | 'criação' | …`.

Não existe, e não pode existir. **A etapa é dado do tenant** — uma linha de
`ops.pipeline_stages` com o nome que a empresa escolheu. O dia em que alguém
escrever esse tipo aqui é o dia em que o produto passa a vender o processo de um
cliente para todos.

O que **é** união fechada: o `OrderStatus` e o `MovementKind`. Esses são do
produto, não do cliente.

---

## ⭐ A permissão vem do DESENHO, nunca do nome

`permissionToAdvance(stage)` devolve `ops.order.decide` quando a etapa foi
marcada `requiresApproval`, e `ops.order.manage` nas demais.

Repare no que ela **não** faz: não procura a palavra "aprovação" no nome. Uma
esteira em espanhol, ou com a etapa chamada *"ok do cliente"*, funciona igual —
e há teste que desenha uma etapa **chamada** "aprovação" e não marcada para
exigir o comportamento oposto ao nome.

---

## ⭐ A divergência: `done → in_progress`

O `ap` tem `settled` terminal. Aqui a OS concluída **volta a andar**.

> Dinheiro tem identidade por documento; trabalho tem identidade por serviço.

O cliente recebeu e pediu mudança: é o mesmo trabalho. Uma segunda OS partiria
em duas a história de um serviço só.

⛔ **O que não diverge:** `cancelled` continua terminal, como no `ap`. Copiar ali
foi decisão, e está escrita.

O espelho vive em **teste**, nunca num import: `lifecycle.test.ts` lê as duas
migrations e exige que os dois ciclos sejam diferentes no ponto certo. Quem
"consertar por simetria" descobre na hora.

---

## ⚠️ Este pacote não executa movimento

Mover a OS é mudar a etapa **e** escrever a trilha na mesma transação, com o
nome da etapa lido no servidor no instante do ato. Isso vive em
`ops.advance_order()` / `ops.skip_stage()` / `ops.send_back_order()`, no banco.

Aqui está a mesma regra, para a tela poder antecipar a resposta sem chutar — e
há teste que compara os dois lados.

---

## Comandos

```bash
pnpm --filter @alsham/ops test       # node --test, sem framework
pnpm --filter @alsham/ops typecheck
```

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
