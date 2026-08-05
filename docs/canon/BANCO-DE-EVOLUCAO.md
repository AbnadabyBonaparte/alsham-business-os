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

## [2026-08-05] [ENGENHEIRO-BUSINESS-OS] [TIPO: validacao]

**Contexto:** Um "Hunter Report 2026" (arquitetura de agentes) chegou com uma lista de técnicas rotuladas "Validado/Promissor/Experimental". Em vez de aceitar os rótulos, um time de **cinco validadores** saiu — **só fonte pública** — conferir as afirmações duvidosas: labs (Dreaming/Outcomes/Operator/Mariner), startups (Devin/Skyvern/UFO), papers (POMDP, Self-Evolving, Multi-Layer Memory, ACT-R) e o padrão crítico/verificador. Resultado completo em `design-report/validacao-tecnicas-agentes-2026.md`.

**O achado — o report tinha OURO misturado com PIRITA:**

- ✅ **Ouro (LIBERADO):** as cinco técnicas-base do ciclo verificador, com citação confirmada — Reflexion (2303.11366), Self-Refine (2303.17651), LLM-as-a-Judge (2306.05685), Let's Verify Step by Step (2305.20050), Generative Verifiers/GenRM (2408.15240, ICLR 2025). Mais Devin "Fusion" (dois papéis: supervisor + executor) = REAL/GA. O **padrão** do portão verificador está liberado.
- ⚠️ **Pirita (MAL RESOLVIDO):** POMDP = citação **mal-atribuída** (o link é paper de hardware); Self-Evolving = **hype de Reddit** sem artefato; Dreaming/Outcomes como PRODUTO = **parada dura de LGPD** (Managed Agents é stateful no servidor do fornecedor, sem ZDR/HIPAA — replica-se o padrão, não se compra); Mariner/Operator/Astra = **enquadramento DATADO** (Mariner descontinuado mai/2026, Operator aposentado ago/2025); todo o bloco GUI/computer-use (Skyvern/UFO/browser-use) = real mas **não serve** ao nosso backend headless.

**A distinção que importa (o coração do achado):** o portão verificador (segundo passe LLM que nota a saída contra rubrica e trava a publicação em `fail`) tem **ALTO valor no Engenheiro REATIVO** (que pode alucinar) e **VALOR BAIXO no insight proativo DETERMINÍSTICO** (`0116`–`0118`) — este não inventa número, então não há alucinação pra pegar, e um crítico LLM ali só viraria o componente menos confiável. **Verificação de pipeline determinístico é teste unitário + livro append-only, não crítico LLM.** Só revisitar se entrar um passo generativo (voz-de-marca da Forja).

**Lição (acionável):** Guardar as cinco técnicas + o padrão do portão verificador na **fábrica de agentes** (bancada de R&D, fora do dado de cliente) para os nossos próprios testes. O único item "implantável-agora" na plataforma é o portão no Engenheiro reativo — e mesmo esse vai pra bancada **primeiro**; levar à plataforma viva toca `apps/api`+`core` → é o clique do dono. Guardrails que viajam junto: o verificador é geração **medida** (`usage_ledger`), **tenant-scoped** (nunca cross-tenant), auditoria só de **metadado** (nunca o prompt/dado), e se tocar PHI passa pela trilha de leitura.

**Gatilho (quando esta lição volta a valer):** (a) antes de plugar qualquer verificador/crítico — reler para lembrar que ele vale no reativo, não no determinístico; (b) sempre que um "report de tendências" chegar com rótulos prontos — o time valida a fonte antes de adotar, porque metade era pirita; (c) quando alguém propuser comprar Dreaming/Outcomes/Managed-Agents — reler o bloqueio de LGPD.

---
