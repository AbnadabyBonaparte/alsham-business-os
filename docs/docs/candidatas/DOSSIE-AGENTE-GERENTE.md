# 🧠 DOSSIÊ — AGENTE-GERENTE (Gestão de Pessoas por IA)
## Capacidade candidata · Domain IA + RH + Comercial · ALSHAM Business OS™

**Status:** CANDIDATA (registrada no mapa, NÃO em construção) · **Data:** 27/07/2026
**Destino:** `docs/candidatas/` · **Prioridade entre as três máquinas:** 2ª

> Este documento é MAPA, não promessa (Lei 7). Nada aqui está construído. Construção é decisão de dono, depois do Módulo 1.

---

## 1. A TESE — o problema que resolve

O gestor calibra a equipe no achismo. "João vende 4× mais que Pedro" — mas por quê? Sem medir atividade real (quantos orçamentos, contatos, follow-ups por pessoa por dia), o gestor treina no escuro e o time não melhora.

**O que o agente-gerente faz:**
1. **Mede atividade real** por pessoa (orçamentos, contatos, conversas, follow-ups).
2. **Cobra o follow-up** — mandou orçamento e esqueceu? O agente lembra de perguntar se dá pra fechar.
3. **Calibra pelo topo** — mostra o que o melhor vendedor faz de diferente e transforma em meta pros outros.
4. **Direciona como um gerente** — recomenda a próxima ação certa pra cada pessoa, todo dia.

## 2. A ORIGEM — e a verdade sobre o ALSHAM 360° PRIMA (Lei 7)

Esta capacidade **já foi modelada** no ALSHAM 360° PRIMA — as tabelas existem com nome próprio: `next_best_action`, `coaching_sessions`, `coaching_feedback`, `performance_metrics`, `gamification_points`, `ai_predictions`, `lead_interactions`. A metade difícil da tese (medir vendedor, prever, cobrar follow-up, treinar time, consentir sob LGPD) está desenhada em ~129 tabelas.

**A moldura correta, que corrige leituras anteriores:**
O 360° PRIMA **não é um produto que fracassou.** Ele **nunca foi apresentado a ninguém** — nenhum produto da ALSHAM chegou ao mercado até agora; a liberação pra testes começa neste momento. Os sinais que pareciam de abandono têm explicação:
- **"Leads congelados desde nov/2025"** → não é produto morto; é que o sistema nunca foi vendido nem operado por um cliente real. Os 116 leads (55 de teste) são resíduo da fase de construção, não de uso comercial.
- **Construção manual sem MCP** → na época, o sistema era grande demais pra manter à mão — o trabalho era cópia-e-cola de guia em guia, sem ferramenta pra varrer o todo. Hoje, com MCP, entra-se e vê-se o sistema inteiro. O que parecia inacabado era o limite da ferramenta de então, não da ideia.
- **"Consciência com score fixo em 100"** → schema modelado, motor não ligado. É rascunho a minerar, não peça a afirmar como pronta.

**Conclusão sob Lei 7:** o 360° é um MOLDE EXCELENTE de schema pra esta capacidade — não uma peça PROVADA que se pluga. Minera-se o desenho (que é maduro e raro), constrói-se o motor que nunca rodou, e prova-se com o primeiro cliente real — que só agora existe.

## 3. O QUE ENTRA (universal) × CONFIGURAÇÃO (tenant)

| Universal (vira o módulo) | Configuração do tenant |
|---|---|
| Medição de atividade por membro (contadores genéricos) | Quais atividades contam pra cada função |
| Motor de "próxima melhor ação" por pessoa | Metas e pesos por cargo |
| Detecção de follow-up esquecido | Prazo que define "esquecido" no setor |
| Comparação topo × base do time | Definição de "topo" (volume? margem? NPS?) |
| Ciclo medir→comparar→coachar→premiar | Regras de gamificação/premiação do tenant |

**Teste anti-viés:** medir atividade e recomendar ação é universal. O que conta como atividade e como meta é dado de tenant.

## 4. COMO O BUSINESS OS FAZ CERTO O QUE O 360° FEZ INCOMPLETO

O 360° tentou ser observador **e** balcão num banco só — e ficou observador sem balcão (faltou produto, estoque, pedido, comissão). O Business OS resolve por arquitetura: o agente-gerente é um módulo do Domain IA que **consome os eventos** dos outros módulos (venda do Comercial, atividade do CRM, pedido do Varejo) via o event_outbox do Core. Ele não precisa ter o balcão dentro dele — ele lê o fluxo. É exatamente o que a arquitetura de eventos da Etapa 2 destrava.

## 5. RISCO / FRONTEIRA

- 🟠 **Aceite do colaborador (LGPD/trabalhista):** medir atividade de empregado exige ciência prévia e registrada (item LEXIS, herdado do 360°). Fechar antes de qualquer piloto real.
- 🟠 **Motor nunca rodou:** calcular de verdade a partir do dado é escrever a função que o 360° só modelou. É obra, não plug.
- 🟢 **Schema maduro:** a modelagem do 360° adianta meses de desenho.

## 6. EM UMA FRASE

> **O Agente-Gerente mede o que cada pessoa do time realmente faz, cobra o follow-up esquecido e transforma o que o melhor vendedor faz em meta pros outros — herdando o schema maduro que o ALSHAM 360° modelou e nunca teve chance de provar, porque nenhum produto da casa tinha ido a mercado até agora.**

---
*Capacidade candidata · Universo Bonaparte · ALSHAM Global Commerce Ltda*
