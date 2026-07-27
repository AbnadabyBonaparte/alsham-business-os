# 🧾 MÓDULO 1 — CONCILIAÇÃO & APROVAÇÕES
## Especificação · ALSHAM Business OS™

**Versão:** 0.1.0 · **Data:** 27/07/2026 · **Status:** Canônico
**Subordinação:** obedece à [Taxonomia](TAXONOMIA-EMPRESARIAL-ALSHAM.md), ao [Roadmap](ROADMAP-TECNICO-V1.md) e ao [CORE-SPEC](CORE-SPEC.md). Em divergência, os três vencem.

**Onde vive:** Domain `finance` (Taxonomia §5, Financeiro — 19 capacidades). Implementa duas: **Conciliação bancária** e **Aprovações financeiras**. As outras 17 não existem e não estão declaradas.

**Fase:** Fase 3 do Roadmap — Smart Reconciliation™.

**Peças:**

| Peça | O que é |
|---|---|
| `packages/finance-reconciliation/` | manifesto + tipos + motor de sugestão + parser de OFX/CSV (domínio puro) |
| `supabase/migrations/0002_recon.sql` | schema `recon` — **aplicado em produção** (§7) |
| `apps/portal/` | as quatro telas do módulo — importar, conciliar, aprovar, fechar |

> **Lei 7:** o que não foi construído está marcado **NÃO CONSTRUÍDO**, e o estado corrente de cada peça está em **[§7](#7-estado-da-obra--o-que-existe-e-o-que-não-existe)** — atualizado a cada etapa, não congelado na etapa que escreveu este documento.

---

## 1. O PROBLEMA, EM UMA CENA

Todo mês alguém senta com o extrato do banco de um lado e a relação de contas a pagar do outro, e vai riscando linha por linha com régua e caneta. O que casa, casa. O que sobra vira uma pilha para o diretor olhar — e a pilha fica na mesa dele até alguém cobrar.

Duas dores, não uma: **o casamento manual** e **a mesa do diretor**.

Este módulo ataca as duas. A primeira com sugestão automática de baixa; a segunda com uma fila que tem estado, visto e trilha — em vez de uma pilha de papel que ninguém sabe onde parou.

---

## 2. O QUE ESTE MÓDULO EXISTE PARA PROVAR

Ele é o primeiro módulo de produto sobre o Core. Se ele nascer sem importar nenhum outro módulo, o Lego funciona. Se não, o Core está errado e é melhor descobrir agora, com um módulo, do que depois, com quinze.

Quatro regras que ele não quebra — e que o parser confere, não a boa vontade:

1. **Não cria nada no schema `core`.** Todo objeto nasce em `recon`.
2. **Não conhece outro módulo.** A única porta para fora é `recon.emit_event()`.
3. **Não lê tabela de outro módulo.** `recon.payables` é projeção local (§5).
4. **Depende só do Core** — `requiresCore` é o único campo de dependência que o `ModuleManifest` tem.

---

## 3. O FLUXO QUE SUBSTITUI RÉGUA E CANETA

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 1. IMPORTAR O EXTRATO                     permissão: recon.statement.import │
  │                                                                     │
  │    OFX · CSV · CAMT.053 · manual → recon.bank_statements            │
  │                                  → recon.statement_lines            │
  │                                                                     │
  │    `content_hash` impede reimportar o mesmo arquivo duas vezes.     │
  │    Formato é padrão ABERTO; o layout do CSV de um banco específico  │
  │    é `settings.import.csvMapping` — configuração, não schema.       │
  └────────────────────────────────┬────────────────────────────────────┘
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 2. O SISTEMA SUGERE                          suggestMatches()       │
  │                                                                     │
  │    Pontua cada par linha↔título por 5 sinais, com peso:             │
  │       valor (5) · documento fiscal (4) · referência (3)             │
  │       · data (2) · nome (1)                                         │
  │                                                                     │
  │    Portão eliminatório ÚNICO: o valor. Fora da tolerância, não há   │
  │    score que salve — conciliação que casa valores diferentes não é  │
  │    conciliação.                                                     │
  │                                                                     │
  │    ⚠️ Tolerâncias e limiar NÃO estão no código nem no schema.       │
  │    Vêm de `core.tenant_modules.settings`. Uma empresa aceita 0.95,  │
  │    outra exige 0.99, outra não aceita nada sem humano olhar.        │
  │                                                                     │
  │    → recon.reconciliation_matches (status 'suggested', origin 'auto')│
  └────────────────────────────────┬────────────────────────────────────┘
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 3. O HUMANO CONFERE                          permissão: recon.match.manage │
  │                                                                     │
  │    Confirma, rejeita ou monta o casamento na mão                    │
  │    (origin 'manual' — humano não tem score, humano tem              │
  │    responsabilidade).                                               │
  │                                                                     │
  │    O que sobrou é A DIVERGÊNCIA: unmatchedLines(). É o número que   │
  │    interessa — não o que casou, e sim o que não casou.              │
  └────────────────────────────────┬────────────────────────────────────┘
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 4. A FILA, EM VEZ DA MESA                    recon.approval_queue   │
  │                                                                     │
  │    O item entra com status 'pending'. Tem dono, tem data, tem       │
  │    valor. Não fica embaixo de outra pilha.                          │
  │                                                                     │
  │    ⚠️ A fila NÃO decide nada. Ela guarda o que foi decidido.        │
  │    "Acima de X, dois diretores" é `settings.approval.*` — política  │
  │    do tenant, nunca tabela do produto.                              │
  └────────────────────────────────┬────────────────────────────────────┘
                                   │ permissão: recon.approval.decide
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 5. O VISTO                                                          │
  │                                                                     │
  │    status → 'approved' | 'rejected', com decided_by, decided_at e   │
  │    a observação. O CHECK do banco não deixa existir decisão sem     │
  │    decisor: ou é 'pending' sem os dois, ou é decidido com os dois.  │
  │                                                                     │
  │    trigger → recon.emit_event('recon.approval.decided')             │
  │            → core.event_outbox (MESMA transação)                    │
  │            → o Core entrega e escreve core.audit_log                │
  │                                                                     │
  │    O módulo NÃO escreve auditoria direto. Ator nenhum escreve a     │
  │    própria auditoria.                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Por que `recon.match.manage` e `recon.approval.decide` são separadas

Porque **quem concilia não precisa ser quem visa**. É a segregação de funções mais básica que existe em financeiro. Se uma empresa quiser que seja a mesma pessoa, basta pôr as duas permissões no mesmo papel — o produto **permite**, mas não **presume**.

O contrário — uma permissão só — não teria volta: nenhuma configuração recria uma separação que o schema não tem.

---

## 4. OS TRÊS EVENTOS

Todos saem por `recon.emit_event()`, gravados na **mesma transação** do dado que descrevem. Todos declarados no `ModuleManifest` — nada sai daqui que não esteja no manifesto.

| Evento | Quando | Por quê |
|---|---|---|
| `recon.reconciliation.completed` | extrato fechado | traz total de linhas, quantas casaram e **quantas sobraram** |
| `recon.approval.decided` | humano visou | quem, quando, qual decisão, com que observação |
| `recon.statement.discarded` | extrato descartado | a ação destrutiva do módulo — some da operação, nunca da trilha |

Descartar não apaga linha: `status = 'discarded'`. Não há policy de DELETE em `bank_statements` nem em `approval_queue`. **Extrato apagado é conciliação sem prova.**

---

## 5. `recon.payables` É PROJEÇÃO, NÃO FONTE DA VERDADE

Decisão de arquitetura que merece conferência.

*Contas a pagar* é uma capacidade **própria** do Domain Financeiro, de um futuro módulo AP. Se este módulo fosse o dono dela, deixaria de ser o módulo de conciliação e viraria meio ERP — e o módulo AP nasceria brigando com ele por território.

Por isso `recon.payables` guarda só a cópia necessária para conciliar:

- `source = 'imported'` — não há módulo AP instalado; o tenant importa os títulos;
- `source = 'event'` — um módulo AP existe e emitiu o fato; este módulo guardou a própria cópia.

Em nenhum dos dois casos este módulo lê a tabela de outro. É o padrão do CORE-SPEC: **o acoplamento é com o tipo do evento, que é contrato público, nunca com o código de quem o emitiu.**

**Estado honesto:** o handler que consome `finance.payable.registered` está **NÃO CONSTRUÍDO**, e por isso `manifest.events.consumes` está **vazio**. Declarar consumo sem consumidor faria o Core acordar um módulo que não sabe responder — promessa no ar, e a Lei 7 proíbe. Hoje os títulos entram por importação, e o módulo funciona inteiro sozinho. É o Lego: nada quebra por ninguém estar do outro lado.

---

## 6. O TESTE ANTI-VIÉS, APLICADO CAMPO A CAMPO

A pergunta em cada coluna: *"outra empresa do mesmo setor usaria isso exatamente como está?"* O que reprovou **não virou coluna** — virou chave em `core.tenant_modules.settings`.

### Entrou no schema (é produto)

| Campo | Por que é universal |
|---|---|
| `source_format` (ofx/csv/camt053/manual) | são padrões **abertos**, não bancos |
| `amount_cents` inteiro com sinal | dinheiro em centavos não tem erro de ponto flutuante |
| `counterparty_tax_id` | nome **neutro de país** — cada um põe o seu |
| `score` + `origin` (auto/manual) | a medida da confiança e a procedência são universais |
| `strategy` (texto livre) | guardar **qual regra** funcionou é o que permite aprender depois |
| registro da decisão na fila | toda empresa que aprova algo precisa de quem, quando, o quê |

### Ficou de fora (é de UMA empresa → `settings`)

| O que não entrou | Onde vive | Por quê |
|---|---|---|
| limiar de score para aceitar automático | `settings.matching.minScore` | uma aceita 0.95, outra exige 0.99, outra nenhuma |
| tolerância de valor e de data | `settings.matching.amountToleranceCents` / `.dateToleranceDays` | mesma razão |
| layout de colunas do CSV de um banco | `settings.import.csvMapping` | cada empresa usa o banco que usa |
| lista de bancos homologados | — | uma tabela `bancos_homologados` seria o sistema de UM cliente |
| alçada por valor, cadeia de aprovadores | `settings.approval.*` | seria o **organograma** de um cliente dentro do produto |
| "quem lança não aprova" | `settings.approval.*` | controle interno varia; a separação de permissões já dá o mecanismo |
| regra tipo "fornecedor X atrasa 3 dias" | `settings.matching.*` | é o caso particular por definição |
| plano de contas, centro de custo, rateio | outros módulos | são capacidades próprias do Domain Financeiro |
| validação de formato de CPF/CNPJ | integração | Lei 3: fiscal se **INTEGRA**, não se constrói |

**A prova em código:** `suggestMatches()` recebe `MatchingSettings` como parâmetro e **não tem valor padrão embutido**. A função aplica a política do tenant; ela não tem uma. Há um teste que passa o mesmo par com duas configurações e verifica que o resultado muda — se alguém amarrar um limiar no código um dia, esse teste quebra.

---

## 7. ESTADO DA OBRA — o que existe e o que não existe

**Esta seção é do módulo, não da etapa que a escreveu.** Quem entregar uma peça atualiza a linha dela aqui; há guarda no CI contra deixá-la envelhecer.

*Conferido em 27/07/2026, depois da Etapa 6.*

| Peça | Estado |
|---|---|
| Manifesto, tipos do domínio, motor de sugestão | ✅ construído, com testes |
| Schema `recon` (`0002_recon.sql`) | ✅ **APLICADO em produção** — ver aviso abaixo |
| UI | ✅ construída — quatro telas em `apps/portal` |
| Parser de OFX e CSV | ✅ construído em `packages/finance-reconciliation/src/parsing/`, com 35 testes. Ler extrato é regra de negócio, não tela |
| Parser de CAMT.053 | **NÃO CONSTRUÍDO** — e o parser **diz isso** em vez de tentar adivinhar |
| Handler que consome `finance.payable.registered` | **NÃO CONSTRUÍDO** — por isso `manifest.events.consumes` segue **vazio** (§5) |
| Rateio automático (N linhas ↔ M títulos) | **NÃO CONSTRUÍDO** — hoje a sugestão é 1:1 |
| IA que aprende padrões e explica divergência | **NÃO CONSTRUÍDO** — Fase 8 |

Sobre o 1:1: a escolha é honesta, não ingênua. O schema **permite** baixa parcial e muitos-para-muitos, e o humano pode montar isso na tela. O que a sugestão automática não faz é adivinhar rateio — combinar N linhas com M títulos multiplica o risco de sugerir bobagem com cara de certeza.

### ⛔ O apply de produção já aconteceu

O dono informou em 27/07/2026 ter aplicado `0002_recon.sql` num projeto Supabase de produção, com um tenant piloto. **Este repositório NÃO VERIFICOU esse apply.** A regra que ele cria vale desde já: **`0002` não se edita mais** — correção é migration nova, a partir de `0004_*.sql`.

### ⚠️ Dívida registrada: onde mora a persistência

A §8.2 previa *"camada de persistência do módulo (repositório sobre o schema `recon`)"*. **Não foi isso que aconteceu.** A Etapa 5 pôs o adaptador de banco em `apps/portal/src/lib/data/supabase.ts`, atrás de uma porta (`port.ts`) que o domínio não conhece.

Não é violação da Regra de Ouro — adaptador é I/O, não regra de negócio, e o motor continua puro. **Mas é dívida:** o dia em que `apps/api` precisar dos mesmos dados, ou o adaptador vira pacote, ou nasce um segundo, e dois adaptadores divergem em silêncio. Fica registrado para ser decisão, não descuido.

---

## 8. O PLANO QUE A ETAPA 2 DEIXOU ESCRITO — *lista, não obra*

> **Registro histórico, não estado.** Quase tudo desta seção foi construído nas Etapas 4 a 6 — as três telas (e uma quarta, o fechamento), o parser, o correio. O que mudou de lugar está anotado. **O estado corrente é o [§7](#7-estado-da-obra--o-que-existe-e-o-que-não-existe), sempre.**

### 8.1 A UI real, em `apps/`

As telas nascem em `apps/portal` (o painel do tenant), consumindo **obrigatoriamente** os tokens de [`IDENTIDADE-VISUAL.md`](IDENTIDADE-VISUAL.md):

- **nenhum HEX solto** em componente — tudo por `var(--bos-*)`;
- fundo `--bos-obsidian`, superfícies `--bos-midnight-ink`, bordas sempre alpha (`--bos-border`);
- **o ouro `--bos-imperial-gold` é do sistema, não do estado.** Divergência usa `--bos-danger`; conferido usa `--bos-success`; pendente usa `--bos-warning`. Estado nunca compete com o ouro;
- numerais **tabulares** — coluna de valor de conciliação alinha dígito com dígito, ou não se lê;
- `--bos-font-mono` para `tenant_id`, referências e identificadores;
- movimento no `--bos-ease`, 600–900ms. Sem bounce.

Três telas:

1. **Importar extrato** — arrastar arquivo, escolher conta, ver o que entrou.
2. **Mesa de conciliação** — linhas à esquerda, títulos à direita, sugestões no meio com o `score` e a `strategy` visíveis. O humano vê **por que** o sistema sugeriu, não só que sugeriu.
3. **Fila de aprovação** — o que substitui a mesa do diretor. Item, valor, idade, botão de visto, campo de observação.

### 8.2 O resto da Etapa 3

- ✅ parser de OFX e CSV, com o mapeamento vindo de `settings` — **feito na Etapa 5**, dentro do pacote;
- ⚠️ camada de persistência do módulo (repositório sobre o schema `recon`) — **feito em outro lugar**: adaptador em `apps/portal`, e a dívida está registrada em §7;
- ✅ o job do Core que entrega `event_outbox` e escreve `audit_log` — **construído na Etapa 6** (`@alsham/workflow`). ⚠️ **A lógica existe e é testada; o job não está ligado** — enquanto não estiver (runbook §6), os eventos continuam na caixa;
- ✅ billing minerado da Casa (`packages/billing`) — **a contabilidade de uso foi feita na Etapa 6**; preço e gateway seguem **NÃO CONSTRUÍDOS** por decisão (Lei 7).

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
