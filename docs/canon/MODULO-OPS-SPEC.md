# 🏭 MÓDULO 7 — ESTEIRA DE PRODUÇÃO
## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `ops` ou no pacote
> `@alsham/ops`.
>
> **Leia junto com [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md)** — de onde vem o padrão
> de imutabilidade em três camadas — e com [MODULO-AP-SPEC](MODULO-AP-SPEC.md),
> de cujo ciclo de vida este módulo diverge, de propósito e por escrito.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

### 0.1 `module_id` = `ops`, e **não** `os`

A etapa foi encomendada com os fatos chamados `os.opened`, `os.stage.advanced`,
`os.sent-back`. "OS" de *ordem de serviço* lê bem em português, e não pode ser o
identificador deste módulo. Dois motivos, os dois verificáveis:

1. **`OS` já é uma CAMADA da Taxonomia.** A hierarquia canônica é
   `CORE → ENGINES → DOMAINS → CAPACIDADES → OS (VERTICAIS) → TENANT`, e a
   [§6](TAXONOMIA-EMPRESARIAL-ALSHAM.md) inteira se chama *OS / VERTICAIS* —
   são os 29 pacotes por setor. Um módulo chamado `os` faria a palavra querer
   dizer duas coisas no mesmo repositório. **Sol Único é exatamente a lei contra
   isso.**
2. **`os` é o artigo definido plural do idioma em que este repositório é
   escrito.** A prosa de `docs/canon/` e das migrations usa a palavra solta "os"
   129 vezes (contadas em 28/07/2026); "ops" aparece zero. Um módulo com esse
   nome seria impossível de procurar por nome na documentação da própria casa.

⚠️ **Registro de honestidade.** A primeira versão desta decisão trazia um
terceiro motivo: *"`os.` é impossível de conferir por grep, porque casa dentro
de `dados.` e `tenants.`"*. **Estava errado.** A matriz de guarda deste
repositório usa `\bOUTRO\.`, com fronteira de palavra, e `\bos\.` não casa
dentro de nada — o teste escrito para demonstrar o argumento foi o que o
derrubou. O argumento caiu; a decisão ficou de pé nos dois que se verificam. A
Lei 7 vale para o argumento tanto quanto para o número.

Com `ops`, o [CORE-SPEC §3](CORE-SPEC.md) continua ao pé da letra —
`<moduleId>.<agregado>.<fato>` — e **os sete fatos encomendados existem todos**,
com o prefixo corrigido e o agregado no lugar.

### 0.2 `domain_key` = `operations`, e **não** `marketing`

A etapa se chama "Marketing Ops" e nasceu da esteira de uma agência. É
justamente por isso que o módulo **não** nasce no Domain Marketing.

O teste anti-viés (CLAUDE.md §4) pergunta *"outra empresa do mesmo setor usaria
isso exatamente como está?"*. Aqui a resposta é mais forte que "sim": **outra
empresa de outro setor usa.** Uma construtora abre ordem de serviço. Um
escritório de advocacia move um processo por fases. Uma oficina recebe, orça,
executa e entrega. Nenhum dos três faz marketing, e os três são este módulo sem
uma linha diferente — e é isso, literalmente, que
`supabase/tests/12_ops_isolation.sql` escreve: duas esteiras de ofícios
diferentes, na mesma tabela, no mesmo banco.

A [Taxonomia §5](TAXONOMIA-EMPRESARIAL-ALSHAM.md) põe **"Ordens de serviço"**
como a **primeira** capacidade de **🏭 Operações (10)**. É de lá que este módulo
vem. As capacidades *Briefings* e *Produção*, do Domain Marketing, são o que a
esteira de uma agência **atende** quando o tenant desenha as etapas dela —
configuração de tenant, nunca schema.

⚠️ Há também um motivo mecânico: o **Módulo 2 já é `marketing`**. Dois módulos
disputando o mesmo prefixo fariam `marketing.emit_event()` aceitar o fato do
vizinho, e a revogação em bloco por prefixo (CORE-SPEC §3, passo 4) derrubaria
permissão de dois módulos ao desinstalar um.

---

## 1. ⭐ A LEI DAS ETAPAS

> **As etapas da esteira são DADO DO TENANT. Jamais enum do produto.**

É a lei desta etapa e a razão de o módulo existir.
`abertura → briefing → criação → revisão → aprovação → veiculação` é a esteira
de **uma** agência. Quem não tem briefing pula. Quem tem duas revisões desenha
duas. Quem fabrica peça física chama de `corte → solda → pintura`.

A lei se materializa em quatro lugares, e é verificável nos quatro:

| Onde | Como se verifica |
|---|---|
| `0018_ops.sql` | nenhum `create type ops.stage as enum` foi escrito, e há teste que procura pelos nomes do enunciado dentro do schema |
| `ops.pipeline_stages` | tabela real: `name`, `position`, `requires_approval`, `skippable` — tudo escolhido pelo tenant |
| `@alsham/ops` | nenhum tipo, enum ou constante carrega nome de etapa. A lei vive ali **por ausência** |
| a tela | o quadro é montado a partir das etapas do tenant (`buildBoard()`), e não um quadro fixo com as etapas encaixadas |

### 1.1 As duas colunas que fazem a esteira ser desenho, e não decoração

**`requires_approval`** — passar desta etapa é DECISÃO, e exige
`ops.order.decide`. Das demais, `ops.order.manage` basta.

⭐ **Repare no que isso NÃO é:** o produto não procura a palavra "aprovação" no
nome da etapa. Quem diz o que é decisão é a **coluna**, e por isso uma esteira em
espanhol, ou com a etapa chamada *"ok do cliente"*, funciona igual. Há teste que
desenha uma etapa **chamada** "aprovação" e não marcada, e uma chamada "ok do
cliente" e marcada — e exige o comportamento oposto ao nome nas duas.

**`skippable`** — a etapa pode não se aplicar a esta OS. Uma esteira sem etapas
puláveis obriga o operador a mentir — a marcar "briefing feito" num trabalho que
não tem briefing —, e **trilha que mente é pior que trilha que falta.**

### 1.2 ⭐ Pular é ATO REGISTRADO, nunca apagamento

`ops.skip_stage()` **exige a razão** e escreve uma linha na trilha com
`kind = 'skipped'`, o nome da etapa pulada, o nome da etapa de destino, quem
pulou e quando. A recusa por falta de razão existe em três lugares de propósito:
no formulário, na Server Action e no banco.

Sem essa linha, uma etapa pulada seria indistinguível de uma etapa cumprida — e
é exatamente essa distinção que o dono precisa enxergar.

### 1.3 O corolário caro: a trilha carimba o NOME

A esteira é dado **vivo**: renomeia-se, reordena-se, apaga-se. A trilha é
**história**.

Por isso `from_stage_id` e `to_stage_id` são **soltos, sem chave estrangeira**, e
ao lado deles vai `from_stage_name` / `to_stage_name` — o nome **como ele era no
momento do ato**. É a regra *"a trilha sobrevive ao dado"* do
[CORE-SPEC §4](CORE-SPEC.md), que ali vale para o recurso e aqui vale para a
etapa.

Sem o carimbo, a trilha de 2026 seria lida com o vocabulário de 2028 — ou
desapareceria junto com a etapa apagada. Há cenário de teste que apaga uma etapa
já percorrida e confere que a história continua legível.

---

## 2. ⭐ A DIVERGÊNCIA: `done → in_progress` existe

O `ap` tem `settled` como estado terminal: um título quitado que volta a ser
devido é **documento novo**, porque dinheiro tem identidade por documento.

**Aqui a OS concluída volta a andar.** Devolver uma OS entregue a reabre.

> **Dinheiro tem identidade por documento; trabalho tem identidade por serviço.**

O cliente recebeu a peça e pediu mudança: é o **mesmo** trabalho. Obrigar uma
segunda OS partiria em duas a história de um serviço só — que é exatamente o que
este módulo existe para manter inteira. É a mesma lição que o Módulo 4 escreveu
sobre `archived → active`, chegando por outro caminho.

### 2.1 O que NÃO diverge, e copiar foi decisão

| Decisão do `ap` | Resposta no `ops` | Por quê |
|---|---|---|
| cancelar é status, nunca `delete` | ✅ **mantido** | OS apagada não deixa aprender nada com ela |
| `cancelled` é terminal | ✅ **mantido** | cancelar é dizer *"este trabalho não será feito"*; retomar é decidir fazer um trabalho — e aí é OS nova |
| permissão própria para decidir | ✅ **mantido**, ampliada | quem toca o trabalho não é necessariamente quem decide sobre ele |
| policy de UPDATE não distingue edição de decisão | ✅ **mantido** | quem separa é o trigger, que enxerga o `old` |
| ação destrutiva com confirmação em dois passos na tela | ✅ **mantido** | padrão CRIVO |

⛔ **E `done → cancelled` não existe.** Cancelar uma OS entregue apagaria a
fronteira entre *"não fizemos"* e *"fizemos e entregamos"*. Se o trabalho tem de
ser desfeito, devolve-se primeiro — e aí o cancelamento é sobre o trabalho que
voltou.

---

## 3. O QUE ESTE MÓDULO GUARDA

### 3.1 `ops.pipelines` + `ops.pipeline_stages` — a esteira

Um tenant pode ter mais de uma: a esteira do marketing não é a esteira da
manutenção. **Nenhuma esteira é semeada** — semear uma seria escolher o processo
do cliente por ele.

⚠️ `ops.pipeline_stages` é a **única** tabela do módulo com porta de DELETE, e é
deliberado: desenhar uma esteira é tentativa e erro. O contrapeso está na chave
estrangeira de `ops.orders`, que é `restrict`: **a etapa onde há OS parada não se
apaga.**

### 3.2 `ops.orders` — a ordem de serviço

Nasce numa esteira do tenant, na primeira etapa dela. Anda para a frente, ou
volta por uma devolução explícita.

⭐ **O campo se chamou `briefing` até a guarda anti-viés do próprio módulo
reprovar o nome.** "Briefing" é vocabulário de agência: uma construtora tem
descrição de serviço, uma oficina tem o relato do cliente, um escritório tem o
objeto do processo. É o **mesmo** campo, e batizá-lo com a palavra de um ofício
faria a tela de todos os outros falar a língua de um só. Hoje é `description`. A
etapa *"briefing"* continua existindo — como **nome de etapa**, escolhido pelo
tenant, que é exatamente onde vocabulário de ofício deve morar.

O responsável é opcional e amarrado a `core.memberships` por chave composta:
responsável é quem é **do tenant**. Isolamento se escreve na chave, não na
policy.

**Não entram:** número sequencial de OS (formato de numeração é convenção de
cada casa), prioridade, custo, horas, cliente. "Para quem é" já tem dono: o
Módulo 4.

### 3.3 `ops.order_events` — a trilha, imutável

Padrão de três camadas do Módulo 4 (sem policy de UPDATE/DELETE, sem GRANT,
trigger que recusa até para o dono do banco), **mais uma quarta garantia que as
outras tabelas do repositório não têm: nem INSERT ela aceita direto.**

Quem escreve na trilha são as funções de movimento, que são `security definer` e
conferem a permissão do ato **antes**. Trilha que a aplicação escreve direto é
trilha que a aplicação pode escrever errado — ou inventar.

### 3.4 `ops.deliverables` — o entregável, versionado

**Minerado do kraken-v2** (`content_piece_versions`, migrations 0019 e 0021
daquele repositório — PROVADO, com assinante pagante). Minerou-se a **ideia**, e
a peça central dela é a coluna que quase todo mundo esquece:

⭐ **`instruction` — o pedido que gerou ESTA versão.** No kraken ela nasceu para
poder contestar cobrança; aqui existe porque uma pilha de versões sem o motivo de
cada uma é um monte de arquivos, não um histórico. *"v3"* não diz nada; *"v3 —
cliente pediu tirar o telefone do rodapé"* diz tudo.

⛔ **NÃO HÁ UPLOAD DE ARQUIVO, e a ausência é decisão declarada.** `reference` é
texto: um link, um caminho de rede, um número de processo. *Storage & Arquivos*
é capacidade do **Core** ([Taxonomia §3](TAXONOMIA-EMPRESARIAL-ALSHAM.md)), não
deste módulo, e está **NÃO CONSTRUÍDA**. Fazer upload aqui seria construir meio
Storage dentro de um módulo — e o meio que fica de fora é sempre o da segurança.

⚠️ **NÃO VERIFICADO:** este repositório não leu o banco do kraken-v2. A
mineração partiu dos arquivos de migration do repo local e do dossiê, que são
documento — não o banco em produção.

---

## 4. OS SETE FATOS

Todos saem por `ops.emit_event()`, a única porta para fora.

| Fato | Quando |
|---|---|
| `ops.order.opened` | a OS nasceu, com a etapa em que começou |
| `ops.stage.advanced` | passou para a próxima etapa |
| `ops.stage.skipped` | uma etapa foi **pulada**, com quem, quando e por quê |
| `ops.order.sent-back` | devolvida para refazer, com a instrução |
| `ops.order.completed` | saiu da esteira concluída |
| `ops.order.cancelled` | cancelada — a ação destrutiva do módulo |
| `ops.deliverable.registered` | versão nova de entregável, com a instrução que a gerou |

⭐ **O payload é AUTOSSUFICIENTE, e aqui isso exige uma coisa a mais que nos
módulos anteriores:** ele carrega o **NOME** da esteira e o **NOME** da etapa,
não só os ids. Quem escuta não pode ler `ops.pipeline_stages` — por policy e por
lei —, então um `stageId` sozinho seria um campo que só serve para depurar.

⚠️ **A reabertura não tem fato próprio.** `done → in_progress` só acontece por
devolução, e a devolução já tem o seu. Dois fatos para um ato fariam todo
consumidor contar a mesma coisa duas vezes — e o tenant paga por evento
entregue.

### 4.1 `consumes` é vazio, e é Lei 7

A integração óbvia existe e é boa: `crm.party.registered` traria o cliente para
dentro da OS, e `ap.payable.registered` amarraria o custo de um serviço à ordem
que o gerou. As duas dariam **hoje**, tecnicamente — os envelopes dos dois
módulos já são autossuficientes.

**Não entram, porque o handler não existe.** Consumo declarado sem consumidor faz
o Core acordar um módulo que não sabe responder, e a Store passaria a anunciar
uma integração que não acontece.

E há uma decisão de produto por baixo, que é do dono: amarrar OS a contraparte
presume que toda ordem de serviço é para alguém de fora — e a maior parte das
ordens de manutenção de uma empresa é para ela mesma. Quando for construído, o
"para quem" nasce **opcional**, e a regra de quando criar é `settings` do
tenant, nunca constante no módulo.

---

## 5. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 28/07/2026, na Etapa 13.*

| Peça | Estado |
|---|---|
| Manifesto, tipos, ciclo de vida, quadro, versionamento e validação | ✅ construído, com testes |
| Schema `ops` (`0018_ops.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §11) |
| As três funções de movimento (avançar, pular, devolver) | ✅ construídas, atômicas, com a permissão dependendo do desenho |
| Telas: desenhar esteira, abrir OS, quadro, interior da OS | ✅ construídas |
| Trilha imutável em três camadas + sem porta de INSERT | ✅ construída, provada em banco real |
| Entregável versionado com a instrução | ✅ construído |
| Consumo de eventos de outros módulos | **NÃO CONSTRUÍDO** — ver §4.1 |
| Upload de arquivo | **NÃO CONSTRUÍDO**, e é decisão: *Storage & Arquivos* é capacidade do Core, ainda não construída. Ver §3.4 |
| Reordenar/renomear etapa **pela tela** | ⚠️ **schema pronto, sem tela.** A `position` é `deferrable` justamente para permitir a troca; o formulário de edição de esteira existente é etapa própria |
| Responsável escolhido **pela tela** | ⚠️ **schema pronto, sem tela.** A coluna e a chave composta existem e são provadas; o seletor de membro exige listar membros do tenant, que é leitura de Core que nenhuma porta faz hoje |
| Checklist por etapa | **NÃO CONSTRUÍDO**, e foi considerado — ver §6 |
| Prazo por etapa (SLA) | **NÃO CONSTRUÍDO** — prazo é da OS, não da etapa |
| Agente de IA embarcado | **NÃO CONSTRUÍDO** nesta etapa. É a Etapa 14 |

---

## 6. O QUE FICOU DE FORA, E POR QUÊ

**Checklist por etapa** é a capacidade que mais tenta entrar, porque uma etapa
com lista de conferência parece de graça. Não entrou porque modelá-la obrigaria
a decidir se o checklist é **do desenho** (igual para toda OS que passar ali) ou
**da OS** (diferente em cada uma) — e essa é decisão de produto que ninguém
tomou. Enquanto isso, o `note` de cada movimento e a `description` da OS atendem
o caso sem prometer a capacidade. *Checklist* é capacidade da Taxonomia e está
declarada **NÃO CONSTRUÍDA** no manifesto.

**Anexar arquivo** — ver §3.4.

**Automação entre etapas** (ao entrar em X, faça Y) é o Workflow Engine, que é
Core e é ENGINE, não deste módulo.

---

## 7. O QUE A PRÓXIMA ETAPA HERDA

- **O módulo está pronto e provado, mas em ARQUIVO:** `0011` não foi aplicado.
- ⚠️ **O schema `ops` precisará ser EXPOSTO na Data API do Supabase pelo dono** —
  quinta vez que este aviso aparece. Runbook §11.0.
- **O entregável é o encaixe da Etapa 14.** O resultado de uma geração de IA
  entra como versão de entregável, marcada como rascunho de máquina, e o humano
  decide. A coluna `instruction` já existe para guardar o pedido que gerou a
  versão — é o mesmo campo, com o mesmo significado.
- **`ops.deliverables` ganhará uma coluna `origin` por ALTER**, na migration da
  Etapa 14. Não se antecipou aqui: uma coluna para uma funcionalidade não
  construída é promessa em schema.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
