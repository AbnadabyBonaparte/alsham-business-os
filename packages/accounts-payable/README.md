# `@alsham/accounts-payable` — Módulo 3: Contas a Pagar

> Especificação completa: [`docs/canon/MODULO-AP-SPEC.md`](../../docs/canon/MODULO-AP-SPEC.md)

**Domínio PURO.** Nem banco, nem rede, nem relógio, nem UI. O que este pacote
sabe é o que é um título válido e por onde ele pode andar.

| Onde | O quê |
|---|---|
| `src/manifest.ts` | o `ModuleManifest` — como o módulo existe para a plataforma |
| `src/payable.ts` | validação, ciclo de vida, saldo, atraso |
| `src/types.ts` | os tipos, com nomes **neutros de país** |

Quem grava é o schema `ap` (`supabase/migrations/0007_ap.sql`); quem mostra é
`apps/portal`; quem conta ao mundo é o correio.

---

## ⚠️ O identificador é `ap`, o pacote é `accounts-payable`

O `CORE-SPEC` define o evento como `<moduleId>.<agregado>.<fato>`, e o cinto de
`ap.emit_event()` confere esse prefixo. Com eventos em `ap.*`, o `module_id`
**tem** de ser `ap` — qualquer outro faria o módulo recusar os próprios eventos.

---

## ⭐ Este pacote não importa nenhum outro módulo, e não vai importar

O módulo que reage aos fatos daqui se acopla ao **tipo do evento**, que é
contrato público — não a este código. Há guarda no CI (*"módulo não conhece
módulo"*), sabotada nas três formas antes de entrar.

---

## O ciclo de vida vive em dois lugares — de propósito

`ALLOWED_TRANSITIONS` aqui, `ap.allowed_transition()` no SQL. Regra que só vive
no TypeScript não protege quem escreve SQL à mão nem o correio; regra que só
vive no SQL faz a tela descobrir o "não" depois do round-trip.

O que torna isso arquitetura em vez de descuido é `src/lifecycle.test.ts`: ele
**lê o arquivo da migration**, extrai os pares e compara. Divergiu, quebra.

---

## Comandos

```bash
pnpm --filter @alsham/accounts-payable test       # node --test, sem framework
pnpm --filter @alsham/accounts-payable typecheck
```

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
