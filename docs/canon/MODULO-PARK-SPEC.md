# 🅿️ MÓDULO 41 — ESTACIONAMENTO

## ALSHAM Business OS™ · Especificação do módulo · Vertical `shopping-centers`

> **Missão Nove (Onda 6 — a ÚLTIMA).** `module_id` = `park`. Migration
> `0056_park.sql` · pacote `@alsham/park` · teste
> `46_park_isolation.sql`. **ARQUIVO — apply é ato do dono (runbook §22).**

---

## 0. AS DECISÕES DE CANON

- ⭐ **A identidade do `vis` (portaria) aplicada ao veículo.** A portaria
  carimba entrada e saída de PESSOAS pelo servidor e congela o registro
  depois de visto. O `park` re-pergunta a MESMA identidade para o VEÍCULO:
  entrada e saída carimbadas PELO SERVIDOR (nunca pela tela — a hora que o
  cliente mandar é descartada), e correção é registro novo (não se rasura
  o carimbo).
- ⭐ **A divergência de forma, assinada.** O `vis` tem um plano anterior
  (`scheduled`/`no_show` — a visita pode ser agendada); o `park` **nasce
  direto** no "dentro" — não há agenda de vaga nesta onda. Consequência: o
  `vis` guarda estado explícito (`status`) com uma tabela de transições; o
  `park` **não tem status/enum nenhum** — dentro/fora é IMPLÍCITO por
  `exited_at is null`. É por isso que não existe `park.allowed_transition()`
  nem `ALLOWED_TRANSITIONS` no pacote: não há par de estados para espelhar,
  só o único movimento (registrar a saída) e o congelamento que vem depois.
- ⚠️ **É VERTICAL, não Domain.** `taxonomy.layer = 'vertical'`,
  `vertical = 'shopping-centers'` — o mesmo vertical do `mall` (Módulo 38).
- ⭐ **Duas mãos na cancela.** `park.entry.manage` registra a ENTRADA;
  `park.entry.close` registra a SAÍDA. São atos distintos, como a agenda × a
  cancela do `vis` — nada impede o mesmo papel de ter as duas, mas o produto
  não pressupõe isso.
- ⭐ **Veículo NEUTRO e tarifa OPCIONAL.** `vehicle_plate` é TEXTO LIVRE
  (placa, identificador de moto/bike, veículo de visitante sem placa do
  país). `fee` também é texto e OPCIONAL — o tenant decide se cobra e
  quanto; o motor **não calcula nada** (anti-viés: cálculo de tarifa é
  vocabulário de cada praça e de cada regra comercial).

---

## 1. AS PEÇAS

- **`park.entries`** — o livro do pátio: `vehicle_plate`, `entered_at`/
  `entered_by` (carimbados pelo servidor no INSERT), `exited_at`/
  `exited_by` (carimbados pelo servidor no único UPDATE permitido), `fee`
  (texto, opcional). RLS `enable`+`force`; sem DELETE. Sem coluna de
  status — `exited_at is null` é o "dentro".

---

## 2. OS FATOS

`park.entry.registered` (a entrada) · `park.entry.closed` (a saída, sobre a
mesma linha). O envelope leva a placa/identificador — NEUTRO, sem qualquer
documento de pessoa.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/park`) entrega a régua:
`validateNewEntry`, `isInside`, `canRecordExit`, `durationMinutes`,
`summarize`.

---

## 4. AS PERMISSÕES

- `park.entry.manage` — registrar a entrada de um veículo.
- `park.entry.close` — registrar a saída de um veículo.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cálculo de tarifa progressiva** (fração de hora, mensalista, isenção,
  desconto por validação de compra) — motor de regras futuro. `fee` fica
  texto livre; o produto não decide nada sobre dinheiro aqui.
- **Integração com cancela física / leitura de placa por câmera (LPR)** —
  hardware de terceiro, fora do escopo deste módulo.
- **Reserva de vaga / mensalista com vínculo dedicado** — capacidade
  futura, não pressuposta pelo cliente inaugural.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado**
(runbook §22). A migration `0056_park.sql`, o pacote `@alsham/park` e o
teste `46_park_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §22`. Expor o schema `park` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
