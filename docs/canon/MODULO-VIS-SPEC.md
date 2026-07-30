# 🏭 MÓDULO 21 — VISITAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `vis` ou no pacote
> `@alsham/visits`.
>
> **Leia junto com [MODULO-OCC-SPEC](MODULO-OCC-SPEC.md)** — a física do
> fato consumado que o registro herda — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md) / [MODULO-CARE-SPEC](MODULO-CARE-SPEC.md),
> as identidades que aqui são re-perguntadas e respondidas de um QUARTO jeito.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `vis`.** Curto, greppável, sem colisão (grep com fronteira
de palavra: zero).

**`domain_key` = `operations` — e o HOMÔNIMO fica declarado.** A Taxonomia
lista *Visitas* em DOIS lugares: no Domain 🤝 CRM (a visita comercial do
vendedor — vocabulário do 360° PRIMA: follow-up, ligação, visita) e é a
ela que aquela linha se refere. O livro da PORTARIA é outra coisa: operação,
vizinho de *Segurança* e *Facilities*. Sol Único é a lei contra uma palavra
querer dizer duas coisas — por isso a capability key é `visitor-log` e o
argumento fica aqui, com teste que ancora os dois lados.

**⭐ A QUARTA IDENTIDADE: a visita é o EVENTO DE PRESENÇA — e não volta.**
O crm reativa a contraparte (a MESMA pessoa); o care reabre o caso (o MESMO
pedido); o occ nem edita (o FATO). A visita responde uma quarta coisa: a
identidade é a PASSAGEM pela portaria — um fato datado com dois carimbos.
Quem volta amanhã é visita NOVA: a pessoa é a mesma (ofício do crm), a
passagem é outra. TODOS os fins são terminais. Há teste que assina o
contraste triplo crm×care×vis.

**⭐ O QUE A PORTARIA VIU NÃO SE RASURA — e o carimbo é do SERVIDOR.**
Entrada e saída são `now()`/`auth.uid()` no ATO (a hora digitada é
descartada). Depois do check-in a identidade do registro congela; corrigir
é REGISTRO NOVO apontando o errado (`corrects_visit_id`). Enquanto
AGENDADA, edita-se: agendamento é plano, não fato. Check-out sem check-in
não existe: saída sem entrada é livro que mente.

**⭐ O DOCUMENTO NÃO PASSEIA PELO CORREIO.** O envelope leva o nome e o
destino; documento e contato ficam na portaria, sob RLS (a mesma prudência
do prompt da Forja). Há teste nos dois lados.

**⭐ Lista negra NÃO ENTRA — por LEI.** Barrar pessoa por registro passado
é decisão jurídica (LGPD) — fora por lei, não por preguiça.

---

## 1. AS PEÇAS

- `vis.visits`: o livro — visitante neutro (nome obrigatório; documento e
  contato opcionais), destino/anfitrião texto livre, motivo opcional,
  agendamento opcional, os dois carimbos do servidor, correção por registro
  novo. Constraint de coerência: cada estado com os carimbos que o definem.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `vis.visit.scheduled` | a visita foi agendada |
| `vis.visit.arrived` | o visitante entrou — carimbo do servidor |
| `vis.visit.departed` | saiu — o segundo carimbo fecha a passagem. Terminal |
| `vis.visit.missed` | o agendado não veio. Terminal |
| `vis.visit.cancelled` | o agendamento foi desmarcado, com razão. Terminal |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/visitas`: o pátio (quem está dentro, na ordem de chegada — `orderGate()`
do pacote), registrar entrada walk-in, agendar, check-in/check-out,
não-veio, desmarcar com razão, corrigir registrando de novo. Porta própria,
mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`register` (a CANCELA: entrada, saída, não veio) e `schedule` (a AGENDA:
agendar e desmarcar com razão). Quem agenda não é quem opera a cancela — e
o gatilho confere a permissão do ATO, não da tela.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Crachá / QR / catraca / foto | integração declarada — a cancela física é hardware de terceiro (Lei 3) |
| Lista negra / bloqueio de visitante | ⛔ **fora POR LEI** — barrar pessoa por registro passado é decisão jurídica (LGPD), não feature |
| Recorrência de visita (o prestador de toda semana) | cron da agenda é futuro declarado; credenciamento de prestador é vertical |
| Vínculo visitante → contraparte do crm | seria ID SOLTO + nome carimbado, como manda a lei — declarado, sem handler e sem coluna até haver ofício que o use |
| Notificação ao anfitrião ("sua visita chegou") | *Notificações* é capacidade do Core, não construída |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Penta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `vis` (`0036_vis.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §18) |
| Pacote `@alsham/visits` (ciclo, pátio, validação) | ✅ construído, com testes |
| Seed (21º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`26_vis_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/visitas` (pátio, walk-in, agenda, check-out) | ✅ CONSTRUÍDO |
| Crachá · lista negra · recorrência · notificação | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0036_vis.sql` (depois do `0035`).
2. Reaplicar o seed — o 21º cartão entra.
3. ⚠️ **Expor o schema `vis` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
