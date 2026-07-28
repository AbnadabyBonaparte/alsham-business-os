# `@alsham/accounts-receivable` — Módulo 5: Contas a Receber

> Especificação completa: [`docs/canon/MODULO-AR-SPEC.md`](../../docs/canon/MODULO-AR-SPEC.md)
> **Leia junto com [`MODULO-AP-SPEC`](../../docs/canon/MODULO-AP-SPEC.md):** este
> módulo é o espelho consciente daquele.

**Domínio PURO.** Nem banco, nem rede, nem relógio, nem UI.

| Onde | O quê |
|---|---|
| `src/manifest.ts` | o `ModuleManifest` — e a decisão de `consumes` vazio, com a evidência |
| `src/receivable.ts` | validação, ciclo de vida, saldo, excedente, resumo |
| `src/types.ts` | os tipos, com nomes **neutros de país** |

---

## ⭐ Espelho consciente, não cópia

Cada decisão do `accounts-payable` foi **re-perguntada**, e a resposta está
escrita — no quadro MANTIDO × DIVERGE do `0010_ar.sql` e na spec. Dez decisões se
mantiveram (e o porquê está escrito para cada uma); **uma divergiu**.

> **Copiar sem pensar e divergir sem escrever são o mesmo erro.**

### ⛔ A divergência: receber a maior é permitido

O `ap` tem `payables_no_overpay`. Aqui essa constraint **não existe**.

Pagar a mais é erro de quem paga, e o sistema que paga pode recusar. **Receber a
mais é o que o pagador fez**, e o dinheiro já está na conta — recusar obrigaria o
operador a registrar menos do que recebeu.

Consequências tratadas: `outstandingCents()` devolve **zero**, nunca negativo; e
`overpaidCents()` existe para a tela **mostrar** o excedente em vez de escondê-lo.

---

## ⚠️ Espelhar não é importar

Este pacote **não importa o `accounts-payable`**, apesar de espelhá-lo. Se os
dois compartilhassem um `lifecycle` comum, mudar a regra de um mudaria a do
outro em silêncio — e a divergência acima seria impossível de expressar.

O espelho vive em **três testes**, nunca num import:

1. `lifecycle.test.ts` lê as duas migrations e compara as tabelas de transição
   traduzidas (`settled` ↔ `received`);
2. `supabase/tests/07_ar_isolation.sql` insere um recebimento a maior (passa) e
   um pagamento a maior (é recusado) **no mesmo banco**;
3. uma guarda de CI confere as duas constraints no banco **aplicado**.

---

## ⚠️ `consumes` é vazio, e é decisão de canon

A conciliação de recebimentos exigiria reescrever o motor do Módulo 1 —
`scorePair()` recusa linha de crédito na primeira linha — e derrubar um
`NOT NULL` de tabela aplicada em produção. Há teste que confere as duas
pré-condições no código real e **exige o contrário** no dia em que caírem.

---

## Comandos

```bash
pnpm --filter @alsham/accounts-receivable test       # node --test, sem framework
pnpm --filter @alsham/accounts-receivable typecheck
```

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
