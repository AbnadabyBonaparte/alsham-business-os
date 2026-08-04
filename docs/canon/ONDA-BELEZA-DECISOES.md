# ONDA BELEZA — o Vertical 💇 Beleza & Estética: as 6 capacidades, decisão por decisão

> Fase 3 · `vertical_key='beauty'` · migrations `0112`–`0115` · testes `102`–`105` ·
> catálogo **96 → 100 módulos publicados**.
> **ARQUIVO — apply é ato do dono. NÃO MERGEIE — o merge é do dono.**
> ⚠️ **Lançamento comercial passa pelo LEXIS antes — decisão do dono, FORA do
> escopo desta onda.** A onda constrói e aplica; vender é outro ato.

O vertical 💇 Beleza & Estética (Taxonomia §6, "vertical viva: Suprema Beleza").
6 capacidades: Agendamento · Profissionais · Comissões · Pacotes · Fidelidade ·
Estoque de produtos.

## A PEDREIRA — o Suprema é DOSSIÊ, não precedente provado

⚠️ Diferente do **Peritus** (referência PROVADA em produção, minerada para Saúde e
Governo), o **Suprema Beleza** está registrado no Balanço de Tecnologia como
**DOSSIÊ** — documento de design, não código provado. Minerou-se o VOCABULÁRIO e a
física PROPOSTA; a física real foi **decidida por conta própria**, ancorada nos
precedentes já PROVADOS no CI (o no-show do `appointment`, o livro imutável do
`timesheet`, o saldo-recusa do `loyalty`/`invest`, o `active ↔ archived` do
`vendor`/`mall`). Onde o dossiê seria insuficiente, o precedente testado venceu.

## Anti-viés aplicado

- ⛔ **Tipo de serviço** (corte, coloração, escova, limpeza de pele, procedimento
  estético) é **TEXTO LIVRE**, nunca enum — um salão de bairro e uma clínica de
  estética avançada não usam o mesmo vocabulário, e congelar o vocabulário de um
  faria o produto envelhecer com ele.
- ⛔ Especialidade do profissional, cota de pacote, nome do serviço — todos TEXTO
  LIVRE, dado do tenant.

## As 6 capacidades

| # | Capacidade | Decisão | Argumento |
|---|---|---|---|
| 1 | **Agendamento** | ✅ **módulo `booking`** (`0112`, Módulo 97) | Reaproveita a **FÍSICA do `appointment`** (o no-show provado na Saúde: `scheduled → attended \| no_show \| cancelled`, os três TERMINAIS, carimbo do desfecho pelo servidor), **NÃO o módulo**. ⭐ **O DIVERGE assinado:** o cliente é o `crm` por id solto (NÃO o `patient`/PHI), o serviço é TEXTO LIVRE, o profissional é id solto ao `professional`, e **não há trilha clínica** — agendar um corte não é ato de saúde. É o padrão `shift`←`spc` / `genreading`←`esg`: mesma física, módulo próprio. |
| 2 | **Profissionais** | ✅ **módulo `professional`** (`0113`, Módulo 98) | O roster de quem executa o serviço (cabeleireiro, manicure, esteticista). Nome + especialidade TEXTO LIVRE. ⭐ **`active ↔ archived` — o DIVERGE do `hr` terminal:** o profissional que sai e volta é o MESMO (a física do `vendor`/`mall`), enquanto o `hr` desliga em definitivo. ⭐ **Não é o `hr`:** a **cadeira alugada a um independente** não tem registro de RH, e o `hr` não modela a relação de comissão por serviço. Vínculo id solto OPCIONAL ao `hr` quando o profissional for, também, colaborador. |
| 3 | **Comissões** | ✅ **módulo `commission`** (`0114`, Módulo 99) | ⭐ **Física genuinamente PRÓPRIA** (o próprio bastão a nomeia): o comissionamento do profissional por serviço prestado. É um **LIVRO IMUTÁVEL** (a física do `timesheet`/`pcost`/`loyalty`): profissional id solto + nome, serviço TEXTO LIVRE, base e valor da comissão em centavos, imutável em 2 camadas. ⚠️ **NÃO é motor de cálculo** (Lei 7): o valor da comissão é REGISTRADO por quem lança, nunca derivado por regra automática — calcular a partir de uma tabela de % seria engine futura. Corrigir é lançar o ato inverso. |
| 4 | **Pacotes** | ✅ **módulo `pack`** (`0115`, Módulo 100) | O bundle FECHADO de sessões (comprou 10 escovas, consome 1 por visita). ⭐ **Reaproveita a física do `loyalty`/`invest`** — o saldo é VIEW (comprado − consumido) e **consumir mais que o saldo é RECUSADO** (a terceira resposta). ⭐⭐ **O DIVERGE do `loyalty`:** o ponto do `loyalty` é FUNGÍVEL (uma carteira genérica); o pacote é um bundle bound a UM serviço (texto livre) e UM cliente — tem identidade de compra própria. Duas tabelas: `pack.packages` (a compra) + `pack.uses` (o consumo, livro imutável). |
| 5 | **Fidelidade** | ⛔ **FORA → `loyalty`** (Módulo 74) | O programa de PONTOS é, ao pé da letra, o `loyalty` (Varejo) — mesmo `canonicalName` "Fidelidade", livro de pontos imutável, saldo VIEW, resgate>saldo recusado, cliente por id solto ao `crm`. O salão instala o `loyalty` (o bastão o lista como candidato de reaproveitamento). A distinção do `pack` é nítida: **ponto fungível × bundle fechado de sessões**. Zero módulo novo. |
| 6 | **Estoque de produtos** | ⛔ **FORA → `inv` (+ `catalog`)** | O estoque de shampoos/tintas/cosméticos é o `inv` genérico (Módulo 8 — o livro de movimentos, saldo VIEW); o cadastro de "o que é cada produto" é o `catalog` (Módulo 72). A VENDA de produto (comanda) é o `pdv` (Varejo). Nada disso tem física de Beleza além do que os genéricos já provam. Zero módulo novo. |

**Resultado:** **4 módulos construídos** (`booking`·`professional`·`commission`·
`pack`) + **2 capacidades DECLARADAS FORA** (Fidelidade→`loyalty`, Estoque de
produtos→`inv`/`catalog`). Catálogo **96 → 100**. ⭐⭐ **O `pack` é o Módulo 100 do
catálogo** — a meta "rumo aos 100 módulos" alcançada nesta onda.

## Lei 3 — o que ficou FORA por regulação sanitária

⛔ **Anamnese estética / ficha técnica de procedimento invasivo NÃO entra** — e não
é uma das 6 capacidades. Procedimento invasivo com exigência de responsável técnico
(preenchimento, laser, toxina) carrega prontuário clínico e responsabilidade
sanitária: se um dia for necessário, é a física do `record` da Saúde (trilha de
leitura, PHI), com decisão de dono e filtro LEXIS — nunca um campo solto no
`booking`. O `booking` agenda um SERVIÇO por nome livre; ele não descreve
procedimento clínico, não guarda evolução e não emite receita.

## Lei do Lego respeitada

- Schema próprio por módulo; vínculos por **ID SOLTO** (cliente `crm`, profissional
  `professional`, colaborador `hr`, serviço TEXTO LIVRE) — nunca FK cruzada. As FKs
  intra-schema (`pack.uses → pack.packages`) são permitidas; o mapa SCHEMA_DE do CI
  reprova a leitura de schema alheio.
- `consumes` **VAZIO** nos quatro → **sem redeploy do `apps/api`**.

## Números da onda

- Migrations `0112`–`0115` (4 módulos) · testes SQL `102`–`105` · seed 4 cartões
  `vertical_key='beauty'` · `consumes` VAZIO nos quatro.
- ⚠️ Ao aplicar: **expor os schemas `booking`, `professional`, `commission`,
  `pack` na Data API** do Supabase (Project Settings → API → Exposed schemas).
  Nenhum consome evento.
