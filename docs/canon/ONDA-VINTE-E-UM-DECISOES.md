# ONDA VINTE E UM — o Vertical 🏥 SAÚDE: as 8 capacidades, decisão por decisão

> Fase 3 · `vertical_key='health'` · migrations `0100`–`0104` · testes `90`–`94` ·
> catálogo **84 → 89 módulos publicados**.
> **ARQUIVO — apply é ato do dono (runbook §34). NÃO MERGEIE — o merge é do dono.**
> ⚠️ **Lançamento comercial passa pelo LEXIS antes — decisão do dono, FORA do
> escopo desta onda.** A onda constrói e aplica; vender é outro ato.

O vertical 🏥 Saúde (Taxonomia §6, "vertical viva: Peritus / Medical OS™"). 8
capacidades: Pacientes · Agenda médica · Prontuário · Convênios · Receitas ·
Exames · Faturamento TISS · Telemedicina. Investigada cada uma com a régua
anti-viés ("outra clínica/consultório/hospital de outro porte usaria isso
exatamente assim?") e a Lei do Reaproveitamento.

## ⚠️ A ressalva de dado sensível (LGPD Art. 5º, II) — e a decisão da trilha de LEITURA

Prontuário, Exames e Receitas são **dado sensível de saúde**. O padrão técnico
não muda (RLS enable+FORCE, zero grant `anon`, imutabilidade, carimbo do
servidor), mas exige uma decisão a mais, que grandes sistemas de saúde tomam:

⭐⭐ **DECISÃO — trilha de LEITURA nos três módulos clínicos.** A trilha de
ESCRITA da plataforma (`core.audit_log`) responde "quem MUDOU o quê". Dado de
saúde exige também "quem CONSULTOU o prontuário de quem, quando" — é a
_accountability_ que a LGPD cobra e que Epic/Cerner e todo EHR sério
implementam. Por isso `record`, `exam` e `prescription` ganham um **livro de
acesso IMUTÁVEL** (`*.access_log`): uma função de leitura `security definer`
carimba `usuário → paciente → quando` **antes** de devolver o dado sensível. O
`patient` (cadastro demográfico) e o `appointment` (agenda) ficam no padrão de
escrita — não carregam conteúdo clínico.

⭐ **Nenhuma consolidação que misture dado sensível com dado comum.** O
`patient` NÃO é o `crm` com campos a mais (isso misturaria PHI com contato
comercial na mesma vala); os exames NÃO vão para o `media` genérico. Cada
schema clínico é sua própria vala isolada.

## A mineração do Peritus (referência de física, NÃO integração em runtime)

O repo `peritus` (banco `tutluattkjcswuowgjwv`, "referência de segurança do
império", 2 municípios com dado real) foi minerado como REFERÊNCIA. ⚠️ **É um
sistema FORENSE/municipal** (processos, junta médica, pareceres), **não um EHR
clínico** — então as tabelas clínicas (paciente/prontuário/receita/exame)
são **NÃO VERIFICADO** no Peritus, e a física clínica foi desenhada aqui, como
o bastão permite. O que foi reaproveitado como referência real:

- `agendamentos` (`data_hora`, `local`, **`comparecimento`** enum) → a física de
  agenda com **no-show**, aplicada no `appointment`.
- `documentos.sigiloso` (flag de sigilo) → o conceito de marca de sensibilidade.
- `timeline` (log por processo) e `audit_log` → o padrão de trilha, estendido
  para a trilha de LEITURA acima.

## As 8 capacidades

| # | Capacidade | Decisão | Argumento |
|---|---|---|---|
| 1 | **Pacientes** | ✅ **módulo `patient`** (`0100`) | NÃO consolida no `crm` — misturaria dado sensível com contato comercial (proibição LGPD). Vala própria: nome neutro, nº de prontuário TEXTO LIVRE, nascimento, plano TEXTO LIVRE (o convênio do paciente). `active ↔ archived` (o paciente que volta é o MESMO — a física do `crm`/`catalog`). |
| 2 | **Agenda médica** | ✅ **módulo `appointment`** (`0101`) | A física do `agendamentos` do Peritus + regras de domínio: horário, profissional (id solto, registro TEXTO LIVRE — CRM/CRO/CRP variam), paciente (id solto ao `patient`), e o ciclo com **no-show**: `scheduled → attended`/`no_show`/`cancelled`. O no-show é domínio-específico e justifica módulo próprio (o Engine de Agenda genérico não modela falta). |
| 3 | **Prontuário** | ✅ **módulo `record`** (`0102`) | O coração. Cada entrada é FATO CONSUMADO IMUTÁVEL (a física do `genreading`/`occ`, duas camadas) — corrigir é lançar OUTRA, nunca editar. Paciente id solto, autor carimbado. ⭐⭐ **+ trilha de LEITURA** (`record.access_log`). |
| 4 | **Convênios** | ⛔ **FORA → `ctr`** | O contrato com a operadora é o `ctr` genérico, categoria "convênio" (o precedente do `lease` para locação). O plano do paciente é campo TEXTO LIVRE no `patient`. Zero módulo novo. |
| 5 | **Receitas** | ✅ **módulo `prescription`** (`0103`) | Documento regulado e distinto: emitir CONGELA (a física do `quote`/`chk`), itens TEXTO LIVRE (medicamento + posologia), prescritor carimbado. ⭐⭐ **+ trilha de LEITURA**. ⛔ Assinatura digital = Engine (reaproveita, não reconstrói); controle especial/SNGPC = integração regulada (Lei 3), FORA. |
| 6 | **Exames** | ✅ **módulo `exam`** (`0104`) | Pedido → resultado (duas fases): o pedido nasce, o resultado é ato IMUTÁVEL apenso (a física do `chk`: o modelo congela, a resposta não se rasura). Tipo TEXTO LIVRE. ⭐⭐ **+ trilha de LEITURA**. ⛔ Laudo/imagem em Storage = capacidade do Core não construída, FORA (o `reference` é texto). |
| 7 | **Faturamento TISS** | ⛔ **FORA (Lei 3)** | TISS é padrão ANS regulado de faturamento em saúde suplementar (como NF-e/SPED/eSocial). Construir um motor TISS exporia a clínica a risco regulatório — **INTEGRA-SE, não constrói**. FORA é o default seguro; só CONSTRUIR exigiria decisão de dono explícita (não tomada). |
| 8 | **Telemedicina** | ⛔ **FORA → Engine de Vídeo** | Reaproveita o Engine de Vídeo da plataforma; a consulta por vídeo amarra-se ao `appointment` por id solto (o precedente Manutenção→`mnt`/Telemedicina não reconstrói o Engine). |

**Resultado:** **5 módulos construídos** (`patient`·`appointment`·`record`·
`exam`·`prescription`) + **3 capacidades DECLARADAS FORA** (Convênios→`ctr`,
TISS→Lei 3, Telemedicina→Engine). Catálogo **84 → 89**.

## Anti-viés aplicado

- ⛔ Nenhum enum fechado para tipo de convênio, especialidade, tipo de exame,
  medicamento — TEXTO LIVRE, dado do tenant.
- ⛔ Registro profissional (CRM/CRO/CRP/COREN…) é TEXTO LIVRE — conselhos variam
  por profissão e região; lista fechada envelheceria o produto.

## Números da onda
- Migrations `0100`–`0104` (5 módulos) · testes SQL `90`–`94` · seed 5 cartões
  `vertical_key='health'` · `consumes` VAZIO (sem redeploy do `apps/api`).
- ⚠️ Ao aplicar: **expor os schemas `patient`, `appointment`, `record`, `exam`,
  `prescription` na Data API**. Nenhum consome evento.
