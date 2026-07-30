# 📢 MÓDULO 25 — CALENDÁRIO EDITORIAL

## ALSHAM Business OS™ · Especificação do módulo · Domain `marketing`

> Leitura obrigatória para quem for mexer no schema `edcal` ou no pacote
> `@alsham/editorial`.
>
> **Leia junto com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)** — a Lei das
> Etapas, que aqui tem a QUARTA aplicação — e com
> [MODULO-DEAL-SPEC](MODULO-DEAL-SPEC.md), a trilha imutável com id solto
> e nome carimbado.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `edcal`.** "calendário" é prosa constante do canon; `cal`
é ambíguo demais para grep com fronteira. `edcal` diz o que é — o
calendário EDITORIAL — e não colide com nada na frota.

**`domain_key` = `marketing`.** A Taxonomia §5 põe *Calendário* na linha
do 📢 Marketing; este módulo é a leitura editorial dessa capacidade — a
pauta que vira peça, a peça que vai ao ar. O `evt` saiu da MESMA linha:
cada capacidade é um módulo, como manda o Lego.

**⭐ O CANAL É TABELA DO TENANT** — nunca enum (a lição do canal do crm,
valendo dobrado no marketing: a rede da moda muda de nome mais rápido que
schema em produção). Canal arquivado não recebe pauta NOVA; e **volta do
arquivo** (o argumento do crm: o canal que volta é o MESMO canal, com a
história inteira).

**⭐ A LEI DAS ETAPAS — QUARTA APLICAÇÃO** (ops, deal, dun, edcal). O
fluxo editorial (pauta → redação → revisão → arte…) é DESENHO DO TENANT
(`edcal.stages`), com movimento LIVRE e trilha imutável — id solto + nome
carimbado (regra do ops). ⭐ **RE-PERGUNTADO e DIVERGIDO do ops:
`requires_approval` NÃO veio** — aprovação multi-nível está FORA (§5);
copiar a flag "por consistência" seria o erro que o canon proíbe. Há
teste de contraste que assina os dois lados.

**⭐ PUBLICADA/DESCARTADA É FÍSICA, à parte do desenho.** As etapas são do
tenant; o FIM é do produto: toda pauta do mundo ou vai ao ar
(`published`) ou morre (`dropped`) — CHECK argumentado, a física da onda
(como o corretiva/preventiva do mnt). REGISTRAR a publicação carimba a
**DATA REAL pelo servidor, ao lado da planejada** — o módulo não publica
nada (Lei 3): registra o ATO, feito por gente. Descartar exige a razão.
**Os dois fins são TERMINAIS**: a pauta que revive é pauta nova.

**⭐ A RE-PERGUNTA DO REAGENDAMENTO — decidida e escrita.** Reagendar
antes do fim é **UPDATE honesto, SEM trilha**: o calendário é PLANO, não
fato — trilha de plano soterraria a trilha dos fatos. A honestidade mora
no PAR de datas: ao publicar, a peça congela com a última `planned_on` E
a `published_at` real — o desvio plano × fato fica gravado para sempre,
peça a peça. **E o fim CONGELA a peça** (título, canal, datas): registro
de fato não se reescreve (a física do quote/comm).

**⭐ O texto de trabalho (`brief`) não passeia no envelope** — o correio
entrega o fato (o quê, onde, quando planejado, quando real), não a
redação.

---

## 1. AS PEÇAS

- `edcal.channels`: os canais do tenant — nascem, arquivam, voltam.
- `edcal.stages`: o fluxo editorial — desenho do tenant, com a ÚNICA
  porta de DELETE do schema (redesenhar inclui apagar; contrapeso: FK
  `restrict` das peças paradas + trilha com nome carimbado).
- `edcal.pieces`: a pauta — título, texto de trabalho, canal, etapa, o
  PAR de datas e o fim.
- `edcal.piece_events`: a trilha dos FATOS (nascer, mover, fim) —
  imutável em 3 camadas; quem escreve são a função de mover e os
  gatilhos, nunca a aplicação.
- `edcal.move_piece()` / `edcal.close_piece()`: os ATOS — mover com
  trilha; registrar o fim (publicou, com data do servidor / morreu, com
  razão).

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `edcal.piece.planned` | a pauta nasceu no calendário |
| `edcal.piece.moved` | mudou de etapa — de/para pelo NOME |
| `edcal.piece.published` | o ATO de ir ao ar foi registrado. Terminal |
| `edcal.piece.dropped` | a pauta morreu, com razão. Terminal |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5. Reagendar
NÃO emite fato: é plano, não fato.

## 3. AS TELAS

`/calendario`: o calendário na ordem de leitura (`orderCalendar()` — a
planejada mais próxima primeiro), as atrasadas apontadas
(`latePieces()`), planejar, reagendar (livre, com a explicação do PAR),
mover pelo fluxo, registrar o fim em dois passos, desenhar canais e
etapas. Porta própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`design.manage` (canais e etapas), `piece.manage` (planejar, editar o
plano, mover) e `piece.decide` (registrar o fim). Quem desenha o fluxo
não é quem decreta o fim da pauta.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Auto-publicação na rede | **Lei 3** — integração declarada: o módulo registra o ATO de publicar; o transporte até a rede é de fora (coletor/publicador externo → API com chave, padrão Forja) |
| Arquivo/preview de arte | *Storage & Arquivos* é capacidade do Core, não construída — `brief` é texto |
| Aprovação multi-nível | decisão de canon: a flag `requires_approval` do ops NÃO veio; quando houver aprovação editorial, ela nasce re-perguntada, não herdada |
| Métricas de engajamento | integração futura de LEITURA (a rede é quem sabe) — nenhum número decorativo aqui |
| Trilha de replanejamento | decisão de canon (§0): o calendário é plano; a honestidade é o par planned × real, não um diário de intenções |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sexta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `edcal` (`0040_edcal.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §19) |
| Pacote `@alsham/editorial` (ciclo, fluxo, calendário, validação) | ✅ construído, com testes |
| Seed (25º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`30_edcal_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/calendario` (calendário, fluxo, fim em dois passos) | ✅ CONSTRUÍDO |
| Auto-publicação · arte · aprovação em níveis · métricas | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0040_edcal.sql` (depois do `0039`).
2. Reaplicar o seed — o 25º cartão entra.
3. ⚠️ **Expor o schema `edcal` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
