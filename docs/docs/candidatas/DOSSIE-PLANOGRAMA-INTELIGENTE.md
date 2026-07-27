# 🧠 DOSSIÊ — PLANOGRAMA INTELIGENTE
## Capacidade candidata · Vertical Varejo/Supermercado · ALSHAM Business OS™

**Status:** CANDIDATA (registrada no mapa, NÃO em construção) · **Data:** 27/07/2026
**Destino:** `docs/candidatas/` · **Prioridade entre as três máquinas:** 3ª (a mais pesada)

> Este documento é MAPA, não promessa (Lei 7). Nada aqui está construído. Construção é decisão de dono, depois do Módulo 1.

---

## 1. A TESE — o problema que resolve

A ordem dos produtos na gôndola define quanto a loja vende. Onde fica o arroz, o que fica na altura dos olhos, o que fica no fim do corredor, o que anda junto — isso é ciência (trade marketing, category management) que os grandes varejistas dominam e o varejo regional decide no olho.

**A pergunta que o produto responde:**
> *"Olhando os hipermercados de maior sucesso e o comportamento de compra da sua loja, esta é a ordem de gôndola que maximiza venda por metro de prateleira."*

## 2. POR QUE É A MAIS PESADA DAS TRÊS — a verdade honesta

Ao contrário da Inteligência de Compras (dado interno pronto), o planograma esbarra em dois problemas reais que não se resolvem com vontade:

1. **"Olhar os hipermercados de sucesso" depende de dado proprietário que ninguém publica.** Planograma de rede grande é segredo comercial. Não cai da web, não se compra fácil. Sem esse dado, a "referência de mercado" vira achismo com cara de ciência — e isso viola a Lei 7.
2. **Precisa de dado de venda por posição física** — qual SKU vende em qual ponto da loja. A maioria dos supermercados regionais não captura isso hoje. Sem ele, o motor não tem o que otimizar.

**Leitura honesta:** é construível e é um produto real e universal (todo varejo sofre com layout), mas é obra de médio/longo prazo que depende de dado que ainda não existe na mão. Não é candidata pra agora.

## 3. O QUE TORNARIA VIÁVEL (o caminho, quando chegar a vez)

- Começar pelo **dado interno de venda**, não pela referência externa: otimizar a gôndola da própria loja a partir do que ELA vende, por SKU e por período — isso já tem valor e não depende de espionar concorrente.
- A camada "hipermercado de sucesso" entra depois, e como **heurística de category management pública** (regras conhecidas de trade marketing: produtos de alta margem na altura dos olhos, itens de destino no fundo, complementares juntos), não como cópia de planograma alheio.
- Integração futura com o PDV (Vertical Varejo) pra fechar o loop: mudou a gôndola → mediu a venda → recalibrou.

## 4. DE ONDE MINERAR

- **Regras de category management:** conhecimento público de trade marketing (não é dado proprietário — é ofício documentado).
- **Análise de venda por SKU:** o Domain BI do Business OS, quando existir.
- **IA de recomendação:** mesmo schema `ai_recommendations` do 360° (modelado, minerar o desenho).

## 5. RISCO / FRONTEIRA

- 🔴 **Dado de referência externo:** o pedido "hipermercados de sucesso" pode não ter fonte legítima. Se não tiver, a capacidade se limita à otimização da própria loja — e isso precisa estar claro pro dono, pra não prometer o que o dado não sustenta.
- 🟠 **Captura de venda por posição:** exige que a loja já registre isso, ou que se construa a captura primeiro.

## 6. EM UMA FRASE

> **O Planograma Inteligente otimiza a ordem da gôndola pela venda real da própria loja e por regras públicas de trade marketing — e só promete o que o dado sustenta, sem fingir que copiou o segredo do concorrente.**

---
*Capacidade candidata · Universo Bonaparte · ALSHAM Global Commerce Ltda*
