# 📢 MÓDULO 11 — EVENTOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `marketing`

> Leitura obrigatória para quem for mexer no schema `evt` ou no pacote
> `@alsham/event-management`.
>
> **Leia junto com [MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)** — de onde vem
> o padrão do ato carimbado pelo servidor e da honestidade de calendário —
> e com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md), o precedente do id que não
> disputa vocabulário.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `evt`, e não `event` nem `events`.** "Evento" já significa
OUTRA COISA no coração desta plataforma: `core.event_outbox`,
`emit_event()`, `EventEnvelope`, a capacidade *APIs & Eventos* do Core
(Taxonomia §3). Um módulo chamado `event` faria a palavra querer dizer duas
coisas no mesmo repositório — o argumento exato que derrubou `os` no
Módulo 7. Sol Único. Pelo mesmo motivo o PACOTE é `@alsham/event-management`,
nunca `@alsham/events` (que moraria ao lado de `@alsham/workflow`, o correio
de eventos). `evt.` conferido por grep com fronteira de palavra: zero
colisões. Há teste de pacote que verifica os dois usos da palavra no Core.

**`domain_key` = `marketing`, capacidade *Eventos* — e NÃO o vertical
`events`.** Taxonomia §5, bloco **📢 Marketing (13)**:

> Campanhas · **Eventos** · Social media · Calendário · Design · Briefings ·
> Produção · Branding · Influenciadores · Mídia · CRM marketing · E-mail
> marketing · Landing pages

Este módulo é o evento UNIVERSAL — a feira, o workshop, a inauguração, o
culto, o coquetel — que qualquer empresa organiza. O vertical 🎪 Eventos
(Events OS™) é o OFÍCIO de quem VIVE de evento: `Ingressos · Credenciamento ·
Programação/line-up · Fornecedores de evento · Patrocínios · Afiliados ·
Check-in · Pós-evento`. *"A peça universal desce para o Domain; a vertical
fica só com o ofício"* (Taxonomia §1). ⚠️ A cor `--bos-v-events` é DO
VERTICAL — este módulo usa a pele obsidian+ouro, como todo Domain. ⚠️ O
`module_id` não pode ser `marketing`: o Módulo 2 já é.

**A PEDREIRA (alsham-events-os) é CONCEITUAL.** Minerou-se o MAPA
(reservation/live/notification/forms como territórios do problema), NENHUMA
implementação: lá é catedral de papel (os engines são READMEs) e a stack é
outra (Drizzle — que não se toca, CLAUDE.md §5.1). **O perigo da pedreira é
importar PROMESSA**: cada nome de engine é tentação de declarar capacidade
não construída. Não se declarou nenhuma — e há teste de pacote reprovando
ingresso/QR/credenciamento/line-up/patrocínio no schema.

**consumes = VAZIO.** Lei 7 — sem handler, sem promessa. A esteira do `ops`
produz as peças DO evento sem os dois módulos se conhecerem: se um dia o
vínculo existir, será por consumo de fato com handler, nunca por import.

---

## 1. ⭐ AS DECISÕES DO CICLO — re-perguntadas, uma a uma

| Decisão do irmão | Resposta no `evt` | Por quê |
|---|---|---|
| nasce rascunho (`quote`/`po`) | ✅ **mantido** | o evento se monta antes de abrir a lista |
| ato carimbado pelo servidor (`quote.decided_*`) | ✅ **mantido** (`attended_at`/`attended_by`) | presença sem autor não se defende |
| honestidade de calendário (`expired` só vencida) | ✅ **mantido** (`held` só depois de começar) | registrar como realizado o que não começou mentiria |
| fins terminais (`ap`/`quote`) | ✅ **mantido** (`held`, `cancelled`) | o que aconteceu, aconteceu |
| cancelar é status, nunca DELETE | ✅ **mantido** — nas DUAS tabelas | a lista de um evento é história dele: quem desistiu fica registrado como quem desistiu |
| rascunho pode ser retirado/cancelado | ✅ mantido | ideia abandonada é história curta, mas é história |
| voltar do publicado | ⛔ **DIVERGE do editável: `published → draft` NÃO existe** | publicado com inscritos é COMPROMISSO público — despublicar invalidaria inscrições em silêncio. Corrigir é editar os dados (`updated`) ou cancelar (fato que todo inscrito pode escutar) |

### 1.1 ⭐ A LOTAÇÃO: recusa clara, nunca silêncio

Capacidade é OPCIONAL — evento sem teto existe, e sem teto não há conta
(`remainingCapacity` devolve `null`; inventar número é a Lei 7 ao
contrário). Quando informada, a inscrição além do teto é **RECUSADA com erro
claro** ("lotado, X de Y vagas"): aceitar além "por enquanto" seria a
lotação virando mentira. Cancelada não ocupa vaga. **Lista de espera é
capacidade futura DECLARADA** — quando existir, é fila com posição, não
inscrição disfarçada.

### 1.2 ⭐ A inscrição: contato NEUTRO, presença como ATO

`attendee_name` + `contact` TEXTO LIVRE (e-mail, telefone, "@fulano no
instagram") — colunas `email`/`phone` congelariam o instrumento de uma
década, a lição do canal do `crm`. Inscrição só em evento PUBLICADO
(publicar é justamente abrir a lista). A presença exige evento publicado ou
realizado e carimba `attended_at`/`attended_by` pelo servidor. `cancelled` e
`attended` são terminais: quem cancelou e voltou atrás é inscrição NOVA.

---

## 2. O QUE ESTE MÓDULO GUARDA

- `evt.events` — nome, descrição, `starts_at` obrigatório (sem data é ideia,
  não evento), `ends_at` opcional (≥ início), local TEXTO LIVRE, capacidade
  opcional, status.
- `evt.registrations` — nome de quem vem, contato neutro, nota, status,
  carimbo da presença.

**Não entra:** ingresso/preço/lote, pagamento, QR/check-in eletrônico,
credenciamento, line-up, patrocínio, tipo-de-evento em enum, CPF/documento,
assento. Ver §0 (o ofício do vertical) e §5.

## 3. OS CICLOS

```
EVENTO:     draft ──→ published ──→ held      (terminal)
              │           └───────→ cancelled (terminal)
              └───────────────────→ cancelled (terminal)

INSCRIÇÃO:  registered ──→ confirmed ──→ attended  (terminal)
                │  │           └───────→ cancelled (terminal)
                │  └───────────────────→ attended  (terminal)
                └──────────────────────→ cancelled (terminal)
```

Publicar/realizar/cancelar o evento exigem `evt.event.decide`; a lista de
quem vem é de `evt.registration.manage`.

## 4. OS NOVE FATOS

| Fato | Quando |
|---|---|
| `evt.event.registered` | o evento nasceu (rascunho) |
| `evt.event.updated` | mudou nome, datas, local ou capacidade |
| `evt.event.published` | a lista abriu |
| `evt.event.held` | registrado como realizado — só depois de começar |
| `evt.event.cancelled` | cancelado — o fato que todo inscrito pode escutar |
| `evt.registration.registered` | alguém entrou na lista |
| `evt.registration.confirmed` | confirmou que vem |
| `evt.registration.cancelled` | desistiu — e a linha fica |
| `evt.registration.attended` | veio — com o carimbo de quem registrou e quando |

⭐ Payload AUTOSSUFICIENTE: a inscrição leva o evento pelo NOME e pela data.

---

## 5. ⛔ NÃO CONSTRUÍDO — o ofício do vertical, declarado peça a peça

| Peça | Onde ela mora quando existir |
|---|---|
| Ingresso pago, lote, meia-entrada | pagamento é peça inteira própria (gateway = Lei 3, INTEGRAR) |
| Check-in por QR / credenciamento | vertical 🎪 Eventos — exige identidade forte, não nome+contato |
| Line-up / programação | vertical 🎪 Eventos |
| Patrocínio / afiliados | vertical 🎪 Eventos |
| Lista de espera | capacidade futura DESTE módulo — fila com posição, não inscrição disfarçada |
| Comunicação com inscritos (e-mail/mensagem) | integração futura; os fatos `evt.*` já carregam o que ela precisa |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 29/07/2026, na Missão Trina.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `evt` (`0026_evt.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §16) |
| Pacote `@alsham/event-management` (manifesto, tipos, motor, lotação) | ✅ construído, com testes |
| Seed (11º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`16_evt_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/eventos` (agenda, publicar, lista, presença) | ✅ CONSTRUÍDO |
| O ofício do vertical (ingresso, QR, line-up…) | ⛔ **NÃO CONSTRUÍDO** — ver §5 |
| Lista de espera | ⛔ **NÃO CONSTRUÍDO** — ver §1.1 |

---

## 7. APPLY (dono)

1. Aplicar `0026_evt.sql` (depois do `0025`).
2. Reaplicar o seed — o 11º cartão entra no catálogo.
3. ⚠️ **Expor o schema `evt` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
