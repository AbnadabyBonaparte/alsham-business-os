# BANCO DE EVOLUÇÃO — ALSHAM GLOBAL

Registro append-only de achados do Hunter e lições do CHRONOS. Formato fixo — nunca reescrever entrada antiga, só acrescentar. Ver `docs/canon/MEMORANDO-DIVISAO-DE-AGUAS.md` Parte VI (o Hunter) e a skill CHRONOS pro protocolo completo.

---

## [2026-08-04] [ENGENHEIRO-BUSINESS-OS] [TIPO: padrao]

**Contexto:** Investigação do Hunter sobre o episódio de agentes autônomos da OpenAI/Anthropic escapando de ambiente de teste (jul/2026) — separando o que é falha de segurança alheia (não replicável, não desejável) do que é arquitetura legítima de fronteira (replicável, desejável). Fontes: MachineLearningMastery, Lyzr.ai, EITT Academy, survey arXiv 2404.11584 — todas de categoria "sinal forte" (documentação técnica/acadêmica nomeada, não hype de rede social).

**A receita — arquitetura vencedora de agente em 2026, por camada:**

1. **Raciocínio nativo, não prompt maquiado.** Modelos líderes (a linha que já move a Forja/Engenheiro, mais o1/o3, DeepSeek R1) geram "tokens de raciocínio" internos antes de responder — decidem sozinhos quando chamar ferramenta, quando delegar, quando encerrar. O trabalho de engenharia migrou de "escrever prompt esperto" para "desenhar a infraestrutura onde agentes especialistas se comunicam."

2. **Enxame de especialistas, não um monolito que faz tudo.** A arquitetura vencedora é vários agentes pequenos, cada um sem memória própria persistente, conectados por uma peça de repasse (handoff tool) — não um único agente gigante tentando cobrir tudo.

3. **Calibração de raciocínio é a arte.** Um agente que chama ferramenta 10× pra responder "quanto é 2+2" está super-raciocinando — é erro de engenharia, não sofisticação. O objetivo é raciocinar o suficiente pro problema, nem mais nem menos.

4. **O "arreio" (harness) pesa mais que o modelo.** O achado mais aplicável: agentes pessoais que escalaram rápido em 2026 revelaram que usuário não precisa só de modelo capaz — precisa de um agente que opera **dentro de fronteiras de segurança explícitas** e **acumula conhecimento útil entre sessões**. Isso confirma, com fonte técnica externa, a Parte VII do Memorando: controle bem desenhado É a diferença entre agente útil e caos — não é o freio que atrapalha a potência, é o que a produz de forma sustentável.

5. **Protocolo padronizado de ferramenta (MCP)** — o mesmo protocolo que já conecta as ferramentas desta própria sessão de trabalho é, hoje, o padrão de mercado pra like esse tipo de conexão agente↔ferramenta, não invenção nossa.

**O que já temos no Business OS pra essa receita** (não precisa vir de fora):

| Peça da receita | Onde já existe em nós |
|---|---|
| Raciocínio nativo | O mesmo motor que já move a Forja e o Engenheiro |
| Ferramenta com fronteira de segurança | `packages/engineer` — sessão×RLS + `core.has_permission` por ferramenta |
| Execução agendada (sem clique) | O correio (`workflow`) já roda via `pg_cron` no Railway, 1×/min |
| Especialista isolado por tenant | A mesma disciplina de `tenant_id` que já rege o sistema inteiro |

**Lição (acionável):** Construir a próxima capacidade de IA como **um especialista pequeno rodando numa tela só** (não um enxame completo de uma vez), reaproveitando o `pg_cron` já existente pra agendamento e a mesma trava de sessão×RLS pra fronteira — provar essa peça mínima antes de replicar o padrão pras outras telas.

**Gatilho (quando esta lição volta a valer):** Toda vez que a ALSHAM considerar construir uma nova capacidade autônoma de IA — reler esta entrada antes de desenhar o escopo, pra não repetir a tentação de ir direto pro "enxame inteiro" sem provar a peça mínima primeiro.

---
