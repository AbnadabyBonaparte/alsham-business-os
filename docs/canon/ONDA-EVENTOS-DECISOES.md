# ONDA EVENTOS — o Vertical 🎪 EVENTOS: as 8 capacidades, decisão por decisão

> Fase 3 · `vertical_key='events'` · migrations `0109`–`0111` · testes `99`–`101` ·
> catálogo **93 → 96 módulos publicados**.
> **ARQUIVO — apply é ato do dono. NÃO MERGEIE — o merge é do dono.**
> ⚠️ **Lançamento comercial passa pelo LEXIS antes — decisão do dono, FORA do
> escopo desta onda.** A onda constrói e aplica; vender é outro ato.

O vertical 🎪 Eventos (Taxonomia §6, "vertical viva: Events OS™"). 8 capacidades:
Ingressos · Credenciamento · Programação/line-up · Fornecedores de evento ·
Patrocínios · Afiliados · Check-in · Pós-evento. ⚠️ **Este é o vertical de maior
risco de duplicação do mapa** — três peças do império o cercam. A investigação
começou por elas.

## ⚠️ AS TRÊS PEDREIRAS DE SOBREPOSIÇÃO — investigadas ANTES de qualquer schema

1. **O módulo `evt` (Domain Marketing, Módulo 11) já existe.** É o evento
   UNIVERSAL — a feira, o workshop, a inauguração que QUALQUER empresa organiza.
   ⭐ **A linha já estava traçada no canon:** o `MODULO-EVT-SPEC §0` diz que o
   vertical 🎪 Eventos é "o OFÍCIO de quem VIVE de evento" (Ingressos ·
   Credenciamento · line-up · Fornecedores · Patrocínios · Afiliados · Check-in ·
   Pós-evento) e **há teste de pacote no `evt` que REPROVA ingresso/QR/
   credenciamento/line-up/patrocínio no schema dele**. Ou seja: o `evt` DE
   PROPÓSITO não cobre estas capacidades — elas são do vertical. A sobreposição
   com o `evt` está resolvida pelo próprio canon: *"a peça universal desce para o
   Domain; a vertical fica só com o ofício"* (Taxonomia §1).
2. **`canta-siriema` (produto real do império, `/home/user/canta-siriema`)** é um
   sistema de BILHETERIA de evento único: `events · tables · orders · affiliates ·
   raffle_tickets · combos` + checkout PIX (QR + copia-e-cola) + webhook de
   pagamento + sistema de afiliados por comissão. É o produto de **Ingressos e
   Afiliados** do império — construir isso no Business OS seria reconstruir um
   produto que já existe, melhor, com pagamento real.
3. **`alsham-events-os` (Events OS™, `/home/user/alsham-events-os`)** é FRAMEWORK
   B2B em stack DIFERENTE (Drizzle/MySQL — que não se toca, CLAUDE.md §5.1). ⭐ A
   pedreira é **CONCEITUAL** (o `evt` spec já registra: minerou-se o MAPA, nenhuma
   implementação — "catedral de papel, os engines são READMEs"). O perigo é
   importar PROMESSA; nada de lá vira schema aqui.

## As 8 capacidades

| # | Capacidade | Decisão | Argumento |
|---|---|---|---|
| 1 | **Ingressos** | ⛔ **FORA (Lei 3 + `canta-siriema`)** | Venda de ingresso é **pagamento + obrigação fiscal** (Lei 3, a régua do PDV/NF): o documento de venda com valor integra-se, não se constrói. E o `canta-siriema` já É o produto de bilheteria+PIX do império. Reconstruir seria duplicar produto E abrir risco fiscal. CONSTRUIR seria decisão de dono explícita (mantida FORA, 04/08/2026). |
| 2 | **Credenciamento** | ✅ **módulo `accred`** (`0109`, junto com Check-in) | Emitir a credencial de acesso do participante/imprensa/staff — quem entra, com que tipo/nível de acesso (TEXTO LIVRE). O `evt` rejeita no schema; física própria. Consolidado com Check-in (ver #7). |
| 3 | **Programação/line-up** | ✅ **módulo `lineup`** (`0110`) | A agenda do evento — as atrações/sessões/palestras, com palco e horário (TEXTO LIVRE), ordenadas. O `evt` rejeita no schema; é a peça do ofício (um congresso tem trilhas; um festival tem line-up de palco). Vínculo ao evento por id solto. |
| 4 | **Fornecedores de evento** | ⛔ **FORA → `vendor`** | O fornecedor (buffet, som, luz, segurança) é o `vendor` genérico (Módulo 43), que já volta do arquivo e tem segmento texto livre. O vínculo "este fornecedor neste evento" é fino — id solto, ou o evento-como-projeto (`proj`) alocando o `vendor`. Zero módulo novo. |
| 5 | **Patrocínios** | ✅ **módulo `sponsor`** (`0111`) | A cota de patrocínio (ouro/prata/apoio — TEXTO LIVRE), o valor e os **entregáveis de ativação por evento** (logo no palco, 10 cortesias, ativação no foyer) são física de EVENTO que o `ctr`/`deal` não modelam. ⭐ O contrato jurídico continua sendo o `ctr` (id solto) e a negociação o `deal` (id solto) — o `sponsor` é a camada de patrocínio, como o `lease` é a camada comercial sobre o `ctr`. |
| 6 | **Afiliados** | ⛔ **FORA (`canta-siriema`)** | Revenda de ingresso por comissão com repasse PIX é EXATAMENTE o sistema de afiliados do `canta-siriema` — e é amarrado à bilheteria (que é FORA). O afiliado de evento não existe sem o ingresso que ele vende. Sol Único: não se reconstrói o produto de afiliados do império. |
| 7 | **Check-in** | ✅ **módulo `accred`** (consolidado com Credenciamento) | A chegada — a credencial é validada na entrada e a presença é ato IMUTÁVEL carimbado pelo SERVIDOR (a física do `vis`/`train`). ⭐ **Consolidado com Credenciamento num módulo só:** a credencial é o cadastro (emitida → revogável); o check-in é o ato (imutável). É o ciclo credencial→presença, como o `train` faz inscrição→presença. Um schema, duas capacidades. |
| 8 | **Pós-evento** | ⛔ **FORA → `nps`** | A pesquisa de satisfação pós-evento é o `nps` (Módulo 27, régua 0–10, placar view); o relatório é o `pol`/analytics. O "pós-evento" não tem física própria além da pesquisa e do relatório, que já existem. |

**Resultado:** **3 módulos construídos** (`accred`·`lineup`·`sponsor`) + **4
capacidades DECLARADAS FORA** (Ingressos→Lei 3/canta-siriema, Fornecedores→
`vendor`, Afiliados→canta-siriema, Pós-evento→`nps`). Catálogo **93 → 96**. É um
vertical PESADO em reaproveitamento — e isso é honestidade, não preguiça: metade
das capacidades já são produto do império (bilheteria/afiliados) ou peça genérica
(fornecedor/pesquisa).

## Anti-viés aplicado

- ⛔ **Tipo de evento** (casamento, feira, show, congresso) é TEXTO LIVRE, nunca
  enum — e nem sequer mora aqui: o evento é o `evt` genérico, por id solto.
- ⛔ Tipo de credencial, nível de acesso, cota de patrocínio, palco, atração —
  todos TEXTO LIVRE, dado do tenant. Um congresso acadêmico e um festival de
  música desenham o próprio vocabulário sem uma linha diferente.

## Números da onda

- Migrations `0109`–`0111` (3 módulos) · testes SQL `99`–`101` · seed 3 cartões
  `vertical_key='events'` · `consumes` VAZIO nos três (sem redeploy do `apps/api`).
- ⚠️ Ao aplicar: **expor os schemas `accred`, `lineup`, `sponsor` na Data API**.
  Nenhum consome evento.
- ⭐ Vínculos por ID SOLTO (o evento do `evt`, o cliente do `crm`, o contrato do
  `ctr`) — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio; as FKs
  intra-schema (credencial→check-in, patrocínio→entregável) são permitidas.
