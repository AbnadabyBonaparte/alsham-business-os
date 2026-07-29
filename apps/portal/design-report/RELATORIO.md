# 🎨 A CATEDRAL ACESA — dossiê visual do portal
## Direção de arte STYLUS X.1 · antes/depois por tela

> **Conceito em uma frase:** o blueprint do império ganha luz — cada módulo é uma
> sala da mesma casa, desenhada a traço fino de ouro sobre a noite institucional,
> sob um único Sol.
>
> Esta pasta é **material de prova do PR** (screenshots do modo demonstração,
> dados fabricados e anônimos). Pode ser removida depois da revisão sem tocar
> em nada do produto.

## O método

- **Paleta selada, geometria livre.** Nenhuma cor nova entrou (IDENTIDADE-VISUAL §1/§6).
  A atmosfera de cada módulo se diferencia por **ornamento-assinatura** (SVG de traço
  fino, estilo blueprint §5.2) e pela **posição da luz** — nunca por matiz.
- **Atmosfera única por tela** (lei nascida em The-Bonaparte-Family): removidos texto
  e logo, ainda se sabe *qual* sala é.
- **CSS/SVG primeiro; imagem só onde paga o peso.** A base de toda tela é
  CSS/SVG inline (zero request). Quatro cenas-vitrine (Painel, Store, Mesa,
  Esteira) ganharam **atmosfera gerada** pelo pipeline da casa (Lei da Imagem:
  só ambiente/atmosfera — zero pessoa, rosto, objeto real, texto ou logo; cada
  peça revista antes de entrar, e uma quinta peça foi **cortada** por escorregar
  da paleta). Entram em `mix-blend-mode: screen` com máscara radial e `onError`
  em cascata — se o arquivo faltar, o CSS assume e o site não quebra. Peso das
  4 peças: **58 KB somadas** (webp, `public/art/`). As fontes variáveis
  auto-hospedadas somam ~237 KB (OFL, `public/fonts/`), realizando a tipografia
  que o canon já pedia (Fraunces).
- **O Sol é um por peça** (§5.1): a marca no header; onde a cena pede outro foco,
  entra a fagulha ou o arco de horizonte — nunca um segundo sol.

## Teste Bonaparte, tela a tela

| Tela | Antes | Depois | O que faz reconhecer a origem |
|---|---|---|---|
| Painel | ![](antes/painel.jpg) | ![](depois/painel.jpg) | Órbitas do Sol Único na atmosfera; hero serifado com itálico dourado ("Tudo aqui é contado no banco."); numerais tabulares |
| Store | ![](antes/store.jpg) | ![](depois/store.jpg) | Grid de placas modulares (o Lego) com uma acesa; hero "A empresa não compra um sistema. *Ela monta o dela.*" |
| Mesa de conciliação | ![](antes/conciliacao.jpg) | ![](depois/conciliacao.jpg) | A balança em traço fino; "O sistema sugere; *o humano visa.*" |
| Importar extrato | ![](antes/importar.jpg) | ![](depois/importar.jpg) | Linhas de razão descendo ao livro |
| Fila de aprovação | ![](antes/aprovacoes.jpg) | ![](depois/aprovacoes.jpg) | A fila com o visto |
| Fechar período | ![](antes/fechamento.jpg) | ![](depois/fechamento.jpg) | O anel que se fecha |
| Campanhas | ![](antes/campanhas.jpg) | ![](depois/campanhas.jpg) | Arcos de transmissão irradiando |
| Contas a pagar | ![](antes/contas-a-pagar.jpg) | ![](depois/contas-a-pagar.jpg) | Degraus que descem (a saída) |
| Contas a receber | ![](antes/contas-a-receber.jpg) | ![](depois/contas-a-receber.jpg) | Degraus que sobem (a entrada) — o espelho consciente, no visual |
| Relacionamentos | ![](antes/relacionamentos.jpg) | ![](depois/relacionamentos.jpg) | Dois círculos entrelaçados (o vínculo) |
| Propostas | ![](antes/propostas.jpg) | ![](depois/propostas.jpg) | O documento com o selo |
| Funil | ![](antes/funil.jpg) | ![](depois/funil.jpg) | As linhas que convergem |
| Compras | ![](antes/compras.jpg) | ![](depois/compras.jpg) | O caixote aberto do recebimento |
| Estoque | ![](antes/estoque.jpg) | ![](depois/estoque.jpg) | Estratos empilhados (o livro do físico) |
| Eventos | ![](antes/eventos.jpg) | ![](depois/eventos.jpg) | O dia marcado no calendário |
| Cobrança | ![](antes/cobranca.jpg) | ![](depois/cobranca.jpg) | A régua com os passos |
| Esteiras (desenho) | ![](antes/esteiras.jpg) | ![](depois/esteiras.jpg) | A linha e as estações — etapas do tenant |
| Esteira (quadro) | ![](antes/esteira.jpg) | ![](depois/esteira.jpg) | Hero "O trabalho anda à vista. *Pelas etapas que a sua empresa desenhou.*" |
| Ajustes | ![](antes/ajustes.jpg) | ![](depois/ajustes.jpg) | O selo de tabelionato modernizado (§5.3) |
| Login | ![](antes/login.jpg) | ![](depois/login.jpg) | O Sol nasce no horizonte da planta; "A porta de entrada" |

## O que NÃO entrou (de propósito)

- Nenhuma foto real, nenhum stock, nenhuma pessoa/rosto/objeto em imagem — as
  quatro atmosferas geradas são luz e arquitetura abstrata, e o resto se faz a traço.
- A atmosfera gerada do login foi **cortada** na revisão (violeta — pele de outro
  mundo); a cena ficou com o arco CSS.
- Nenhuma cor fora dos tokens `--bos-*`; estados continuam sem tocar no ouro.
- Nenhum emoji no produto, nenhum gradiente de SaaS, nenhum bounce (§6).
- Nada de regra de negócio: as telas continuam consumindo os mesmos motores.

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
