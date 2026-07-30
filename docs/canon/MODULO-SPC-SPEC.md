# 🏭 MÓDULO 20 — RESERVA DE ESPAÇOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `spc` ou no pacote
> `@alsham/spaces`.
>
> **Leia junto com [MODULO-CASH-SPEC](MODULO-CASH-SPEC.md)** — o "futuro
> recusado" que aqui DIVERGE de propósito — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), o `archived → active` que o espaço
> herda com argumento.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `spc`.** `spaces`/`space` colidem com o vocabulário de todo
editor e SO (workspace, namespace). Conferido por grep com fronteira de
palavra: zero colisões.

**`domain_key` = `operations`, capacidade *Reserva de espaços*.** A âncora
na Taxonomia é **Facilities** (🏭 Operações, §5); o nome universal vem dos
verticais que já a nomeiam pelo recorte deles — Condomínios: *Reserva de
áreas comuns*; Hotelaria: *Reservas* (§6). Declarar a capacidade como
"Facilities" inteiro prometeria mais do que o construído (Lei 7); o nome
diz exatamente o que há.

**⭐ A FÍSICA DO DOMÍNIO: o conflito é recusado pelo BANCO.** EXCLUSION
constraint (gist) sobre (espaço, período) — nunca `if` de aplicação: o `if`
perde a corrida entre duas reservas simultâneas; a constraint não perde
nunca. O período é MEIO-ABERTO ([início, fim)): terminar às 12h e começar
às 12h convivem. `btree_gist` entra NA MIGRATION, argumentado (gist puro
não indexa igualdade de uuid). A constraint é PARCIAL
(`where status = 'booked'`): **a cancelada libera o período SOZINHA**, por
definição — sem job, sem flag.

**⭐ RESERVA NO PASSADO É PERMITIDA** — o DIVERGE consciente do cash:
registrar o uso que JÁ aconteceu é fato consumado (a física do inv); a
agenda que recusa o passado mente sobre a ocupação. O cash recusa o futuro
porque previsão é outro ofício; aqui o futuro É o ofício. Há teste que
assina o contraste cash×spc.

**⭐ CANCELAR EXIGE RAZÃO e é TERMINAL** (um par); o ESPAÇO volta do
arquivo (`archived → active` — o argumento do crm: a sala reformada que
reabre é a MESMA sala).

---

## 1. AS PEÇAS

- `spc.spaces`: os lugares do tenant — nome livre, capacidade opcional,
  arquivado volta. Espaço arquivado não recebe reserva NOVA.
- `spc.reservations`: o período prometido — início/fim, finalidade texto
  livre, a exclusion parcial como física, cancelamento carimbado com razão.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `spc.reservation.booked` | um período foi prometido |
| `spc.reservation.updated` | mudou no que é fato (período, finalidade) |
| `spc.reservation.cancelled` | cancelada — terminal, com razão. O período liberou sozinho |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/espacos`: a agenda ordenada pelo pacote (`orderAgenda()`), reservar com a
recusa nomeada ANTES da constraint (`whyCannotBook()` — a mesma régua
meio-aberta), cancelar com razão em dois passos, espaços do tenant. Porta
própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`reservation.manage` (reservar, remarcar, cancelar com razão) e
`setup.manage` (desenhar os espaços). A agenda tem uma mão; o desenho, outra.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Preço/cobrança da reserva | viraria TÍTULO no contas a receber — integração declarada com o `ar` (o fato `spc.reservation.booked` já carrega período e espaço); sem handler, sem promessa |
| Calendário visual | tela, não schema — a agenda em lista já é honesta |
| Aprovação de reserva em duas mãos | capacidade futura declarada (o padrão do requires_approval do ops) |
| Recorrência de reserva | o cron da agenda é futuro declarado — sem relógio fingido |
| Check-in do uso (a sala foi mesmo usada?) | ofício do vis/portaria ou do vertical — fora por decisão |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Penta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `spc` (`0035_spc.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §18) |
| Pacote `@alsham/spaces` (conflito meio-aberto, ciclo, validação) | ✅ construído, com testes |
| Seed (20º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`25_spc_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/espacos` (agenda, reservar, cancelar com razão) | ✅ CONSTRUÍDO |
| Cobrança · calendário visual · aprovação · recorrência | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0035_spc.sql` (depois do `0034`). ⚠️ Ela cria a extensão
   `btree_gist` — presente em todo Supabase; nada a instalar antes.
2. Reaplicar o seed — o 20º cartão entra.
3. ⚠️ **Expor o schema `spc` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
