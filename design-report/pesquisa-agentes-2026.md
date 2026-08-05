# PESQUISA AMPLA — Arquitetura dos Agentes de IA mais capazes (2025–2026)

> **Bastão do dono:** entender, de fonte real e pública, **como os agentes de IA mais capazes de hoje são construídos** — o que lhes dá capacidade de **analisar** (comparar, perceber padrão, raciocinar/julgar sobre dado real), não só responder pergunta ou disparar aviso. É pra não repetir o erro da rodada anterior (um gatilho determinístico rebatizado de "análise").
>
> **Compilado:** 2026-08-05. **Método:** quatro frentes de busca web em paralelo (laboratórios grandes · startups · open-source · técnicas/papers), cada achado com fonte (link, nome, data) e rótulo **VALIDADO** × **PROMISSOR/EXPERIMENTAL**.
>
> ⛔ **Escopo:** SÓ fonte pública e legítima — repositório aberto, documentação técnica publicada, paper, engenharia documentada pelas próprias empresas, dado exposto publicamente. **Nada** de como qualquer sistema foi comprometido, burlado ou jailbroken — não foi pedido, não foi buscado.
>
> ⛔ **Nada foi pré-filtrado.** Está tudo aqui, mesmo o que parece fraco — inclusive rotulado como fraco. **Nenhuma recomendação de qual copiar:** essa é decisão do dono e do guia depois de ver tudo, não deste documento.
>
> Este é um documento de pesquisa (`design-report/`), não canon. Alimenta a curadoria do Hunter (ver `docs/canon/MEMORANDO-DIVISAO-DE-AGUAS.md` Parte VI e `docs/canon/BANCO-DE-EVOLUCAO.md`); a curadoria vem **depois**, com o dono junto.

---

## 0. LEITURA TRANSVERSAL — o que, de fato, faz um agente ANALISAR (observação, não recomendação)

As quatro frentes convergiram, independentemente, no mesmo achado. Registrado aqui como **observação do que a evidência pública mostra** — a escolha do que vale para a ALSHAM é do dono.

O que separa um agente que **analisa dado real** de um que só **responde rápido** ou **dispara uma ferramenta** não é o modelo sozinho — é o **arreio** (harness) em volta dele. Cinco mecanismos aparecem repetidamente, cada um documentado por fonte primária:

1. **Raciocínio PERSISTIDO através do loop de ferramenta.** O mecanismo mais citado. Os *reasoning items* da Responses API da OpenAI (mantidos entre chamadas de ferramenta, ~3% de ganho no SWE-bench) e o *interleaved/extended thinking* da Anthropic (raciocinar depois de cada resultado de ferramenta) são a mesma ideia: o modelo **constrói sobre a própria cadeia de raciocínio** em vez de recomeçar após cada resultado. É o oposto de "responde-passo-a-passo".
2. **Código-como-orquestrador sobre dado bruto.** O *programmatic tool calling* da Anthropic e o *terminal* do ChatGPT agent, e no OSS o `CodeAgent` do smolagents, deixam o modelo **rodar loop/filtro/junção sobre um dataset intermediário grande** num sandbox e raciocinar só sobre o resultado destilado — comparação e busca de padrão que nunca caberiam (ou poluiriam) o contexto.
3. **Loops plan → gather → critique → re-plan, com verificação.** O gap-identification do Gemini Deep Research, o loop de verificação do Claude Code + subagentes de revisão adversarial, o plan-before-code do Jules e do Devin: o agente **avalia a própria evidência/saída antes de agir** — isso é julgamento, não reflexo. Raiz teórica: Reflexion, Self-Refine, verifiers/critics, LLM-as-Judge.
4. **Memória além da janela de contexto.** MemGPT/Letta (memória auto-editável em camadas, estilo memória virtual de SO) e mem0 (grafo + retrieval multi-hop temporal) deixam o agente **trazer um fato antigo de volta pra comparar com um novo** — análise de longo horizonte que uma janela só não segura.
5. **Isolamento de contexto via sub-agentes + debate multi-agente.** Manus (planner/knowledge/executor), Replit (descarta o contexto do sub-agente de teste), AutoGen/AG2 GroupChat & Society-of-Mind, Multi-Agent Debate: **especialistas comparam análises independentes** e um coordenador extrai o veredito — pattern-finding multi-perspectiva.

Contexto longo (a janela de 1M tokens do Gemini) e os protocolos (MCP, A2A) são **enablers** — fornecem o dado —, mas o trabalho analítico vive nos mecanismos 1–5.

Os **benchmarks que realmente medem análise** (não velocidade): **GAIA** (síntese multi-passo sobre tarefa real), **SWE-bench** (raciocinar sobre uma base de código real), **WebArena/WebVoyager** (raciocínio de DOM multi-passo), **τ-bench** (consistência/aderência a política sobre k tentativas — confiabilidade, não sorte).

---

## PARTE I — LABORATÓRIOS GRANDES

*Padrão recorrente: um loop **percebe → raciocina (chain-of-thought/"thinking") → age**. O diferencial de análise é se o traço de raciocínio é **preservado e reutilizado** através do loop.*

### OpenAI

- **Operator / Computer-Using Agent (CUA)** — 2025-01-23 (preview). Combina visão do GPT-4o + raciocínio via RL; loop: screenshot → chain-of-thought → ação (clica/rola/digita) em pixels crus, com mouse/teclado virtuais; pede confirmação em ações sensíveis. ⭐ O CoT explícito *entre* cada screenshot e ação é o que o deixa "navegar tarefas multi-passo, tratar erros e se adaptar". **VALIDADO** (produto, system card). Fontes: [Introducing Operator](https://openai.com/index/introducing-operator/) · [Computer-Using Agent](https://openai.com/index/computer-using-agent/) · [Operator System Card](https://openai.com/index/operator-system-card/)
- **ChatGPT agent** — 2025-07-17. Modelo agêntico da família o3 que "alterna entre raciocínio e ação direta"; unifica Deep Research + Operator; opera um **computador virtual** (browser visual + terminal com rede limitada para análise de dados + Connectors). ⭐ Puxa dado, roda código sobre ele, raciocina sobre o resultado e itera. **VALIDADO** (GA Pro/Plus/Team). Fonte: [ChatGPT agent System Card](https://openai.com/index/chatgpt-agent-system-card/)
- **o-series (o1/o3/o4-mini) + Responses API / Agents SDK** — 2025. LLMs treinados com RL que "pensam antes de responder" (longo CoT interno); ⭐ **na Responses API os *reasoning items* PERSISTEM entre chamadas de ferramenta** (IDs únicos), "permitindo ao modelo construir sobre a cadeia existente em vez de recomeçar após um resultado de ferramenta" (~3% no SWE-bench) — o mecanismo mais nítido de "analisar através dos passos". **VALIDADO**. Fontes: [Reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) · [Reasoning items (cookbook)](https://developers.openai.com/cookbook/examples/responses_api/reasoning_items) · [Agents SDK](https://developers.openai.com/api/docs/guides/agents) · [Deep research](https://openai.com/index/introducing-deep-research/)

### Anthropic

- **Claude computer use** — 2024-10-22 (beta). Ferramenta `computer` (screenshot in, cursor/teclado out) + text-editor + bash; usa o computador "como uma pessoa". OSWorld 14.9% screenshot-only no lançamento. ⭐ Intercala observação e ação em vez de macro fixa. **VALIDADO** (API, Bedrock, Vertex). Fonte: [Introducing computer use](https://www.anthropic.com/news/3-5-models-and-computer-use)
- **Advanced (agentic) tool use** — 2025-11-24. Três mecanismos: **Tool Search Tool** (`defer_loading` — corta contexto de definição de ~72K→~8.7K tokens), **Programmatic Tool Calling** (Claude escreve Python num sandbox, "processa resultados intermediários sem adicioná-los ao contexto", devolve só o final — ~37% menos tokens), **Tool Use Examples** (72%→90% de acurácia de parâmetro). ⭐ O programmatic tool calling É um motor de análise: orquestra loops/condicionais sobre dados em código e só expõe o destilado. **VALIDADO** (beta). Fonte: [Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- **Extended/interleaved thinking + memory & context editing** — 2025. "Pensar entre chamadas de ferramenta e raciocinar depois de receber resultados"; **memory tool** extrai/salva fatos para continuidade; context editing limpa resultados/blocos de thinking. ⭐ Análogo da Anthropic aos reasoning items — raciocina *sobre* cada resultado antes da próxima ação. **VALIDADO**. Fontes: [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) · [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) · [Claude 4](https://www.anthropic.com/news/claude-4)
- **Claude Code** — 2025. Ambiente agêntico de código: Explore → Plan → Implement → Commit, com **plan mode**; ferramentas (edit, bash, grep, web) + **MCP** como ferramentas de primeira classe; **CLAUDE.md** por sessão + **subagentes** em contexto isolado que devolvem resumos. ⭐ Loop de verificação ("faz, roda o check, lê o resultado, itera") + **subagentes de revisão adversarial** ("um modelo fresco tenta refutar o resultado, então quem faz não é quem avalia"). **VALIDADO**. Fonte: [Best practices](https://code.claude.com/docs/en/best-practices)
- **Model Context Protocol (MCP)** — 2024-11. Cliente-servidor sobre **JSON-RPC 2.0**; padroniza descoberta e chamada de ferramentas/dados. ⭐ É encanamento, não raciocinador — mas dá acesso uniforme ao **dado real** que o agente então analisa. **VALIDADO** (padrão de indústria: OpenAI, Google, Microsoft interoperam). Fontes: [Introducing MCP](https://www.anthropic.com/news/model-context-protocol) · [modelcontextprotocol.io](https://modelcontextprotocol.io)

### Google DeepMind / Google Cloud

- **Project Mariner** — 2024-12-11 (protótipo). Sobre Gemini 2.0; interpreta a página **multimodalmente** (layout/forms/conteúdo visual e contextual); I/O 2025: roda em **VMs na nuvem**, até **10 tarefas simultâneas**, **"Teach and Repeat"** (ensina uma vez, repete em sites similares). ⭐ Interpretação contextual (não seletores fixos) + generalização de procedimento. **PROMISSOR → cada vez mais VALIDADO** (pago no AI Ultra em 2026). Fonte: [Project Mariner](https://blog.google/technology/google-deepmind/project-mariner/)
- **Gemini 2.5 / 3.x** — arXiv 2025-07-07. "Extended thinking" com **thinking budget**; tool use nativo; ⭐ **janela de 1M tokens** — segura dataset/base/corpus inteiros e raciocina sobre tudo de uma vez; MoE esparso; multimodal unificado. **VALIDADO**. Fonte: [arXiv 2507.06261](https://arxiv.org/abs/2507.06261)
- **Gemini Deep Research** — 2024-12. Agente sobre Gemini 2.5 Pro: loop **planejar → executar → raciocinar → reportar** — "formula queries, lê resultados, **identifica lacunas e busca de novo**", sabe quando chega a um beco; treinado com RL multi-passo. ⭐ Gap-identification é julgamento explícito sobre a evidência (HLE subiu de 7.95%→26.9–32.4%). **VALIDADO**. Fonte: [Deep Research API docs](https://ai.google.dev/gemini-api/docs/deep-research)
- **Jules** — 2025 (preview). Coding agent assíncrono sobre Gemini (Pro planeja, Flash leve): clona o código numa VM, instala deps, gera **plano para revisão antes de implementar**, roda testes, abre PR; lê **AGENTS.md**. ⭐ Plan-before-code + testes na VM = raciocínio/verificação. **VALIDADO (preview)**. Fonte: [Jules docs](https://jules.google/docs)
- **Gemini Enterprise / Agentspace + ADK + A2A** — 2026. Vertex vira Gemini Enterprise Agent Platform; **ADK v1.0** (4 linguagens), **A2A v1.0** (agente-a-agente, ~150 orgs), MCP gerenciado via Apigee, 200+ modelos (inclui Claude). ⭐ Orquestração multi-agente (especialistas + coordenador) para decompor análise. **VALIDADO**. Fonte: [Cloud Next 2026 (TNW)](https://thenextweb.com/news/google-cloud-next-ai-agents-agentic-era)

### Outros laboratórios grandes

- **Microsoft Copilot Studio agents** — 2025–2026. Builder NL + drag-and-drop sobre 1.200+ conectores; **orquestração multi-agente** ("swarms"); adicionou MCP + computer use (GA maio/2026); roadmap 2026 traz **agent memory**. Roda em modelos OpenAI + xAI Grok. ⭐ Orquestração + computer use + dado de conector; profundidade analítica herda do modelo base. **VALIDADO** (plataforma GA). Fonte: [6 core capabilities](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/6-core-capabilities-to-scale-agent-adoption-in-2026/)
- **xAI Grok agents (Grok 4.1 Fast / Grok Build)** — 2026-05-15. Grok 4.1 Fast: "fast-reasoning, deep tool use, large context"; Grok Build (coding agent, beta). ⭐ Menos detalhe arquitetural público. **PROMISSOR/EXPERIMENTAL** (produtos-agente; modelos base em produção). Fonte: [xAI Grok in Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/more-choice-more-flexibility-xai-grok-4-1-fast-now-available-in-microsoft-copilot-studio/)
- **Meta** — nenhum produto-**agente** frontier de produção surgiu na busca para 2025–2026 (Llama é família de modelos, não um agente computer-use/coding documentado pela Meta). **N/A** — não documentado em forma de agente público.

---

## PARTE II — STARTUPS

*Padrão recorrente: o loop **plan → act-with-tools → reflect/verify**, diferenciado por (a) como a ação alcança o mundo (shell/editor sandbox × DOM do browser × visão/computer-use) e (b) como o contexto sobrevive ao longo horizonte (filesystem-como-memória, isolamento por sub-agente, memória persistente escopada).*

### Coding agents

- **Devin (Cognition)** — 2024-03-12. Planner/executor de longo horizonte; no SWE-bench navegou o repo **sem lista de arquivos**; **72% das runs vencedoras levaram >10 min** (evidência de reflexão iterativa). Sandbox com **shell + editor + browser**, roda a suíte de testes e re-conserta. ⭐ Resolveu **13.86%** de issues reais do GitHub end-to-end (vs 1.96% anterior *unassisted*), ~23% com os testes finais; pós-Windsurf, o **SWE-1.5** interno marca **40.08%** a ~950 tok/s. **VALIDADO**. Fontes: [Introducing Devin](https://cognition.com/blog/introducing-devin) · [SWE-bench report](https://cognition.com/blog/swe-bench-technical-report) · [Windsurf acquisition](https://cognition.com/blog/windsurf)
- **Cursor (Anysphere) — Agent/Composer** — 2024–25. Interpreta tarefa → busca a base → planeja um change-set → edita multi-arquivo → roda comandos, com gates de aprovação. ⭐ Loops ler-analisar-editar sobre o repo real; força documentada por mecanismo/adoção, não por benchmark-agente citado. **VALIDADO** (uso massivo). Fonte: [morphllm comparison](https://www.morphllm.com/comparisons/cursor-vs-windsurf-vs-copilot)
- **Windsurf — Cascade (sob Cognition)** — 2024; adq. jul/2025. Agente **persistente** (não turno-a-turno) que mantém contexto de ações recentes (edições, terminal, linter); **"Fast Context"** (RAG + mapa semântico da base). ⭐ Contexto-de-ação persistente + feedback de linter/terminal = diagnóstico e ajuste. **VALIDADO**. Fonte: [DeployHQ: Windsurf/Cascade](https://www.deployhq.com/guides/windsurf)
- **Replit — Agent 3** — 2025-09-10. Loop autônomo de **até 200 min**; **spawna um sub-agente de teste, descarta o contexto dele e devolve só a observação final**; auto-teste via **Playwright code-gen** (gera→executa→detecta erro→conserta→re-roda). ⭐ Self-testing loop é reflexão documentada; ~90% de autonomia (número do vendedor). **VALIDADO** (o número 90% é do vendedor → PROMISSOR nesse ponto). Fonte: [Introducing Agent 3](https://replit.com/blog/introducing-agent-3-our-most-autonomous-agent-yet)

### "Super agents" de propósito geral

- **Manus (Butterfly Effect / Monica)** — 2025-03-06. Planner/executor com **recitação de todo-list** (reescreve a lista pra empurrar o objetivo pra atenção recente), **state machine que mascara logits** de ferramenta (preserva cache), **filesystem como memória externa ilimitada**, isolamento multi-agente (planner + knowledge + executor). ⭐ **GAIA L1 86.5% / L2 70.1% / L3 57.7%** (à frente do OpenAI Deep Research à época). **VALIDADO** (writeup arquitetural raro e detalhado). Fonte: [Context Engineering — Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- **Genspark — Super Agent (MainFunc)** — 2025-04. **Mixture-of-Agents**: orquestrador roteia sub-tarefas por **9 LLMs** de tamanhos variados, **80+ ferramentas** próprias, com **checagem de reflexão** antes do artefato. ⭐ **GAIA 87.8%** (à frente de Manus e Deep Research); o roteamento MoA é em si um passo analítico. **VALIDADO**. Fonte: [VentureBeat: Genspark Super Agent](https://venturebeat.com/ai/gensparks-super-agent-ups-the-ante-in-the-general-ai-agent-race)

### Browser / web-action agents

- **browser-use (OSS)** — 2024. Planner LLM sobre representação destilada da página; **Playwright**; ⭐ **DOM distillation** (tira o DOM ao essencial interativo, corta tokens) — **89.1% no WebVoyager** (SOTA reportado). **VALIDADO**. Fontes: [aimultiple: open-source web agents](https://aimultiple.com/open-source-web-agents) · [firecrawl: best browser agents](https://www.firecrawl.dev/blog/best-browser-agents)
- **Magnitude (OSS)** — 2025. **Vision-first**: LLM visualmente-aterrado especifica coordenadas em pixel (evita numerar elementos do DOM "que não generaliza em sites modernos"); recomenda Claude Sonnet 4. ⭐ **94% no WebVoyager** (o mais alto aqui) — mostra o fork visão × DOM. **VALIDADO** no benchmark; **PROMISSOR** como categoria de produção (visão é mais cara/lenta). Fonte: [GitHub: magnitudedev/browser-agent](https://github.com/magnitudedev/browser-agent)
- **MultiOn (The AGI Company)** — 2023–24. Comandos NL → ações de browser via extensão + API; muitos agentes concorrentes. ⭐ Enquadrado em *execução de ação*, não análise; sem benchmark de análise. **PROMISSOR/EXPERIMENTAL** (perfil esvaziou em 2025). Fonte: [MultiOn docs](https://docs.multion.ai/welcome)
- **AgentGPT (Reworkd)** — 2023-04 (OSS). Loop clássico de **decomposição autônoma de tarefa** (AutoGPT-style no browser). ⭐ Demonstrador de goal-decomposition, não analista com benchmark; confiabilidade de loops abertos é fraqueza conhecida. **EXPERIMENTAL**. Fonte: [GitHub: reworkd/AgentGPT](https://github.com/reworkd/agentgpt)

### Enterprise / vertical

- **Perplexity — Comet + Deep Research / "Computer"** — 2025–2026. **Framework multi-agente**: agente de Retrieval coleta dado ao vivo, agente de Synthesis (GPT-5/Claude 4.5) estrutura, agente de **Verification valida citações contra fontes vivas** antes da saída; roteamento por modo. ⭐ **Agente de verificação** explícito + casos de uso de *análise* documentados (padrões em dashboards, histórico de commits, análise de concorrentes). **VALIDADO** (por mecanismo, não benchmark). Fonte: [Comet Assistant](https://www.perplexity.ai/hub/blog/comet-assistant-puts-you-in-control)
- **Sierra (Bret Taylor & Clay Bavor)** — 2024-02. **"Journeys"** (caminho end-to-end + ferramentas + info); agentes **Horizon** de longo horizonte (dias/semanas) com context engine; **"constelação de modelos"** roteia partes da conversa a LLMs diferentes. ⭐ Camada de raciocínio (× classificador de intenção antigo) é o diferencial; evidência é deploy enterprise, não benchmark. **VALIDADO**. Fonte: [TechCrunch: Sierra](https://techcrunch.com/2024/02/19/sierra-ai-agents-customer-service/)
- **Lindy** — 2024–25. Deliberadamente **restrito** — de campo NL aberto para **construtor visual de workflow** (mais confiável/legível); coordenação multi-agente; **estado persistente escopado entre runs** com poda ativa de memória. ⭐ Memória cross-run + delegação carregam padrão entre interações; tese 2.0 é *confiabilidade sobre autonomia aberta*. **VALIDADO** (análise workflow-escopada). Fonte: [ZenML: Lindy open-ended → guided](https://www.zenml.io/llmops-database/evolution-from-open-ended-llm-agents-to-guided-workflows)
- **Adept (histórico)** — ACT-1 (2022), Fuyu (2023); time core foi pra **Amazon (jun/2024)**. Pioneiro do **action transformer** (ações de UI a partir de NL — precursor do computer-use). **EXPERIMENTAL/histórico** — fundacional, sem agente-produto independente ativo. Fonte: [Contrary Research](https://research.contrary.com/company/cognition)

---

## PARTE III — FRAMEWORKS OPEN-SOURCE

*Snapshot de estrelas via GitHub API em 2026-08-05 (aproximado, drifta). Padrão recorrente: runtimes de estado/grafo que persistem entre passos, pipelines guiados por métrica/juiz, e debate/memória multi-agente.*

### Índice (estrelas ~, data de criação)

| Projeto | Repo | ★ ~ | Criado | Categoria |
|---|---|---|---|---|
| n8n | [n8n-io/n8n](https://github.com/n8n-io/n8n) | 199.4k | 2019-06 | Automação + AI Agent node |
| AutoGPT | [Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | 185.8k | 2023-03 | Agente autônomo / plataforma |
| Dify | [langgenius/dify](https://github.com/langgenius/dify) | 151.3k | 2023-04 | Builder agêntico + workflow |
| browser-use | [browser-use/browser-use](https://github.com/browser-use/browser-use) | 107.9k | 2024-10 | Browser/web agent |
| OpenHands | [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | ~83k | 2024-03* | Coding agent (ex-OpenDevin) |
| MetaGPT | [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) | 69.7k | 2023-06 | Multi-agente por papéis |
| mem0 | [mem0ai/mem0](https://github.com/mem0ai/mem0) | 62.5k | 2023-06 | Camada de memória |
| AutoGen | [microsoft/autogen](https://github.com/microsoft/autogen) | 60.2k | 2023-08 | Multi-agente conversacional |
| CrewAI | [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | 56.6k | 2023-10 | Crews por papel + flows |
| LlamaIndex | [run-llama/llama_index](https://github.com/run-llama/llama_index) | 51.4k | 2022-11 | Dados/RAG + agentes |
| Agno | [agno-agi/agno](https://github.com/agno-agi/agno) | 41.6k | 2022-05 | Plataforma full-stack |
| LangGraph | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | 38.9k | 2023-08 | Runtime de grafo com estado |
| DSPy | [stanfordnlp/dspy](https://github.com/stanfordnlp/dspy) | 36.6k | 2023-01 | Programação + otimizadores |
| smolagents | [huggingface/smolagents](https://github.com/huggingface/smolagents) | 28.7k | 2024-12 | ReAct que escreve código |
| Semantic Kernel | [microsoft/semantic-kernel](https://github.com/microsoft/semantic-kernel) | 28.4k | 2023-02 | SDK enterprise |
| OpenAI Agents SDK | [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | 28.4k | 2025-03 | Loop leve + handoffs |
| Letta | [letta-ai/letta](https://github.com/letta-ai/letta) | 24.1k | 2023-10 | Agentes com memória (ex-MemGPT) |
| OpenAI Swarm | [openai/swarm](https://github.com/openai/swarm) | 21.9k | 2024-02 | Multi-agente educacional (superado) |
| Google ADK | [google/adk-python](https://github.com/google/adk-python) | 21.0k | 2025-04 | Dev kit code-first |
| Pydantic AI | [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | 19.1k | 2024-06 | Framework type-safe |
| Qwen-Agent | [QwenLM/Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) | 16.9k | 2023-09 | Function-calling/MCP |
| MS Agent Framework | [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | 12.6k | 2025-04 | Unifica AutoGen + SK |
| AG2 | [ag2ai/ag2](https://github.com/ag2ai/ag2) | 4.8k | 2024-11 | Fork comunitário do AutoGen |

<sub>*OpenHands: org renomeada de `All-Hands-AI`; projeto ex-`OpenDevin` (linhagem 2024-03).</sub>

### Runtimes de raciocínio / orquestração

- **LangGraph** — VALIDADO. `StateGraph`: um objeto de estado (`TypedDict`) flui por **nós** (funções) com **arestas condicionais** — máquina de estados explícita. **Memória em duas camadas**: *checkpointer* (Postgres em prod) persiste estado a cada super-step (pausa/resume, retry, human-in-the-loop) + **Store** de longo prazo entre threads. ⭐ Grafo + estado persistido = multi-passo sobre dado: ramifica em resultado intermediário, faz map-reduce, interrompe para julgamento; a comparação construída ao longo de muitos nós não se perde. Fontes: [Graph API docs](https://docs.langchain.com/oss/python/langgraph/graph-api) · [memory writeup](https://dev.to/sreeni5018/the-architecture-of-agent-memory-how-langgraph-really-works-59ne)
- **CrewAI** — VALIDADO. **Crews** (agentes com papel/goal/backstory executando Tasks sob Process `sequential`/`hierarchical`) + **Flows** (orquestração determinística event-driven com estado, roteamento condicional, loops). Memória short/long/entity. ⭐ Hierarchical + Flows: manager delega a especialistas (researcher → analyst → critic) e o Flow persiste estado para comparar/agregar. Fonte: [docs](https://docs.crewai.com/en/introduction)
- **Microsoft AutoGen + AG2 + Agent Framework** — AutoGen VALIDADO; AG2 e Agent Framework PROMISSOR. `ConversableAgent` + **GroupChat** (um `GroupChatManager` decide ordem de fala, coleta, transmite; ~9 padrões) + **SocietyOfMindAgent** (group chat interno apresentado como um agente). ⭐ GroupChat é motor de **debate/crítica/consenso** — papéis argumentam/verificam sobre o mesmo dado antes do veredito. ⚠️ Fragmentação: time original forkou p/ AG2, e a Microsoft aponta pro Agent Framework unificado. Fontes: [AG2 GroupChat](https://docs.ag2.ai/latest/docs/user-guide/advanced-concepts/groupchat/groupchat/) · [Society of Mind](https://docs.ag2.ai/latest/docs/use-cases/notebooks/notebooks/agentchat_society_of_mind/)
- **OpenAI Agents SDK (+ Swarm)** — SDK VALIDADO; Swarm superado. Primitivas: **Agents**, **Handoffs** (transfere controle a outro agente), **Guardrails** (validação em paralelo), **Sessions** (memória de trabalho), **Runner** + **tracing on by default**. ⭐ Handoffs roteiam a analistas/críticos; guardrails são passo de julgamento; mais leve que LangGraph/CrewAI (você monta o grafo). Fonte: [SDK docs](https://openai.github.io/openai-agents-python/)
- **smolagents (Hugging Face)** — VALIDADO. `MultiStepAgent` = loop **ReAct**; **`CodeAgent`** (ação = snippet Python executável, ~30% menos passos) × `ToolCallingAgent` (JSON); sandbox E2B/Docker. ⭐ Código-como-ação: escreve loop/agregação/filtro pra computar sobre dado real num passo (compara N itens, junta fontes) em vez de raciocinar item-a-item em prosa. Fonte: [ReAct guide](https://huggingface.co/docs/smolagents/v1.9.0/conceptual_guides/react)
- **DSPy (Stanford)** — VALIDADO. **Signatures** (contrato tipado in→out) + **Modules** (`Predict`, `ChainOfThought`, `ReAct`) + **Metrics** (exact ou **LLM-as-judge**) + **Optimizers** (`BootstrapFewShot`, `MIPROv2`) que auto-tunam contra a métrica. ⭐ Talvez o mais forte para análise *rigorosa*: LLM-as-judge e avaliação métrica são primeira-classe; otimizadores rodam/pontuam o pipeline sobre um dataset repetidamente. Fonte: [dspy.ai](https://dspy.ai/)
- **Pydantic AI** — VALIDADO. **Agent** (system prompt + deps tipadas + `output_type` Pydantic + tools), injeção de dependência type-safe, **grafos** multi-agente, **execução durável** (sobrevive a falha/restart, via Temporal), MCP, **Pydantic Evals**. ⭐ Saídas estruturadas tipadas + Evals = análise validada e repetível (cada passo devolve schema comparável/agregável). Fonte: [Pydantic AI docs](https://pydantic.dev/docs/ai/overview/)
- **Google ADK** — VALIDADO (backing). Camadas Agent/Tool/Session/Deployment; workflow agents **`SequentialAgent`/`ParallelAgent`(fan-out+merge)/`LoopAgent`(até condição)**; dispatch por `transfer_to_agent`; **framework de avaliação** embutido. ⭐ `ParallelAgent` fan-out+merge e `LoopAgent` iterar-até-condição são as formas de comparar muitos inputs e refinar julgamento. Fonte: [multi-agent patterns in ADK](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)

### Projetos centrados em memória

- **Letta (ex-MemGPT)** — VALIDADO. Contexto = **memória virtual de SO**, agente **auto-edita** a memória via tool calls: **Core** (bloco sempre em contexto), **Recall** (histórico buscável), **Archival** (cold store de longo prazo). ⭐ Deixa raciocinar sobre dado maior que a janela — pagina fatos in/out, acumula achados numa investigação longa, revisita evidência arquival. Fonte: [MemGPT agents docs](https://docs.letta.com/guides/legacy/memgpt_agents_legacy)
- **mem0** — VALIDADO. Pipeline **extract → consolidate (ADD-only, entity linking, rerank temporal) → retrieve** (fusão semântico + BM25 + entidade); variante **grafo** para multi-hop. Reporta 92.5 LOCOMO / 94.4 LongMemEval, ~26% sobre baseline OpenAI a 3–4× menos tokens. ⭐ Grafo + multi-hop = raciocínio relacional sobre fatos acumulados; rerank temporal compara passado × presente. Fonte: [mem0 research](https://mem0.ai/research)

### Coding & plataformas autônomas

- **OpenHands (ex-OpenDevin)** — VALIDADO. Agent + **ACI** (shell + editor + browser num sandbox); **Agent Server** REST (vários agentes/máquina) + **Automation Server** (agendado/Slack/GitHub); pode rodar OpenHands, Claude Code, Codex, Gemini (ACP-compatível). ⭐ Executa e inspeciona código/dado real num sandbox por muitos passos. Fonte: [docs.all-hands.dev](https://docs.all-hands.dev)
- **AutoGPT** — VALIDADO por fama; virando plataforma. O "GPT autônomo" original (goal→plan→act→reflect + memória em arquivo/vetor); hoje builder low-code + marketplace. ⭐ Loop plan-execute-reflect é analysis-shaped mas notoriamente instável em longo horizonte. Fonte: [repo](https://github.com/Significant-Gravitas/AutoGPT)
- **MetaGPT** — VALIDADO (research-grade). Multi-agente **SOP por papéis** (PM/arquiteto/engenheiro/QA passam artefatos estruturados). ⭐ Divisão de papéis + hand-artifacts = decompor e cross-checar (spec → design → review). Fonte: [repo](https://github.com/FoundationAgents/MetaGPT)
- **Agno (ex-phidata)** — VALIDADO (subindo). Full-stack: tools, memória, knowledge (RAG), reasoning, "teams" multi-agente + runtime/UI. ⭐ Knowledge + reasoning + teams = análise multi-agente aterrada em retrieval. Fonte: [repo](https://github.com/agno-agi/agno)

### Dados/RAG, low-code e SDKs enterprise

- **LlamaIndex** — VALIDADO. RAG (índices/retrievers/query engines) + **agent workflows** (`Workflow` event-driven, `AgentWorkflow`, ReAct). ⭐ Query-engine-as-tool para raciocinar sobre grandes corpora — sub-question decomposition, comparação multi-documento, roteamento entre fontes. Fonte: [repo](https://github.com/run-llama/llama_index)
- **Dify** — VALIDADO. Builder agêntico: LLM + retrieval + code exec + **Agent nodes**; **agent mode** nativo faz ReAct (search → próxima ferramenta → avalia → retry). ⭐ Loop reason-tool-evaluate-retry + retrieval em superfície no-code. Fonte: [Dify vs n8n](https://medium.com/generative-ai-revolution-ai-native-transformation/dify-vs-n8n-which-platform-should-power-your-ai-automation-stack-in-2025-e6d971f313a5)
- **n8n (AI Agent node)** — VALIDADO (como plataforma de automação). 400+ integrações + **AI Agent node** (o agente decide ferramentas; o workflow orquestra o resto); nós MCP client/server. ⭐ IA-como-um-passo num pipeline determinístico — bom pra ops onde um agente analisa/decide num nó; menos pra raciocínio multi-agente profundo. Fonte: [n8n vs Dify](https://www.ayautomate.com/blog/n8n-vs-dify)
- **Microsoft Semantic Kernel** — VALIDADO (enterprise). Plugins/funções, planners, conectores de memória; convergindo no Agent Framework. [repo](https://github.com/microsoft/semantic-kernel)
- **MS Agent Framework** — PROMISSOR/consolidando. Unificação oficial AutoGen (multi-agente) + Semantic Kernel (enterprise), Python+.NET, novo. [repo](https://github.com/microsoft/agent-framework)
- **Qwen-Agent** — VALIDADO (Alibaba). Function calling, MCP, code interpreter, RAG, sobre Qwen≥3. [repo](https://github.com/QwenLM/Qwen-Agent)
- **AG2** — PROMISSOR. Fork comunitário do AutoGen ("AgentOS"); GroupChat/swarm/nested-chat; risco de fragmentação. [repo](https://github.com/ag2ai/ag2)

---

## PARTE IV — TÉCNICAS, PADRÕES & PAPERS

*Cada técnica com origem, mecanismo, ⭐ o ângulo de comparação/julgamento, e rótulo. Todos os arXiv IDs foram verificados por busca nesta sessão.*

### Raciocínio & Planejamento

| Técnica | Origem | Data | arXiv | Rótulo | ⭐ Ângulo de análise |
|---|---|---|---|---|---|
| Chain-of-Thought | Wei et al., Google | 2022-01 | [2201.11903](https://arxiv.org/abs/2201.11903) | VALIDADO | Torna o traço de raciocínio inspecionável — sub-conclusões que se checam/comparam/corrigem |
| Self-Consistency | Wang et al., Google | 2022-03 | [2203.11171](https://arxiv.org/abs/2203.11171) | VALIDADO | Ensemble: várias derivações que convergem = cross-check (+17.9% GSM8K) |
| ReAct | Yao et al., Princeton/Google | 2022-10 | [2210.03629](https://arxiv.org/abs/2210.03629) | VALIDADO | Observação de ferramenta real re-entra no raciocínio; revisa o plano contra a verdade (loop padrão) |
| Reflexion | Shinn et al., Northeastern/MIT | 2023-03 | [2303.11366](https://arxiv.org/abs/2303.11366) | VALIDADO | Compara falhas passadas com a tentativa atual; lição verbal em memória episódica |
| Self-Refine | Madaan et al., CMU/AI2 | 2023-03 | [2303.17651](https://arxiv.org/abs/2303.17651) | VALIDADO | Gera-critica-revisa (self-bias é o limite) |
| Tree-of-Thoughts | Yao et al., Princeton/DeepMind | 2023-05 | [2305.10601](https://arxiv.org/abs/2305.10601) | PROMISSOR/VALIDADO | Pontua e compara soluções parciais concorrentes, poda/expande (Game-of-24: 4%→74%) |
| Graph-of-Thoughts | Besta et al., ETH | 2023-08 | [2308.09687](https://arxiv.org/abs/2308.09687) | EXPERIMENTAL | Funde/sintetiza múltiplos ramos de raciocínio (+62% sort vs ToT, −31% custo) |
| Plan-and-Solve / Execute | Wang et al., SMU | 2023-05 | [2305.04091](https://arxiv.org/abs/2305.04091) | VALIDADO | Plano revisável como um todo antes de gastar tool calls |
| ReWOO | Xu et al., NC State/MS | 2023-05 | [2305.18323](https://arxiv.org/abs/2305.18323) | PROMISSOR | Plano com placeholders escrito antes de qualquer observação (−64% tokens, robusto a falha) |
| Toolformer / function calling | Schick et al., Meta AI | 2023-02 | [2302.04761](https://arxiv.org/abs/2302.04761) | VALIDADO | Offload do que é pouco confiável → raciocinar sobre valores reais retornados |

### Recuperação & Aterramento

| Técnica | Origem | Data | arXiv | Rótulo | ⭐ Ângulo |
|---|---|---|---|---|---|
| RAG | Lewis et al., FAIR/UCL | 2020-05 | [2005.11401](https://arxiv.org/abs/2005.11401) | VALIDADO | Resposta aterrada e citável em evidência recuperada |
| Agentic RAG (survey) | Singh, Ehtesham et al. | 2025-01 | [2501.09136](https://arxiv.org/abs/2501.09136) | PROMISSOR | Agente critica a evidência puxada ("é suficiente? relevante? busca de novo") — multi-passo/multi-fonte |

### Memória

| Técnica | Origem | Data | arXiv | Rótulo | ⭐ Ângulo |
|---|---|---|---|---|---|
| MemGPT / Letta | Packer et al., UC Berkeley | 2023-10 | [2310.08560](https://arxiv.org/abs/2310.08560) | VALIDADO | Decide o que lembrar/recuperar/comparar entre sessões |
| mem0 | Chhikara et al., Mem0 | 2025-04 | [2504.19413](https://arxiv.org/abs/2504.19413) | PROMISSOR/VALIDADO | Persiste fatos e recupera o subconjunto relevante pra comparar com o pedido atual |
| CoALA (taxonomia de memória) | Sumers/Yao et al. | 2023-09 | [2309.02427](https://arxiv.org/abs/2309.02427) | PROMISSOR | Working/episódica/semântica/procedural — recall episódico compara situação atual × episódios análogos |

### Protocolos

| Protocolo | Origem | Data | Fonte | Rótulo | ⭐ Ângulo |
|---|---|---|---|---|---|
| MCP | Anthropic | 2024-11 | [anthropic.com](https://www.anthropic.com/news/model-context-protocol) · [modelcontextprotocol.io](https://modelcontextprotocol.io) | VALIDADO | Superfície uniforme de sistemas reais pra puxar dado ao vivo e agir |
| A2A (Agent2Agent) | Google → Linux Foundation | 2025-04 | [blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) · [repo](https://github.com/a2aproject/A2A) | PROMISSOR | Especialistas dividem análise e passam resultado entre si (Agent Card) |

### Multi-agente, debate & julgamento

| Técnica | Origem | Data | arXiv | Rótulo | ⭐ Ângulo |
|---|---|---|---|---|---|
| Multi-Agent Debate | Du et al., MIT/Google | 2023-05 | [2305.14325](https://arxiv.org/abs/2305.14325) | PROMISSOR | Comparação adversarial/colaborativa — reconcilia a própria análise com a dos pares (N× custo) |
| LLM-as-a-Judge | Zheng et al., LMSYS/Berkeley | 2023-06 | [2306.05685](https://arxiv.org/abs/2306.05685) | VALIDADO | Julgamento comparativo automatizado ("qual é melhor e por quê"), ~85% acordo com humano; controlar viés |
| Verifier/Critic ("Verify Step by Step") | Lightman et al., OpenAI | 2023-05 | [2305.20050](https://arxiv.org/abs/2305.20050) | VALIDADO | Separa "propor" de "checar" — process reward pontua cada passo |

### Test-time compute / raciocínio em inferência

| Técnica | Origem | Data | Fonte | Rótulo | ⭐ Ângulo |
|---|---|---|---|---|---|
| OpenAI o1/o3 | OpenAI | 2024-09 | [openai.com](https://openai.com/index/learning-to-reason-with-llms/) | VALIDADO | Gasta mais compute deliberando/auto-checando por query (AIME 12%→74%→93% rerank) |
| DeepSeek-R1 | DeepSeek-AI | 2025-01 | [2501.12948](https://arxiv.org/abs/2501.12948) | VALIDADO | Mesma capacidade de o1, **aberta e inspecionável** (+ 6 destilados 1.5B–70B) |
| Compute-Optimal Test-Time Scaling | Snell et al., Berkeley/DeepMind | 2024-08 | [2408.03314](https://arxiv.org/abs/2408.03314) | PROMISSOR/VALIDADO | Quanto de "pensar"/busca extra compra acurácia, e quando (orçar deliberação) |

### Benchmarks que medem análise

| Benchmark | Origem | Data | arXiv | ⭐ O que mede |
|---|---|---|---|---|
| SWE-bench | Jimenez et al., Princeton | 2023-10 | [2310.06770](https://arxiv.org/abs/2310.06770) | Analisar uma base real e produzir fix validado por testes (2.294 issues) |
| GAIA | Mialon et al., Meta/HF | 2023-11 | [2311.12983](https://arxiv.org/abs/2311.12983) | Coleta+síntese multi-passo entre ferramentas (humano 92%, GPT-4+plugins 15%) |
| WebArena | Zhou et al., CMU | 2023-07 | [2307.13854](https://arxiv.org/abs/2307.13854) | Tarefa web de longo horizonte com checagem funcional (melhor GPT-4: 10.59%) |
| AgentBench | Liu et al., Tsinghua | 2023-08 | [2308.03688](https://arxiv.org/abs/2308.03688) | Agir-e-raciocinar em 8 ambientes; expõe gap comercial × aberto |
| τ-bench / τ²-bench | Yao et al., Sierra | 2024-06 | [2406.12045](https://arxiv.org/abs/2406.12045) | **Consistência e aderência a política sobre k tentativas** (pass^k) — confiabilidade, não sorte |

**Superfícies adjacentes (flag para próxima passada, não detalhadas):** Least-to-Most ([2205.10625](https://arxiv.org/abs/2205.10625)), PAL/Program-Aided ([2211.10435](https://arxiv.org/abs/2211.10435)), LATS (MCTS+reflexão, [2310.04406](https://arxiv.org/abs/2310.04406)), RAP/Reasoning-via-Planning ([2305.14992](https://arxiv.org/abs/2305.14992)), RAPTOR (RAG hierárquico, [2401.18059](https://arxiv.org/abs/2401.18059)), e datasets HotpotQA / MMLU-Pro / BrowseComp.

---

## 5. ÍNDICE CONSOLIDADO — VALIDADO × PROMISSOR/EXPERIMENTAL

> **Definições:** VALIDADO = em produção / adoção ampla / caso real documentado. PROMISSOR = adotado mas ainda estabilizando, OU número relevante reportado pelo próprio vendedor. EXPERIMENTAL = resultado de pesquisa forte, não provado em escala. As duas categorias estão aqui **rotuladas, não escolhidas** — a seleção é do dono.

### VALIDADO (produção / adoção documentada)

- **Labs:** OpenAI Operator/CUA · ChatGPT agent · o-series + Responses API/Agents SDK · Deep Research · Anthropic computer use · advanced tool use · interleaved thinking + memory · Claude Code · MCP · Gemini 2.5/3.x · Gemini Deep Research · Jules (preview) · Gemini Enterprise/ADK/A2A · Microsoft Copilot Studio.
- **Startups:** Devin/Cognition (SWE-1.5) · Cursor · Windsurf/Cascade · Replit Agent 3 · Manus (GAIA) · Genspark (GAIA) · browser-use (WebVoyager) · Magnitude (no benchmark) · Perplexity Comet · Sierra · Lindy.
- **OSS:** LangGraph · CrewAI · AutoGen · OpenAI Agents SDK · smolagents · DSPy · Pydantic AI · Google ADK · Letta · mem0 · OpenHands · AutoGPT (fama/plataforma) · MetaGPT · Agno · LlamaIndex · Dify · n8n · Semantic Kernel · Qwen-Agent.
- **Técnicas:** CoT · Self-Consistency · ReAct · Reflexion · Self-Refine · Plan-and-Execute · Toolformer/function calling · RAG · MemGPT · MCP · LLM-as-Judge · Verifier/process reward · o1/o3 · DeepSeek-R1. **Benchmarks:** SWE-bench · GAIA · WebArena · AgentBench · τ-bench.

### PROMISSOR / EXPERIMENTAL

- **Labs:** Project Mariner (promissor→validando) · xAI Grok Build (beta).
- **Startups:** Magnitude (como categoria de produção vision-first) · MultiOn (execução, sem benchmark de análise) · AgentGPT (demo de decomposição) · Adept (histórico, time na Amazon).
- **OSS:** MS Agent Framework (consolidando) · AG2 (fork) · OpenAI Swarm (superado/educacional) · LangGraph Supervisor (add-on).
- **Técnicas:** Tree-of-Thoughts (custo) · Graph-of-Thoughts · ReWOO · Agentic RAG · mem0 (números do vendedor) · CoALA · A2A (early) · Multi-Agent Debate (N× custo) · Compute-Optimal Test-Time Scaling.

---

## 6. NOTAS DE CONFIABILIDADE (honestidade da própria pesquisa — Lei 7)

- **Evidência mais forte (benchmark de análise):** Devin/SWE-bench, Manus/GAIA, Genspark/GAIA, browser-use & Magnitude/WebVoyager, o1/DeepSeek-R1. ⚠️ Vários números são **auto-reportados** pelos vendedores (Genspark 87.8%, Manus 86.5%, Replit "90% autonomia", "10× mais barato") e os leaderboards GAIA/SWE-bench **mudam** — tratar como reivindicação datada, não fato eterno.
- **Documentado por mecanismo, sem benchmark:** Sierra, Lindy, Perplexity Comet, Cursor — análise real, mas a evidência é writeup/deploy, não um benchmark-agente público.
- **Fraco / esvaziado (incluído por lei, rotulado):** MultiOn e AgentGPT (execução/decomposição, pouca evidência de análise); Adept (histórico).
- **Fontes:** blogs de vendedor (Cognition, Manus, Replit, Perplexity, OpenAI, Anthropic, Google) são **primárias mas promocionais**; agregadores independentes (ZenML LLMOps, Latent Space, VentureBeat, TechCrunch, CNBC) corroboram as afirmações estruturais. ⚠️ As páginas `openai.com/index/*` bloqueiam fetch automático (403); os detalhes da OpenAI foram reconstruídos de excertos de busca das mesmas páginas oficiais + docs/cookbook fetcháveis.
- **Estrelas de GitHub:** leitura ao vivo de 2026-08-05, aproximadas, **drift** garantido.
- ⭐ **Compilado inteiramente de fonte pública e legítima. Nenhum material de comprometimento, jailbreak ou burla foi usado ou buscado** — não estava no escopo e não faz parte deste bastão.

---

*ALSHAM Global Commerce Ltda · Universo Bonaparte · Documento de pesquisa (design-report), não canon. A curadoria — o que a ALSHAM adota, e quando — é decisão do dono e do guia, com este mapa na mesa.*
