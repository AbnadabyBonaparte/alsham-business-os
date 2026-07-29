# 🤝 MÓDULO 10 — FUNIL COMERCIAL

## ALSHAM Business OS™ · Especificação do módulo · Domain `crm`

> Leitura obrigatória para quem for mexer no schema `deal` ou no pacote
> `@alsham/deals`.
>
> **Leia junto com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)** — a Lei das Etapas,
> que este módulo RE-PERGUNTA e diverge em três pontos — e com
> [MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md), o irmão de Domain.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `deal`, e não `crm`, `pipeline` nem `funnel`.** `crm` já é o
Módulo 4. `pipeline` colidiria com o vocabulário do `ops` (`ops.pipelines` é
a esteira de produção) — Sol Único: uma palavra, um dono. "Funil" e
"oportunidade" **não existem na Taxonomia** (contado por grep, não estimado);
a tela fala funil porque o mercado fala, o manifesto fala *Pipeline* porque
`canonicalName` é rastreabilidade mapa→código. `deal.` conferido por grep:
zero colisões.

**`domain_key` = `crm`** — Taxonomia §5, capacidade **Pipeline** (a única
correspondente). ⚠️ *Pipeline de inovação* é de P&D, outro Domain.

**PEDREIRA (360° PRIMA):** minerou-se o VOCABULÁRIO — `value+currency`,
`probability`, `expected_close_date`, `tags`. ⛔ NÃO se minerou: `stage text
default` (enum implícito — a Lei das Etapas mata isso); a oportunidade
algemada ao lead (`lead_id NOT NULL`); `competitors[]`, `pain_points[]`,
`decision_makers jsonb` e `deal_size` (metodologia de venda de UMA casa —
anti-viés; a descrição livre carrega o que a casa anotar); `score_ia` (IA é
capacidade do Core, não coluna); a RLS deles (uma policy FOR ALL sem FORCE).
Há teste de pacote reprovando cada um no schema.

**consumes = VAZIO.** Lei 7 — ver §5.

---

## 1. ⭐ A LEI DAS ETAPAS, SEGUNDA APLICAÇÃO — re-perguntada, não copiada

> Os estágios do funil são DADO DO TENANT: linha de `deal.funnel_stages`,
> nome livre, posição reordenável, funis múltiplos. Jamais enum do produto.

O quadro do espelho contra o `ops`:

| Decisão do `ops` | Resposta no `deal` | Por quê |
|---|---|---|
| etapa é dado do tenant, nome livre | ✅ **mantido** | o funil de uma licitação e o de uma loja moram na mesma tabela |
| funis/esteiras múltiplos por tenant | ✅ **mantido** | venda direta e licitação não andam no mesmo mapa |
| posição `deferrable` para reordenar | ✅ **mantido** | trocar duas posições passa por um instante de empate |
| DELETE de estágio permitido; FK `restrict` protege onde há trabalho | ✅ **mantido** | desenho é tentativa e erro; negociação parada segura o estágio |
| trilha imutável (3 camadas) com NOME CARIMBADO, id solto | ✅ **mantido** | a trilha de 2026 se lê com o vocabulário de 2026 |
| avanço sequencial + pular + devolver com instrução | ⛔ **DIVERGE: o movimento é LIVRE** | a esteira é processo com rito; o funil é MAPA DE TEMPERATURA — a oportunidade esfria e volta sem cerimônia. Burocratizar o vendedor mata o funil. Toda mudança vira trilha: a liberdade é de mover, nunca de apagar |
| `requires_approval` / `skippable` por etapa | ⛔ **DIVERGE: não existem** | as decisões do funil são GANHAR e PERDER, com permissão própria (`decide`); pular não existe porque mover é livre |
| `done → in_progress` (reabre) | ⛔ **DIVERGE: `won`/`lost` são TERMINAIS** | o desfecho é registrado COM RAZÃO; reabrir reescreveria o que se decidiu. O cliente que volta é negociação NOVA — e a história da anterior fica inteira para se aprender |

### 1.1 ⭐ Perder EXIGE razão; ganhar aceita nota

O funil existe para se aprender por que se perde. A razão da perda é
obrigatória na função, no porteiro E na tela; a do ganho é opcional —
"fechou" basta, e exigir relatório de vitória é burocracia.

### 1.2 ⭐ A fronteira com o crm: ID SOLTO + NOME CARIMBADO, nunca FK

Uma `foreign key ... references crm.parties` atravessaria a fronteira de
schema — e a guarda da matriz ("módulo não conhece módulo") reprova o
arquivo. A lei decide: `party_id` solto + `party_name` carimbado no momento
do vínculo. Se a contraparte for arquivada, renomeada ou o crm desinstalado,
a oportunidade continua legível com o nome da época. Negociar não exige
cadastrar: o vínculo é OPCIONAL.

### 1.3 ⭐ O forecast pondera pela MÃO HUMANA — e não inventa número

`probability` é inteiro 0–100 digitado por gente. Sem probabilidade, a
negociação NÃO entra na conta ponderada — contar como 100% inflaria, como 0%
esconderia, e inventar número é o que a Lei 7 proíbe. Score de máquina, se um
dia existir, é capacidade da Forja e coluna própria: mão ≠ máquina.

---

## 2. O QUE ESTE MÓDULO GUARDA

- `deal.funnels` — o mapa, múltiplo por tenant, arquivável (sem DELETE).
- `deal.funnel_stages` — posição + nome, do tenant. A única porta de DELETE.
- `deal.opportunities` — título, descrição, valor+moeda (juntos ou nenhum),
  probabilidade, expectativa de fechamento, vínculo solto, etiquetas
  (`tags text[]`), status, razão do desfecho.
- `deal.opportunity_events` — a trilha imutável: opened/moved/won/lost, com
  de-onde/para-onde carimbados pelo nome.

**Não entra:** lead scoring, cadência de follow-up, metas, comissão
(capacidades vizinhas do Domain, NÃO CONSTRUÍDAS); campos de metodologia
(BANT, SPIN etc. — a descrição carrega).

## 3. OS ATOS

| Função | O quê | Permissão |
|---|---|---|
| `deal.move_opportunity(id, stage, note)` | move para QUALQUER estágio do funil dela, com trilha | `deal.opportunity.manage` |
| `deal.close_opportunity(id, 'won'\|'lost', reason)` | encerra com desfecho; perda exige razão | `deal.opportunity.decide` |

O UPDATE direto de status é vigiado pelo porteiro (mesmas regras); a trilha
não tem porta de INSERT — só as funções escrevem.

## 4. OS CINCO FATOS

| Fato | Quando |
|---|---|
| `deal.opportunity.opened` | a negociação nasceu, no estágio inicial pelo nome |
| `deal.opportunity.moved` | mudou de estágio, em qualquer direção |
| `deal.opportunity.updated` | mudou valor, moeda, probabilidade, expectativa ou vínculo |
| `deal.opportunity.won` | ganha — ato de quem decide |
| `deal.opportunity.lost` | perdida — com a razão obrigatória |

---

## 5. ⛔ NÃO CONSTRUÍDO — aceite da proposta fechar a negociação

`quote.proposal.accepted` fechar a negociação como ganha daria tecnicamente
— o envelope é autossuficiente. Não entra, e a razão é de produto: proposta
e negociação **nem sempre são 1-para-1**. Uma negociação pode ter três
propostas na mesa; aceitar uma não diz qual negociação fechar. O que falta:

1. o VÍNCULO proposta↔negociação (opcional, solto, com nome carimbado —
   como o vínculo com o crm);
2. handler consumindo `quote.proposal.accepted` (padrão E10,
   `envelope.producedBy`);
3. teste triangular.

Sem os três, `consumes` fica vazio — e há guarda no CI conferindo o cartão.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 29/07/2026, na Missão Trina.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `deal` (`0025_deal.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §16) |
| Pacote `@alsham/deals` (manifesto, tipos, motor, quadro, forecast) | ✅ construído, com testes |
| Seed (10º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`15_deal_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/funil` (desenhar, quadro, mover, ganhar/perder) | ✅ CONSTRUÍDO |
| Consumidor `quote` → `deal` | ⛔ **NÃO CONSTRUÍDO** — ver §5 |
| Leads · Follow-up · Metas · Comissão | ⛔ fora de escopo — capacidades vizinhas do Domain |

---

## 7. APPLY (dono)

1. Aplicar `0025_deal.sql` (depois do `0024`).
2. Reaplicar o seed — o 10º cartão entra no catálogo.
3. ⚠️ **Expor o schema `deal` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
