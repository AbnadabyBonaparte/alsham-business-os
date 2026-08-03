# ONDA GOVERNO — o Vertical 🏛 GOVERNO: as 8 capacidades, decisão por decisão

> Fase 3 · `vertical_key='government'` · migrations `0105`–`0108` · testes `95`–`98` ·
> catálogo **89 → 93 módulos publicados**.
> **ARQUIVO — apply é ato do dono. NÃO MERGEIE — o merge é do dono.**
> ⚠️ **Lançamento comercial passa pelo LEXIS antes — decisão do dono, FORA do
> escopo desta onda.** A onda constrói e aplica; vender é outro ato.

O vertical 🏛 Governo (Taxonomia §6, "vertical viva: Peritus, 2 prefeituras"). 8
capacidades: Protocolo · Ouvidoria · Licitações · Convênios · Patrimônio público ·
Tributos · Obras · Fiscalização. Investigada cada uma com a régua anti-viés
("outro município/órgão de outro porte usaria isso exatamente assim?") e a Lei do
Reaproveitamento.

## ⚠️ A ressalva de Lei 3 — e por que ela FECHA duas capacidades

**Lei 3 (Construir × INTEGRAR):** documento com **força legal** emitido/validado
por sistema certificado ou pelo próprio Estado **integra-se, não se constrói** —
construí-lo exporia o cliente a autuação (o precedente NF-e/SPED/eSocial/TISS).
No Governo, DUAS capacidades caem nessa régua:

- **Tributos** (lançamento de IPTU/ISS, guia de arrecadação, dívida ativa): o
  lançamento tributário tem força de título executivo. Errar o lançamento é
  responsabilidade legal do município. **FORA (Lei 3)** — o motor de arrecadação
  é integração certificada. CONSTRUIR seria **decisão explícita do dono**, e o
  dono a manteve FORA (2026-08-03).
- **Auto de infração** (o documento-penalidade da Fiscalização): tem força de
  lei — multa, prazo de defesa, contraditório. Emiti-lo é ato de império do
  Estado. **FORA (Lei 3).** ⚠️ Note o recorte: a Fiscalização **não** fica
  inteira FORA — só o auto de infração. A atividade de VISTORIA (o fiscal vai a
  campo e constata) é construível, e vira o `fisc` (ver capacidade 8).

## A mineração do Peritus (referência de física, NÃO integração em runtime)

O repo `peritus` (banco `tutluattkjcswuowgjwv`, "referência de segurança do
império", 2 municípios com dado real) é a peça-referência mais forte já usada em
qualquer onda — é literalmente um sistema forense/municipal. Minerado como
REFERÊNCIA DE FÍSICA (⚠️ **NÃO VERIFICADO** aqui — nenhum agente conecta a banco
com dado de cliente, §3):

- `processos` (o processo com número, interessado, movimentação) + `timeline`
  (log por processo) → a física do `proc` (o protocolo público que anda por
  etapas do tenant e termina em decisão formal).
- `documentos.sigiloso` (flag de sigilo) + `audit_log` → o padrão de
  confidencialidade e trilha, já provado no `whistle`, reaproveitado no `ombuds`.
- `agendamentos`/vistorias periódicas → a física de roster + livro de campo,
  aplicada no `fisc`.

## As 8 capacidades

| # | Capacidade | Decisão | Argumento |
|---|---|---|---|
| 1 | **Protocolo** | ✅ **módulo `proc`** (`0105`) | O processo administrativo é a porta da frente do Governo. Reaproveita a **Lei das Etapas do `ops`** (etapas são DADO DO TENANT, nunca enum; a carta anda pelas etapas), RE-PERGUNTADA para o processo PÚBLICO — como o `kanban` reusou o `ops` num escopo próprio (NÃO é "instalar o `ops` de novo", a lição escrita). O DIVERGE: **número de protocolo** (identidade pública que o cidadão cita para acompanhar), **interessado** (id solto + nome carimbado, o padrão do `deal`), e **decisão formal** terminal (`deferido`/`indeferido`/`arquivado` — o ato de império, não o `done`/`cancelled` neutro do `ops`). Etapa carimbada pelo NOME na trilha (a lição do `ops`: sobrevive ao redesenho). |
| 2 | **Ouvidoria** | ✅ **módulo `ombuds`** (`0106`) | Reaproveita DELIBERADAMENTE o **anonimato-físico do `whistle`** (gatilho descarta `auth.uid()` se anônima + CHECK `not is_anonymous or reporter_id is null` + RLS que casa por `reporter_id` — a única forma de nunca vazar é nunca gravar), com escopo re-perguntado e assinado (o precedente `spc→shift`/`fund`: duplicar física é lícito quando o escopo diverge e cada decisão é reescrita). O DIVERGE do `whistle` (GRC, colaborador→má-conduta interna): aqui é **cidadão→órgão público** (Lei 13.460), com **tipo de manifestação** (`complaint`/`report`/`suggestion`/`compliment`/`information`, CHECK — física do método, não vocabulário de casa) e **protocolo público** para acompanhamento anônimo. O relato nasce imutável; o tratamento anda (`received → under_review → answered/dismissed`). O relato NÃO passeia no envelope. |
| 3 | **Licitações** | ✅ **módulo `bid`** (`0107`) | Reaproveita a identidade "**o comprador premia**" do `rfq` (enviar/publicar CONGELA o conteúdo; o terminal é a escolha de quem conduz, não a resposta do fornecedor). O DIVERGE assinado do `rfq`: a licitação tem o **edital** como âncora publicada + **`homologated`** como ato terminal distinto e mais solene (Lei 14.133: publicar → receber propostas → julgar → homologar/adjudicar). Modalidade/tipo em TEXTO LIVRE (pregão, concorrência… variam e mudam por lei — enum envelheceria). ⛔ **Publicação no PNCP** (Portal Nacional de Contratações Públicas) é integração certificada com o Estado → FORA (Lei 3), como o PNCP é o "NF-e da compra pública". |
| 4 | **Convênios** | ⛔ **FORA → `ctr`** | O precedente EXATO da Saúde (Convênios→`ctr`): o convênio/repasse é um **contrato** genérico — vigência, valor, partes, aditivos — categoria "convênio" no `ctr`, com a mesma lição do `lease` (camada fina sobre o `ctr`, não o reescreve). O repasse financeiro é o `cash`/`bank`; a prestação de contas é o `pcost`/`chk` (futuros por id solto). Zero módulo novo. |
| 5 | **Patrimônio público** | ⛔ **FORA → `pat`** | É o `pat` genérico (Módulo 18) sem uma linha diferente: a localização vigente é view calculada, a transferência é ato imutável, a baixa é terminal. O **nº de tombamento** (a identidade pública do bem) é o campo `reference` em TEXTO LIVRE. Uma frota, um prédio e um computador públicos usam o `pat` como qualquer empresa usa. |
| 6 | **Tributos** | ⛔ **FORA (Lei 3)** | Ver a ressalva acima. Lançamento de IPTU/ISS/dívida ativa tem força de título executivo — integra-se com o sistema de arrecadação certificado. FORA é o default seguro; CONSTRUIR exigiria decisão de dono explícita (mantida FORA em 2026-08-03). |
| 7 | **Obras** | ⛔ **FORA → `proj`+`sched`+`pcost`** | A obra pública é um **projeto** com cronograma e custos — as peças do PMO já resolvem (`proj` encerra e não reabre; `sched` marcos; `pcost` livro de custos). A **medição de obra** (boletim que autoriza pagamento) é do ofício da vertical **Construção Civil** (Taxonomia §6: "Obras · Medições · Diário de obra…"), não do Governo — construí-la aqui seria roubar a peça do vertical vizinho. No Governo, Obras reaproveita o genérico. |
| 8 | **Fiscalização** | ✅ **módulo `fisc`** (`0108`) + ⛔ auto FORA (Lei 3) | ⭐⭐ **A decisão de dono (2026-08-03): CONSTRUIR o `fisc`.** A régua não é "dá pra encaixar em outro módulo" — é "a **física é a MESMA**". O `occ` pressupõe que o alvo já existe em outro lugar (o ativo do `mnt`, o tenant do `care`); ele NÃO carrega um **cadastro de alvos próprio**. A fiscalização municipal trabalha ao contrário: existe um **rol de estabelecimentos/imóveis sob jurisdição** que precisam ser vistoriados periodicamente — isso é ROSTER, não ocorrência solta. É EXATAMENTE a física do `sec` (Segurança/Rondas): **posto/alvo + livro de ronda imutável**. O `fisc` = **alvo fiscalizável** (`active ↔ archived`, a física do `sec`/`mall`) + **vistoria** (ato pontual IMUTÁVEL carimbado pelo servidor, `finding` texto livre). ⛔ **O auto de infração continua FORA (Lei 3)** — a vistoria constata; a penalidade com força de lei integra-se. |

**Resultado:** **4 módulos construídos** (`proc`·`ombuds`·`bid`·`fisc`) + **4
capacidades DECLARADAS FORA** (Convênios→`ctr`, Patrimônio→`pat`, Tributos→Lei 3,
Obras→`proj`/`sched`/`pcost`). Catálogo **89 → 93**.

## Anti-viés aplicado

- ⛔ Nenhum enum fechado para tipo de processo, modalidade de licitação, órgão
  fiscalizador, natureza do alvo — TEXTO LIVRE, dado do tenant (o município/órgão
  define seu próprio vocabulário; um enum congelaria a lei de um ano e um país).
- ⛔ Os únicos CHECK são de **física do método**, não de vocabulário: o tipo de
  manifestação do `ombuds` (as 5 naturezas clássicas da Lei 13.460), e as máquinas
  de estado (`proc`/`bid`) — que são ciclo de vida, não taxonomia de casa.

## Números da onda

- Migrations `0105`–`0108` (4 módulos) · testes SQL `95`–`98` · seed 4 cartões
  `vertical_key='government'` · `consumes` VAZIO nos quatro (sem redeploy do
  `apps/api`; guarda de CI confere).
- ⚠️ Ao aplicar: **expor os schemas `proc`, `ombuds`, `bid`, `fisc` na Data API**.
  Nenhum consome evento.
- ⭐ Vínculos por ID SOLTO (o interessado do `proc`, o vencedor do `bid`) — o mapa
  SCHEMA_DE do CI reprova a leitura de schema alheio; as FKs `proc.movements`→
  `proc.processes`, `bid.proposals`→`bid.tenders`, `fisc.inspections`→`fisc.targets`
  são INTRA-schema e permitidas.
