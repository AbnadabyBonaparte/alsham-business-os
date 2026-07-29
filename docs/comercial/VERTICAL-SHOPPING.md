# ALSHAM BUSINESS OS™ — O SHOPPING COMO TENANT

**Documento comercial · ALSHAM Global Commerce Ltda**
*O que já existe, o que se configura e o que se contrata.*

---

## COMO LER ESTE DOCUMENTO

Ele tem três partes, e a ordem não é acidental.

A **Parte I** lista o que **já está construído e provado**. Nada aqui é
promessa: cada linha diz qual peça a sustenta — o módulo, a tela, o arquivo de
banco. Se algo não está construído, este documento diz isso com todas as
letras, e diz o que falta.

A **Parte II** lê o negócio de um shopping center **sem escrever uma linha de
código para ele**. É a parte mais importante do documento, e a mais contra-
intuitiva: quase tudo o que um shopping precisa **já existe no produto de
hoje**, na forma de **configuração** — a esteira que a operação desenha, os
campos que a empresa nomeia, as etiquetas que ela escolhe. Um sistema que
precisa de uma tabela nova para cada ofício é um sistema que envelhece com o
primeiro cliente.

A **Parte III** é o **roteiro contratável**: o que ainda **não existe** e o que
seria construir o Vertical Shopping por inteiro, em fases, com o critério de
pronto de cada uma.

> ⚠️ **Não há preço neste documento, e não há prazo.** Preço é decisão do dono,
> com números medidos. Prazo é compromisso, e compromisso sem escopo fechado é
> chute com cara de contrato. As duas coisas se conversam depois de escolhida a
> fase — não antes.

---

# PARTE I — O QUE JÁ EXISTE

## 1. A tese

**A empresa não compra um sistema. Ela monta o dela.**

Existe um **Core** — a fundação: empresas, usuários, papéis, permissões,
trilha de auditoria, catálogo de módulos, medição de uso. E existe uma
**Store**, onde a empresa instala os módulos que quer, como quem instala
aplicativos.

Instalar um módulo concede as permissões dele. Desinstalar corta o acesso
**sem apagar o que ele gravou** — o histórico é da empresa, não do módulo.

A consequência comercial é direta: **o que se constrói para um cliente vira
patrimônio de todos os próximos.** Não existe "versão do cliente X". Existe o
produto, e a configuração de cada tenant.

## 2. Os módulos construídos

Sete módulos publicados no catálogo. Cada um com schema próprio, permissões
próprias e telas próprias.

| # | Módulo | O que faz hoje |
|---|---|---|
| 1 | **Conciliação & Aprovações** | Importa o extrato bancário (OFX e CSV), sugere as baixas contra os títulos em aberto, e põe cada divergência numa fila de aprovação com visto e trilha. Fecha o período. |
| 2 | **Campanhas** | A carteira de campanhas de marketing, com verba aprovada. |
| 3 | **Contas a Pagar** | Títulos a pagar: registrar, cancelar, liquidar. |
| 4 | **Relacionamentos (CRM base)** | Contrapartes — quem paga, quem recebe, quem se atende — e o histórico de contato. |
| 5 | **Contas a Receber** | Títulos a receber: registrar, cancelar, receber. |
| 6 | **Compras (Pedidos)** | Pedidos de compra e o recebimento do que chegou. |
| 7 | **Esteira de Produção** | ⭐ A empresa **desenha a própria esteira de trabalho** e move cada ordem de serviço por ela. |

E, no Core, duas capacidades que não são módulos e por isso não se instalam —
elas simplesmente existem para quem tiver a plataforma:

| Capacidade do Core | O que faz hoje |
|---|---|
| **A Forja (IA Base)** | O operador pede uma geração — texto ou arte — dentro de uma etapa da esteira. O resultado entra como **versão de entregável marcada como rascunho de máquina**, e **quem decide é a pessoa**. |
| **O Painel Executivo** | A home de quem entra: módulos instalados, saúde da entrega de eventos, consumo do plano e as últimas linhas da trilha da empresa. |

## 3. O que faz este produto ser diferente

### 3.1 ⭐ A esteira é da empresa, nunca do fabricante

Não existe, em lugar nenhum do produto, uma lista fixa de etapas de trabalho.
Nem no banco, nem no código. **As etapas são dado da empresa** — ela cria,
nomeia, ordena, marca quais exigem aprovação e quais podem ser puladas.

Isso não é uma promessa de marketing: é uma decisão de arquitetura, e existe um
teste automatizado que a prova. Ele escreve, **na mesma tabela e sem uma linha
de código diferente**, a esteira de uma agência de publicidade
(`abertura → briefing → criação → revisão → aprovação → veiculação`) e a de uma
empresa de manutenção predial (`chamado → vistoria → execução`).

Se as etapas fossem do fabricante, o shopping receberia as etapas de outro
ofício e teria que fingir que servem.

### 3.2 A permissão vem do desenho, não da palavra

Uma etapa marcada como "exige aprovação" só é ultrapassada por quem tem a
permissão de decidir. **O produto não procura a palavra "aprovação"** no nome da
etapa — ele lê a marcação. Uma esteira escrita em espanhol, ou com a etapa
chamada "visto do síndico", funciona igual.

### 3.3 Pular é ato registrado

Uma etapa pulada **exige razão escrita**, e vira uma linha imutável da trilha:
quem, quando, de onde para onde e por quê. Uma etapa pulada em silêncio é
indistinguível de uma cumprida — e a diferença entre as duas é exatamente o que
uma auditoria procura.

### 3.4 O que aconteceu não se edita

A trilha de eventos de uma ordem de serviço e o histórico de contato de uma
contraparte são **imutáveis em três camadas**: não há permissão de alteração,
não há concessão de alteração no banco, e há um gatilho que recusa a alteração
**até para o administrador do banco**.

Corrigir é registrar outra linha. Nunca apagar a anterior.

### 3.5 Nenhum número é decorativo

Toda informação numérica que aparece na tela vem de uma contagem no banco ou de
uma linha de configuração de plano. Não há valor de exemplo, nem estimativa
arredondada, nem gráfico ilustrativo.

Quando uma leitura falha, a tela **diz que falhou** — ela não mostra "tudo
certo". Um indicador falso é pior do que indicador nenhum, porque faz quem opera
parar de olhar.

### 3.6 Cada empresa só enxerga a si mesma

O isolamento entre empresas é feito **no banco de dados**, com política de
acesso por linha, e é verificado a cada mudança do código por doze baterias de
teste que rodam contra um Postgres de verdade, com usuário de verdade.

Não é confiança na tela. Uma tela com defeito não vaza dado do vizinho, porque
o banco não devolve a linha.

### 3.7 O que uma empresa faz, outra pode escutar

Quando algo acontece — um título registrado, uma baixa aprovada, uma ordem de
serviço concluída — o fato é gravado numa **caixa de saída** e entregue aos
módulos que se interessam por ele. O módulo que escuta **não conhece** o que
emite: eles conversam pelo tipo do fato, nunca por código compartilhado.

Na prática: registrar um título no Contas a Pagar faz ele aparecer sozinho na
mesa de conciliação. Confirmar a baixa na conciliação faz o título se liquidar
sozinho. **Nenhum dos dois módulos sabe que o outro existe.**

## 4. ⚠️ E o que ainda NÃO existe

Honestidade de escopo. Esta seção existe para que ninguém compre o que não foi
construído.

| Não existe | Observação |
|---|---|
| **Upload de arquivo** | Um entregável guarda uma **referência em texto** (um link, um código). Guardar o arquivo em si é capacidade do Core ainda não construída. |
| **Emissão fiscal** (NF-e, NFS-e, SPED) | E é decisão, não atraso: fiscal se **integra**, não se constrói. |
| **Folha de pagamento / eSocial** | Mesma decisão. |
| **PDV / frente de caixa** | Mesma decisão. |
| **Cobrança e pagamento de verdade** (boleto, PIX, remessa bancária) | A plataforma **conta** o que aconteceu; ela não move dinheiro. |
| **Preço, fatura e gateway** | A plataforma mede consumo. Preço é decisão comercial, fora do produto. |
| **Aplicativo móvel** | O painel é responsivo; não há aplicativo instalável. |
| **Publicação real em rede social ou e-mail** | Uma campanha muda de estado e registra o fato; ela não publica. |
| **Reordenar e renomear etapa pela tela** | O banco já aceita; falta o formulário. |
| **Alarme automático de fila parada** | A saúde da entrega é consulta, não notificação. |
| **Assinatura eletrônica de documento** | Não construída. |

---

# PARTE II — O SHOPPING, SEM UMA LINHA DE CÓDIGO NOVA

> ⭐ **A pergunta que governa esta parte inteira:**
> *"Outra empresa do mesmo setor usaria isso exatamente como está?"*
>
> Se **sim**, é produto — e vira peça reutilizável.
> Se **não**, **não entra no produto**: vira **configuração do tenant**.
>
> É essa pergunta que impede o sistema de virar o retrato de um cliente só. E é
> ela que faz o próximo shopping ser uma configuração, não um projeto.

O que segue é a operação de um shopping center **descrita na configuração que o
produto de hoje aceita**. Nenhum item abaixo pede tabela nova, campo novo ou
tela nova.

## 5. Os lojistas são contrapartes

O módulo de **Relacionamentos** guarda contrapartes: quem paga, quem recebe,
quem se atende. Um lojista é uma contraparte. Um fornecedor de facilities é uma
contraparte. Um patrocinador de evento do mall é uma contraparte.

O **canal** de cada interação é **texto livre**, de propósito. Congelar os
canais de hoje numa lista fechada faria o produto envelhecer junto com eles — e
a interação com um lojista acontece por onde ela acontecer.

**Configuração do shopping:** um vocabulário de etiquetas próprio. Por exemplo —
e é exemplo, não regra do produto:

```
âncora · satélite · quiosque · alimentação · serviços · lazer
piso-L1 · piso-L2 · piso-L3 · corredor-norte · praça-de-alimentação
```

O produto não conhece nenhuma dessas palavras. **É por isso que elas funcionam.**

## 6. O aluguel é um título a receber

O módulo de **Contas a Receber** registra títulos com vencimento, valor,
contraparte e referência. Um aluguel mínimo é um título. O fundo de promoção é
um título. O condomínio é um título. A cota de mídia do mall é um título.

**O que já funciona sozinho:** importado o extrato, a conciliação sugere o
casamento entre o crédito que entrou e o título em aberto; confirmado o
casamento, **o título se liquida sozinho** e a trilha registra tudo.

**⚠️ E o que não funciona sozinho, dito com clareza:** o **aluguel
percentual** — a parcela do aluguel que depende do faturamento declarado pela
loja — **não é calculado pelo produto de hoje**. Ele exige que a plataforma
receba o faturamento declarado e aplique a regra do contrato. Isso é **Fase 2**
da Parte III, e está listado lá com o que falta.

Hoje, o percentual entra como **título registrado com o valor já apurado por
quem apura** — o que é uma operação real e honesta, e é o que a maioria dos
mall funcionais faz em planilha. O produto não finge calcular o que não calcula.

## 7. A cobrança do lojista é uma esteira

⭐ **Aqui está o coração desta parte.**

Uma inadimplência de lojista não é uma linha numa tabela: é um **processo**, com
etapas, responsáveis e decisões. E o produto de hoje deixa o shopping desenhar
esse processo exatamente como ele é na casa dele.

Um desenho possível — **exemplo, não modelo do produto**:

```
vencido → aviso amigável → notificação formal → reunião de acordo
        → acordo firmado → jurídico
```

Com as marcações que o shopping escolher:

- `reunião de acordo` — **exige aprovação** (só o gerente comercial passa daqui)
- `notificação formal` — **não pode ser pulada**
- `aviso amigável` — **pode ser pulada**, com razão escrita

E cada ordem de serviço dessa esteira carrega o lojista, o responsável e o
prazo. Cada movimento vira linha imutável da trilha. **Pular o aviso amigável
para ir direto ao jurídico é um ato com nome, data e motivo.**

Nenhuma dessas seis palavras existe no código. O shopping as escreve.

## 8. A obra do lojista é outra esteira

Reforma de loja, montagem de quiosque, adequação de fachada — mesma mecânica,
outro desenho:

```
solicitação → análise do projeto → aprovação técnica
            → execução → vistoria final → liberação
```

Com `aprovação técnica` marcada como etapa de decisão, e o laudo da vistoria
entrando como **entregável versionado**: a versão 1 é a vistoria que reprovou, a
versão 2 é a que aprovou, e **a versão 1 continua lá**. Refazer nunca apaga.

## 9. O evento do mall é uma terceira esteira

```
proposta → orçamento → contrato → produção → montagem → realização → prestação de contas
```

Os fornecedores do evento são contrapartes. O patrocínio é um título a receber.
A compra de material é um pedido no módulo de Compras. A verba é uma campanha.

**Quatro módulos diferentes servindo um processo, e nenhum deles sabe que
existe um shopping.**

## 10. O chamado de manutenção é uma quarta

```
chamado → triagem → execução → conferência
```

Ar-condicionado de corredor, luminária queimada, vazamento em praça de
alimentação. Nada disso é "facilities" para o produto: é uma ordem de serviço
numa esteira que a empresa desenhou, com responsável e prazo.

## 11. A Forja dentro da operação

Dentro de qualquer etapa dessas esteiras, o operador pede uma geração ao **motor
ALSHAM** — o texto da notificação ao lojista, a legenda do post do evento, a
arte da campanha de datas comemorativas.

Três coisas importam aqui, e as três são decisão de produto:

1. **O resultado entra como versão de entregável marcada como rascunho de
   máquina.** Ele nunca vai sozinho para o mundo. **Quem decide é a pessoa.**
2. **O tom da marca é da empresa.** Quem somos, como falamos e **o que nunca
   dizemos** ficam guardados nas configurações do tenant e entram em toda
   geração. Não é uma constante do produto.
3. **Sem medição, sem geração.** Se o plano da empresa não tem teto declarado
   para geração, **o botão não aparece** — e a tela explica por quê. O produto
   não gera o que não sabe contar.

## 12. O que isto significa comercialmente

Os cinco processos das seções 7 a 11 são a espinha da operação de um shopping.
**Nenhum deles precisou de uma linha de código.**

Um segundo shopping desenha as esteiras dele — que serão parecidas, e não serão
iguais, porque nenhum shopping opera como o outro. Uma administradora com cinco
empreendimentos tem cinco tenants, ou um tenant com cinco esteiras. **Nos dois
casos, o mesmo produto.**

É isto que faz a diferença entre vender software e vender projeto: o projeto
começa do zero no cliente seguinte; **o produto começa do fim.**

---

# PARTE III — O VERTICAL SHOPPING, COMO ROTEIRO CONTRATÁVEL

## 13. O que a Parte II não resolve

A Parte II mostra que a operação **cabe** no produto de hoje. Ela não afirma que
o produto de hoje é um sistema de shopping — e a diferença é honesta:

O que a configuração resolve é o **processo**. O que ela **não** resolve é o
**cálculo próprio do ofício**: o aluguel percentual sobre faturamento declarado,
o rateio de despesa de condomínio por área e por índice, o reajuste indexado, o
controle de vagas de estacionamento, o índice de ocupação do mall.

Essas coisas são **conta**, não fluxo. E conta se constrói.

A taxonomia canônica da ALSHAM lista o Vertical Shopping Centers com **nove
capacidades**:

> Lojistas · Contratos de locação · Aluguéis · Fundo de promoção ·
> Marketing do mall · Eventos do mall · Segurança · Facilities · Estacionamento

Abaixo, as nove em fases. Cada fase é **contratável isoladamente** e entrega
valor sozinha — a Fase 2 funciona sem a Fase 3, e assim por diante.

---

## FASE 0 — A FUNDAÇÃO ✅ **JÁ EXISTE**

Sem custo de construção. É o que a Parte I descreve.

| Capacidade | Estado |
|---|---|
| Lojistas (cadastro e histórico) | ✅ **Relacionamentos**, com etiquetas do tenant |
| Aluguéis (cobrança e baixa) | ✅ **Contas a Receber** + **Conciliação** — baixa automática pelo extrato |
| Marketing do mall (verba) | ✅ **Campanhas** |
| Eventos do mall (processo) | ✅ **Esteira de Produção** |
| Facilities (chamados) | ✅ **Esteira de Produção** |
| Compras de material e serviço | ✅ **Compras (Pedidos)** |
| Despesas do mall | ✅ **Contas a Pagar** |
| Geração de texto e arte na operação | ✅ **A Forja** |
| Visão de dono | ✅ **Painel Executivo** |

**Critério de pronto:** já está. É o que se demonstra numa mesa.

---

## FASE 1 — CONTRATOS DE LOCAÇÃO

O contrato como objeto de primeira classe: partes, vigência, área locada,
aluguel mínimo, índice de reajuste, cláusulas de carência e a data de cada
aniversário.

**O que entra:**
- Cadastro de contrato ligado à contraparte lojista e ao espaço locado.
- Vigência com aviso de vencimento e de renovação.
- Reajuste por índice — a data e a regra; **o índice em si vem de fora**.
- Geração automática dos títulos a receber do período, a partir do contrato.

**O que sai de graça junto:** os títulos gerados caem no Contas a Receber que já
existe, e a baixa pelo extrato já funciona. **Nenhum código novo de cobrança.**

**Critério de pronto:** um contrato cadastrado gera os títulos do ano, e cada
um se liquida sozinho quando o crédito correspondente entra no extrato.

**⚠️ Não incluído:** assinatura eletrônica do contrato e cobrança de índice
econômico automatizada. As duas se **integram**.

---

## FASE 2 — ALUGUEL PERCENTUAL E FUNDO DE PROMOÇÃO

O cálculo que hoje mora em planilha.

**O que entra:**
- Declaração de faturamento por lojista e por período.
- Apuração do aluguel percentual contra o mínimo — a regra clássica de "o maior
  entre os dois", com a variação que o contrato disser.
- Fundo de promoção como rateio, com o critério do empreendimento.
- Trilha da apuração: quem declarou, quando, e o que foi apurado. **A declaração
  é imutável — corrigir é declarar de novo.**

**Critério de pronto:** fechado o mês, os títulos complementares nascem
apurados, com a memória de cálculo legível linha a linha.

**⚠️ A decisão de canon que esta fase carrega:** a fórmula do percentual é
**configuração do contrato**, jamais constante do produto. Dois shoppings com
fórmulas diferentes usam o mesmo código.

---

## FASE 3 — RATEIO DE CONDOMÍNIO E DESPESA DO MALL

**O que entra:**
- Rateio de despesa por critério configurável — área, fração ideal, índice
  próprio do empreendimento.
- Prestação de contas do condomínio ao lojista.
- Ligação com o Contas a Pagar que já existe: a despesa entra uma vez, e o
  rateio a distribui.

**Critério de pronto:** uma despesa lançada aparece rateada, com o critério
visível, e vira título a receber por lojista.

---

## FASE 4 — O ESPAÇO COMO OBJETO

Hoje a loja é uma etiqueta na contraparte. Nesta fase, o espaço vira objeto:

**O que entra:**
- Mapa de lojas: unidade, piso, área, situação (ocupada, vaga, em obra).
- Índice de ocupação e vacância — **contado, nunca estimado**.
- Histórico de ocupação da unidade ao longo do tempo.
- Quiosques e mídia como espaços locáveis, com a mesma mecânica.

**Critério de pronto:** o Painel mostra a ocupação real do empreendimento, com
o número saindo de uma contagem.

---

## FASE 5 — ESTACIONAMENTO

**O que entra:**
- Tabela de tarifas configurável pelo empreendimento.
- Convênios e isenções por lojista.
- Fechamento e repasse ao operador do estacionamento.

**⚠️ E o que NÃO entra, por decisão:** cancela, leitor de placa e controle de
acesso físico. Equipamento de campo se **integra**; não se constrói. A
plataforma recebe o movimento e faz a conta.

**Critério de pronto:** o movimento do dia entra e o repasse do mês sai apurado.

---

## FASE 6 — SEGURANÇA E OCORRÊNCIAS

**O que entra:**
- Registro de ocorrência com local, horário, envolvidos e providência.
- Escala e ronda como esteira — **e aqui a Fase 6 é quase inteiramente
  configuração**, o que a torna a fase mais barata da lista.
- Relatório de ocorrências por período e por área.

**Critério de pronto:** uma ocorrência registrada é imutável, aparece no
relatório e dispara a esteira de providência que o shopping desenhou.

---

## 14. A ordem é do cliente; o conteúdo, nunca

⭐ **Uma lei da casa, e vale a pena estar escrita num documento comercial:**

> O cliente inaugural decide a **ORDEM** da fila de módulos. Ele **não** decide
> o conteúdo deles.

Se um empreendimento precisa do estacionamento antes do contrato de locação, a
fila muda. O que não muda é **o que cada fase constrói**: cada uma nasce como
peça de produto, útil ao próximo shopping sem uma linha diferente.

O corolário, dito sem rodeio: **cada linha de código escrita para um cliente
tem de aumentar o valor da plataforma para todos os clientes futuros.** O que
não passa nesse teste não vira código — vira configuração, ou vira serviço
cobrado à parte.

## 15. O que este documento não faz

- **Não dá preço.** Preço sai com escopo fechado e números medidos.
- **Não dá prazo.** Prazo sai com fase escolhida.
- **Não promete o que não está construído.** Tudo o que não existe está listado
  na seção 4 e nas fases da Parte III, nominalmente.
- **Não descreve nenhum cliente.** Este é um documento sobre um produto.

---

## 16. O resumo em cinco linhas

1. **Existe hoje**, construído e provado: Core, Store, sete módulos, a Forja e
   o Painel Executivo.
2. **A operação de um shopping cabe no produto de hoje** como configuração —
   contrapartes, títulos e esteiras que a empresa desenha.
3. **O que falta é conta, não fluxo**: contrato, percentual, rateio, espaço,
   estacionamento.
4. **Cada fase é contratável sozinha** e entrega valor sozinha.
5. **O que se constrói vira patrimônio da plataforma**, não do cliente.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
