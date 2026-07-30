# 🤝 MÓDULO 22 — LEADS

## ALSHAM Business OS™ · Especificação do módulo · Domain `crm`

> Leitura obrigatória para quem for mexer no schema `lead` ou no pacote
> `@alsham/leads`.
>
> **Leia junto com [MODULO-DEAL-SPEC](MODULO-DEAL-SPEC.md)** — a fronteira
> que este módulo respeita (o deal é o mapa do negócio em andamento; o lead
> é a triagem de quem acabou de chegar) — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), a lição do texto livre que aqui
> vale dobrado.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `lead`.** Curto, greppável, o nome consagrado (grep com
fronteira de palavra: zero colisões). `deal` é o funil; `lead` é a fila de
entrada — vizinhos, nunca o mesmo.

**`domain_key` = `crm`, capacidade *Leads*** — Taxonomia §5, bloco
**🤝 Comercial & CRM (12)**, literal.

**⭐ A FRONTEIRA COM O DEAL.** O deal é o MAPA: estágios do tenant,
movimento livre, negócio em andamento. O lead é a FILA: chegou, atendeu,
qualificou ou descartou — ciclo CURTO de propósito, com a volta à fila
permitida (`in_contact → new`: atender e devolver não é desfecho).

**⭐ A QUINTA IDENTIDADE: o lead é a MANIFESTAÇÃO DE INTERESSE — e não
volta.** A régua re-perguntada: a pessoa volta (crm), o pedido volta
(care), o documento não (quote), a passagem não (vis). O lead é um evento
comercial datado COM ORIGEM PRÓPRIA: quem volta seis meses depois
manifestou interesse NOVO, com origem nova — e reciclar o antigo apagaria
exatamente o dado que a fila existe para guardar: DE ONDE as pessoas
chegam. `qualified` e `discarded` TERMINAIS; descartar exige razão (a
lição do deal.lost, assinada em teste de contraste).

**⭐ QUALIFICAR CARIMBA VÍNCULOS SOLTOS — pela TELA, nunca por evento.**
`party_id`/`party_name` (a contraparte criada no crm) e
`opportunity_id`/`opportunity_title` (o negócio aberto no deal): ID SOLTO
+ nome carimbado, sem FK cruzada (a matriz reprovaria) e sem consumo de
evento (Lei 7). Constraint: o vínculo só existe no qualificado.

**⭐ A ORIGEM É TEXTO LIVRE** — a lição do canal do crm, valendo dobrado:
a origem É o produto da fila. Sem tabela de vocabulário, sem setup.

**⭐ O CONTATO NÃO PASSEIA PELO CORREIO** — a prudência do vis: o envelope
leva nome, origem e interesse; o contato fica na fila, sob RLS.

---

## 1. AS PEÇAS

- `lead.leads`: a fila — nome, contato neutro, origem/interesse texto
  livre, responsável via `core.memberships` (padrão ops), desfecho
  carimbado pelo servidor, vínculos soltos do qualificado. Desfecho dado,
  registro congelado.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `lead.lead.created` | o interesse entrou na fila |
| `lead.lead.updated` | atendimento, devolução, responsável, origem |
| `lead.lead.qualified` | terminal — com os vínculos soltos carimbados |
| `lead.lead.discarded` | terminal — com a razão escrita |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/leads`: a fila na ordem de espera (`orderQueue()` — quem chegou
primeiro, primeiro), registrar interesse, atender/devolver, qualificar
carimbando os vínculos, descartar com razão, as origens contadas
(`countBySource()` — a leitura de funil). Porta própria, mock honesto,
menu por permissão.

## 4. AS PERMISSÕES

`manage` (registrar, atender, devolver, atribuir) e `decide` (qualificar
e descartar — os desfechos). Quem atende a fila não é quem fecha o
destino dela.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Captura automática de formulário/site/landing | **integração declarada** — o webhook de entrada é porta de fora (Lei 3); quando existir, entra pela API da plataforma, não por handler do módulo |
| Scoring de lead | capacidade futura — régua de pontuação exige critério do tenant e medição provada (Lei 7) |
| Dedupe automático | decisão de GENTE: dois "João Silva" podem ser duas pessoas — juntar registros é ato do operador |
| Distribuição round-robin / auto-atribuição | capacidade futura declarada — sem relógio nem sorteio fingido |
| Conversão automática lead→contraparte/negócio | os vínculos são carimbados pela TELA; criar registros em outros módulos por evento seria o Lego ao contrário |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Penta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `lead` (`0037_lead.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §18) |
| Pacote `@alsham/leads` (ciclo, fila, origens contadas, validação) | ✅ construído, com testes |
| Seed (22º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`27_lead_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/leads` (fila, atender, qualificar com vínculos, descartar) | ✅ CONSTRUÍDO |
| Captura · scoring · dedupe · round-robin | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0037_lead.sql` (depois do `0036`).
2. Reaplicar o seed — o 22º cartão entra.
3. ⚠️ **Expor o schema `lead` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
