# 🧠 DOSSIÊ — INTELIGÊNCIA DE COMPRAS
## Capacidade candidata · Domain Compras + BI · ALSHAM Business OS™

**Status:** CANDIDATA (registrada no mapa, NÃO em construção) · **Data:** 27/07/2026
**Destino:** `docs/candidatas/` · **Prioridade entre as três máquinas:** 1ª (a mais viável)

> Este documento é MAPA, não promessa (Lei 7). Descreve uma capacidade que o dono quer no Business OS. Nada aqui está construído. A ordem de construção é decisão de dono; a construção só começa depois do Módulo 1 (Conciliação) provar a arquitetura de eventos.

---

## 1. A TESE — o problema que resolve

O comprador do supermercado decide de quem comprar arroz **no faro e no relacionamento**. Ninguém olha, de forma sistemática, se a série histórica de compras foi a melhor escolha possível. O dado existe — anos de notas de compra — mas dorme.

**A pergunta que o produto responde:**
> *"Nos últimos 5 anos você comprou arroz do fornecedor A. Se tivesse comprado do fornecedor B nas mesmas datas, teria gastado X% a menos / lucrado Y% a mais."*

E, daí pra frente:
> *"Para a próxima compra, com base em sazonalidade, preço histórico e prazo, a recomendação é comprar Z de W."*

## 2. POR QUE É A MAIS VIÁVEL DAS TRÊS

O diferencial decisivo: **roda sobre dado INTERNO que o grupo já tem.** Não depende de espionar concorrente (planograma), não depende de motor que ainda não existe (agente-gerente). É análise retrospectiva sobre a própria série de compras do supermercado — o dado está nas notas fiscais de entrada arquivadas.

Isso a torna:
- **Demonstrável na hora** — "você deixou R$ X na mesa nos últimos 5 anos" é uma frase que o dono sente no estômago.
- **Universal** — todo varejo e toda indústria compra insumo recorrente. Não é específico do cliente inaugural; é produto (passa no teste anti-viés).
- **Barata de provar** — um piloto precisa de uma categoria (arroz) e uma série histórica; não de reescrever o ERP.

## 3. O QUE ENTRA (universal) × O QUE É CONFIGURAÇÃO (tenant)

| Universal (vira o módulo) | Configuração do tenant (settings) |
|---|---|
| Ingestão de histórico de compras (formato genérico: item, fornecedor, data, qtd, preço unitário) | Quais fornecedores o tenant considera "comparáveis" |
| Cálculo contrafactual (mesmo volume, fornecedor alternativo, preço da data) | Categorias prioritárias do tenant |
| Detecção de sazonalidade e melhor janela de compra | Regras de negócio do setor (perecível vs estocável) |
| Recomendação de próxima compra por preço/prazo/histórico | Metas de margem do tenant |
| Relatório "dinheiro deixado na mesa" por categoria/período | — |

**Teste anti-viés aplicado:** o motor de comparação é igual pra qualquer empresa que compra insumo recorrente. O que muda de empresa pra empresa (fornecedores, categorias, metas) é dado de tenant, nunca código do módulo.

## 4. DE ONDE MINERAR (Lei do Reaproveitamento)

- **Ingestão + jobs:** o pipeline de jobs com estados do kraken-v2 (PROVADO) serve de padrão pro processamento em lote da série histórica.
- **Inferência/predição:** o schema `ai_predictions` / `ai_inferences` / `ai_recommendations` do 360° PRIMA (modelado, nunca rodado — minerar o desenho, não afirmar que funciona).
- **Consumo por evento:** quando existir o Domain Compras do Business OS, esta capacidade CONSOME os eventos de compra em vez de ter tabela própria de pedido — não reimplementa o balcão.

## 5. RISCO / FRONTEIRA

- **Qualidade do dado histórico:** notas antigas podem estar em papel ou PDF. A ingestão real pode exigir OCR (Domain Documentos) antes da análise. Dimensionar isso é parte do piloto.
- **Contrafactual honesto:** "teria lucrado Y%" precisa considerar que o preço do fornecedor B na data pode não estar disponível. Onde o dado não existe, o relatório diz NÃO VERIFICADO — nunca estima pra impressionar (Lei 7).

## 6. EM UMA FRASE

> **A Inteligência de Compras pega a série histórica que o supermercado já tem e prova, em reais, quanto a intuição do comprador custou — e recomenda a próxima compra com base no que o dado, não o faro, diz.**

---
*Capacidade candidata · Universo Bonaparte · ALSHAM Global Commerce Ltda*
