# 💬 MÓDULO 15 — ATENDIMENTO

## ALSHAM Business OS™ · Especificação do módulo · Domain `cx`

> Leitura obrigatória para quem for mexer no schema `care` ou no pacote
> `@alsham/care`.
>
> **Leia junto com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)** e
> **[MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)** — as duas identidades
> (serviço × documento) que aqui são re-perguntadas e respondidas COM UMA
> TERCEIRA — e com [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), o molde da
> interação imutável e do canal em texto livre.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `care`.** `cx` é o Domain inteiro (a armadilha do
`finance`); `sac` é sigla de um país e de uma década; `ticket` é vocabulário
do VERTICAL de eventos (ingresso — o `evt` deixou ingresso para o vertical).
`care` foi conferido por grep com fronteira de palavra: zero colisões.

**`domain_key` = `cx`** — Taxonomia §5, bloco **💬 Atendimento ao Cliente
(CX) (8)**, capacidade **SAC**. *Omnichannel*, *Base de conhecimento*,
*Pesquisas NPS/CSAT*, *Reclamações* estruturadas e *Pós-venda* são
capacidades PRÓPRIAS do mesmo Domain — nenhuma entra de contrabando.

**⭐ O CASO TEM IDENTIDADE PELO PEDIDO — a terceira resposta.** O `ops`
reabre o concluído (trabalho = serviço); o `quote` não reabre nada
(documento). O atendimento fica NO MEIO, de propósito: `resolved → open`
EXISTE (o cliente que diz "não resolveu" fala DO MESMO caso — caso novo
partiria a conversa em duas), e **`closed` é TERMINAL** (o fim confirmado é
fim; quem volta semanas depois é caso novo, com referência ao antigo). Há
teste que EXIGE o contraste TRIPLO entre as três migrations.

**⭐ REABRIR LIMPA O CARIMBO.** A resolução é ATO carimbado pelo servidor
(`resolved_at`/`resolved_by`, padrão quote); reabrir devolve o caso vivo e
limpa o carimbo — a história do primeiro `resolved` fica na trilha do
correio e a conversa nas interações, que são imutáveis.

**⭐ CATEGORIA E PRIORIDADE SÃO DADO DO TENANT** — duas tabelas, nome livre,
nunca enum. A prioridade tem POSIÇÃO (ordenar a fila é o ofício dela; 0 =
mais urgente). As duas com `archived → active`.

---

## 1. O CICLO

```
open ⇄ in_progress → resolved ⇄ open        open|in_progress|resolved → closed
```

Oito pares no espelho SQL↔TS. Resolver e fechar exigem `care.ticket.resolve`
(quem atende não é quem dá por resolvido); fechar direto (spam, duplicado)
também carimba — um fim sem autor não se defende. Caso resolvido/fechado
CONGELA o conteúdo; caso fechado não recebe interação.

## 2. A CONVERSA — imutável em 3 camadas

`care.interactions` (padrão `crm.interactions`): cada resposta/anotação é
linha eterna com autor e canal TEXTO LIVRE. INSERT direto permitido (o fato
é o dado); UPDATE/DELETE não existem — nem para o dono do banco.

## 3. O ATRASO — consequência calculada

`care.overdue` (com `security_invoker`): casos vivos com `due_at` vencido,
calculados por data. **Sem SLA de relógio**: escalonamento automático
exigiria cron — declarado futuro; a view honesta serve a fila de hoje. A
ORDEM da fila é decisão do pacote (`orderTickets()`): prioridade do tenant,
depois prazo, depois chegada.

## 4. OS FATOS

| Fato | Quando |
|---|---|
| `care.ticket.opened` | o caso nasceu |
| `care.ticket.updated` | mudou no que é fato (inclui andamento da fila) |
| `care.ticket.resolved` | ato carimbado, com a nota |
| `care.ticket.reopened` | o MESMO caso voltou |
| `care.ticket.closed` | terminal |
| `care.interaction.recorded` | uma linha eterna entrou na conversa |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Omnichannel (e-mail/WhatsApp/telefonia entrando sozinhos) | integração inteira com credencial do tenant — capacidade própria; o canal da interação já registra o texto livre |
| SLA automático com escalonamento | cron/relógio da plataforma; quando existir, é o correio do Core quem acorda |
| Pesquisa de satisfação | *Pesquisas NPS/CSAT* — capacidade própria (Onda 3 da campanha) |
| Base de conhecimento | Engine Wiki (Taxonomia §4) |
| Abrir caso a partir de fato alheio (`occ.*`, `evt.*`) | consumidor E10 completo — declarar exige handler construído |
| Portal do solicitante (o cliente do tenant abrindo caso sozinho) | autenticação de terceiros — capacidade própria |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Quadra.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `care` (`0030_care.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §17) |
| Pacote `@alsham/care` (ciclo, fila ordenada, atraso, validação) | ✅ construído, com testes |
| Seed (15º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`20_care_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/atendimento` (fila, caso, conversa, resolver/reabrir/fechar) | ✅ CONSTRUÍDO |
| Omnichannel · SLA automático · NPS · base de conhecimento | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0030_care.sql` (depois do `0029`).
2. Reaplicar o seed — o 15º cartão entra.
3. ⚠️ **Expor o schema `care` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
