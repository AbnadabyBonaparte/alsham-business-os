# MÓDULO 82 — Assinatura de Energia (subscription)

> Vertical ☀️ **Energia** (`vertical_key='energy'`) · Onda Vinte (Fase 3) ·
> migration `0097_subscription.sql` · pacote `@alsham/subscription` · teste
> `87_subscription_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §33).**

---

## 1. O QUE É

O **modelo de negócio central da Curva C solar**: o consumidor assina uma FATIA
(percentual) da geração de uma usina. A assinatura é o vínculo comercial — quem
assina (o cliente, por id solto ao `crm`, obrigatório), o que assina (a usina,
por id solto ao `plant`, obrigatória) e QUANTO da geração fica alocado
(`allocation_percent`, `0 < x <= 100`).

- Nome do cliente e da usina carimbados pela tela (sobrevivem ao redesenho).
- Vínculos por **id solto**, sem FK cruzada — a Lei do Lego.

---

## 2. ⭐⭐ A DECISÃO DE CICLO — `active → cancelled` TERMINAL, e SEM `pending`

O bastão mandou investigar e documentar. Duas perguntas:

**"Precisa de um `pending` antes de `active`?" — NÃO.** Um estado intermediário
("assinada, aguardando conexão na distribuidora") modela a esteira de onboarding
de UMA distribuidora, não o produto universal — é o viés que a Lei Anti-Viés
proíbe. A assinatura **nasce ativa** (o momento em que a operadora compromete a
fatia). Rastrear "assinada, aguardando conexão" é status operacional do tenant
(ou a Esteira genérica, `ops`), não uma etapa que o produto congela pra todos.
É a disciplina do `catalog`, que nasce ativo sem "rascunho".

**"`cancelled` é terminal ou reversível?" — TERMINAL.** A pergunta: o consumidor
que cancela e volta é a MESMA assinatura (física do `crm`/`catalog`) ou uma NOVA
(física do `proj`)? É uma NOVA: quem re-assina negocia OUTRA fatia — outro
percentual, outra usina, outra data. A fatia alocada é o coração do contrato, e
se renegocia do zero. Ressuscitar a assinatura antiga MENTIRIA sobre o acordo
vigente. Então `active → cancelled` e pronto — o retorno é assinatura NOVA. É o
**DIVERGE consciente do `catalog`** (que fica no mesmo PR).

Cancelar exige **razão** E a permissão `.decide` (decisão de outro papel). O
carimbo de quem/quando é do servidor. A cancelada é terminal: não reabre nem se
edita (congelada).

---

## 3. ANTI-VIÉS — o que ENTRA e o que fica FORA

**✅ ENTRA:** cliente (id solto ao `crm`, obrigatório) + nome; usina (id solto ao
`plant`, obrigatória) + nome; `allocation_percent` (`0 < x <= 100`); o ciclo
`active → cancelled`.

**❌ FORA:** cálculo de desconto na fatura (é o `dre`/`cash` genérico cruzando por
id solto — futuro, DECLARADO FORA); faturamento/cobrança da assinatura (frente de
billing separada, FORA); a fatura de energia em si (integração com a
distribuidora, Lei 3). `consumes` **VAZIO**.

---

## 4. ESTADO

✅ **CONSTRUÍDO na Onda Vinte (Vertical ☀️ Energia)** — arquivo, ainda **NÃO
APLICADO** (runbook §33). Schema `subscription`, RLS por tenant, motor
`@alsham/subscription`, teste de isolamento `87`. `consumes` vazio.
