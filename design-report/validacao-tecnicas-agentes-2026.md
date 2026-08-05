# Validação das Técnicas de Agentes — LIBERADO × MAL RESOLVIDO

> **Para quê este documento existe.** O Hunter Report ("Pesquisa Ampla de Arquitetura de Agentes 2026") trouxe uma lista de técnicas — misturando ouro provado com pirita. Um time de cinco validadores saiu, **só com fonte pública**, confirmar cada afirmação duvidosa. Este arquivo **guarda tudo o que foi encontrado** para a **fábrica de agentes** — o laboratório onde a ALSHAM constrói e testa os **próprios** agentes, **fora dos sistemas de clientes**, para os nossos testes futuros.
>
> **Não é canon. É material de pesquisa e engenharia interna** (design-report). A curadoria — o que a ALSHAM adota, e quando — é decisão do dono. Este documento só separa o que já pode ir pra bancada (**LIBERADO**) do que ainda precisa de prova ou não serve (**MAL RESOLVIDO**).
>
> **Data da validação:** 2026-08-05 · **Fontes:** públicas, Lei 7 (nenhum número ou citação sem origem verificável; onde a confiança é parcial, está escrito).

---

## Como ler as duas colunas

- ✅ **LIBERADO** — técnica com paper/fonte real confirmada e mecanismo que **transfere** para o nosso stack (TypeScript + SQL + `pg_cron`, sem framework pesado). Pode ir pra bancada da fábrica agora.
- ⚠️ **MAL RESOLVIDO** — uma de três coisas: (a) fonte **errada/mal-atribuída** — o conceito pode existir, a citação do report não presta; (b) **hype sem artefato**; (c) **real, mas não serve pra nós** (ou por LGPD, ou por ser de um mundo — GUI/tela — que não é o nosso backend headless). Fica na prateleira com o motivo escrito.

---

## ✅ LIBERADO — pode ir pra bancada da fábrica

### As cinco técnicas-base do ciclo crítico/verificador (citação confirmada)

Todas confirmadas contra a fonte pública, com o mecanismo concreto. São o núcleo do padrão "gerar → verificar" que já vínhamos perseguindo (`pesquisa-agentes-2026.md` já as listava como VALIDADO — esta rodada **fechou a citação**).

| Técnica | arXiv | Data | Mecanismo (concreto) |
|---|---|---|---|
| **Reflexion** | [2303.11366](https://arxiv.org/abs/2303.11366) | 2023-03 | Converte o resultado (binário/escalar) em **auto-reflexão verbal**, guarda em memória episódica e reinjeta como contexto na próxima tentativa. Sem re-treino de pesos. |
| **Self-Refine** | [2303.17651](https://arxiv.org/abs/2303.17651) | 2023-03 | Um só LLM alterna **FEEDBACK → REFINE** sobre a própria saída, iterando com o histórico no prompt. ~20% de ganho de preferência sobre o one-shot em 7 tarefas. |
| **LLM-as-a-Judge** | [2306.05685](https://arxiv.org/abs/2306.05685) | 2023-06 (NeurIPS 2023) | Um LLM forte **nota** a saída de outro; GPT-4 juiz chega a >80% de concordância com humano. Nomeia os vieses a defender: **posição, verbosidade, auto-elogio**. |
| **Let's Verify Step by Step** | [2305.20050](https://arxiv.org/abs/2305.20050) | 2023-05 (OpenAI) | Treina um **verificador por PASSO** (process reward), não por resposta final. Supervisão de processo resolve 78% de um subconjunto do MATH e bate a de resultado. Lição: **verifique o raciocínio, não só a conclusão.** |
| **Generative Verifiers (GenRM)** | [2408.15240](https://arxiv.org/html/2408.15240) | 2024-08 (ICLR 2025) | O verificador é treinado como **previsão do próximo token** — a correção sai como um **token gerado** ("Yes"/"No") com justificativa em texto. Deixa o mesmo modelo gerar **e** verificar, e a crítica é legível. **É a forma mais aplicável a um shop TS+SQL: o verificador cospe texto + um token de veredito que o nosso motor parseia.** |

**Verdito de todas:** VALIDADO — adotar o **padrão**, nunca o framework. O fio condutor: **um segundo passe de avaliação (próprio ou separado) pega erro que o primeiro passe comete** — medido justamente onde o primeiro passe *pode errar* (matemática, código, texto aberto).

### O padrão prático a construir na fábrica — o "portão verificador"

O **passe de rubrica gated** (forma da Anthropic "Outcomes" reduzida ao osso, com prior art em LLM-as-a-Judge e GenRM). Fluxo **gerar → verificar → travar**:

1. O agente produz o rascunho **+ as linhas reais** de dado que recebeu.
2. Uma **segunda chamada** (contexto limpo — vê só a *saída* e os *dados*, não o raciocínio do primeiro; a regra "output-only" da Outcomes) nota contra uma rubrica curta: "todo número citado está nos dados?", "escopo/tenant certo?", "nenhuma afirmação sem linha que a sustente?".
3. Devolve estruturado `{ verdict: "pass"|"fail", reasons: [...] }` — veredito como **token parseável** (forma GenRM), não prosa solta.
4. `fail` **bloqueia a publicação** — retry Self-Refine (devolve os motivos e refina) ou a tela mostra "não pude confirmar" em vez de afirmação não-verificada. **Nunca inventa um "OK".**

Este padrão está **LIBERADO para a bancada**. Onde ele vale e onde não vale está na seção "O item implantável-agora".

### Achados de sistemas reais que confirmam o padrão

- **Devin "Fusion" (Cognition)** — [cognition.com/blog/devin-fusion](https://cognition.com/blog/devin-fusion). **REAL / GA.** Roda dois agentes em paralelo: um modelo de fronteira para raciocínio/supervisão + um "sidekick" econômico para execução — **crítica constante sobre a execução**. Confirma, num produto em produção, o padrão "supervisor que julga o executor". LIBERADO como **padrão de arquitetura** (dois papéis, tiers de custo diferentes).
- **Anthropic "Outcomes" (grading por rubrica)** — REAL / beta. Um **agente avaliador separado** (mesmo modelo, **janela de contexto fresca**, vê só a saída) nota cada rascunho contra uma rubrica em markdown; a nota é o único feedback do escritor. É o LLM-as-a-Judge operacionalizado como padrão de produto. **O PADRÃO está LIBERADO** (é o que copiamos no portão verificador). ⚠️ O **produto** não — ver MAL RESOLVIDO/LGPD.
- **Memória multi-camada & memória estilo-humano (ACT-R+LLM)** — validados como **reais** pelo nosso checador (decompor histórico em camadas curto-prazo/semântica/episódica; recuperar "conceitos e padrões", não texto bruto). Confirmam a direção que já tomamos com o **livro append-only de histórico do insight** (`0118`) — a memória-além-da-janela. LIBERADO como **direção conceitual** (não como dependência de código; nós já temos a nossa versão em SQL).

---

## ⚠️ MAL RESOLVIDO — fica na prateleira, com o motivo

| Item do report | Veredito | Por quê |
|---|---|---|
| **POMDPs para Agentes** | **MAL-ATRIBUÍDO** | O link do report aponta um paper de **hardware** de três camadas — **não** de POMDP. O conceito (modelar incerteza) existe na literatura, mas **a fonte citada não presta**. Precisa de citação real antes de qualquer uso. |
| **Self-Evolving Cognitive Arch** | **DESCARTADO (hype)** | Fonte é **post de Reddit**, sem artefato, sem paper, sem código. Não é técnica — é conversa de rede social. Sinal fraco (o Memorando/Hunter exige sinal FORTE). |
| **Dreaming / Outcomes como PRODUTO** | **BLOQUEADO por LGPD** | Os produtos são reais (Dreaming = research-preview; Outcomes = beta), **mas o report citou as páginas erradas**. O achado decisivo: **Managed Agents é stateful no servidor do fornecedor, sem ZDR/HIPAA** → para o nosso dado sensível (`whistle`, `patient`/PHI) é **parada dura**. **Não se compra o produto; replica-se o PADRÃO dentro do nosso perímetro** (o padrão está LIBERADO acima). |
| **Mariner / Operator / Astra / Gemini-2.0 framing** | **DATADO** | Enquadramento velho: **Project Mariner descontinuado em mai/2026**; **OpenAI Operator aposentado em ago/2025**. Citar como "estado da arte hoje" seria mentir a data. |
| **GUI / computer-use** (Skyvern, UFO²/³, browser-use) | **REAL, mas NÃO RELEVANTE** | São reais e alguns em produção — mas resolvem "um agente que **vê a tela**". Nós somos **backend headless** (Postgres/cron), não temos tela pra um agente enxergar. Só o **substrato** (raciocínio/crítica/memória) transfere; o miolo GUI não. Prateleira "se um dia tivermos agente de tela". |
| **Frameworks multi-agente** (LangGraph / CrewAI / AutoGen) | **PROMISSOR, fora de escopo** | O survey [Trust but Verify 2508.16665](https://arxiv.org/pdf/2508.16665) (2025-08) mapeia o campo, mas **um único segundo passe gated entrega ~90% do valor a uma fração da complexidade**. Adotar framework pesado não se justifica esta rodada. Fica como mapa, não como dependência. |

---

## O item implantável-agora — o que "serve" de verdade

Cruzando os cinco relatórios, sobra **um** candidato que passa em tudo (paper real + implantável no nosso stack + dentro da LGPD):

> **Um passe de verificação (crítico/rubrica) na resposta do Engenheiro REATIVO** — o portão verificador acima.

A distinção é a chave, e o time foi categórico:

- **No Engenheiro reativo** (o chat LLM que lê módulos e **pode alucinar** número, tenant errado, capacidade inventada) → ✅ **ALTO VALOR.** É exatamente o que todos os papers foram feitos para pegar. **LIBERADO para construir.**
- **No insight proativo determinístico** (`0116`–`0118`, motor TS que **não inventa número** — a frase "3 vencidos, 40% acima da média" é montada de `count()` e da baseline contada) → ⛔ **VALOR BAIXO. NÃO construir.** Não há alucinação pra pegar; um crítico LLM ali só gasta geração medida sobre saída já correta por construção — e o próprio juiz vira o componente menos confiável (risco de "corrigir" um número verdadeiro para um plausível-errado — o auto-elogio nomeado no 2306.05685). A verificação certa de um pipeline determinístico é a que **já temos**: testes unitários no motor puro + o livro append-only como trilha. Só revisitar **se/quando** entrar um passo generativo (a Forja reescrevendo a frase em voz-de-marca) — aí o crítico de fidelidade passa a valer, e **só** para guardar *esse* passo.

**Forma mínima, sem framework:** uma função no `apps/api` (service-role, o único lugar com chave de motor) + uma tabela de auditoria em `core`. É a mesma disciplina de Lego que já regemos.

**Status:** LIBERADO para a **bancada da fábrica primeiro** (nossos próprios testes, fora do dado de cliente), como o dono pediu. Levar para a plataforma viva toca `apps/api` + schema `core` → **é o clique do dono** (Memorando Parte IV, §3). Não se pluga sozinho.

---

## Guardrails que viajam junto de qualquer verificador

Válidos no dia em que o portão sair da bancada para perto de dado real:

- **Custo (medido).** O verificador é uma **segunda geração** por resposta → passa por `checkLimit()` e vira linha no `usage_ledger`, igual a qualquer geração da Forja. Verificar ~dobra o custo em tokens da resposta verificada → **gatear só para respostas de alto risco** (as que afirmam número ou tendência), não pra todo "bom dia". Como o veredito é um token curto, usar um **tier mais barato** para o juiz que para o escritor.
- **LGPD (o que o juiz vê).** O juiz vê **as mesmas linhas tenant-scoped** que o escritor já viu — **sem alargar**. Nunca recebe dado cross-tenant "pra comparar". A linha de auditoria guarda **só metadado** (veredito, motivos, tamanho do prompt, label do motor) — **nunca o texto do prompt nem o dado pessoal**, casando com a lei da Forja ("o prompt nunca vai ao envelope"). Se um dia o agente tocar vertical PHI (`record`/`exam`/`prescription`), o verificador é um **novo leitor** e passa pela mesma trilha de leitura `read_*()` — crítico não é isento da trilha.
- **A lei do motor.** Tudo isto é engenharia interna. Em texto visível ao cliente, o motor é ALSHAM — nome de fornecedor só em código não-visível/config/docs de engenharia (este documento é um deles).

---

## Fontes (públicas, confirmadas nesta rodada)

- [Reflexion — arXiv 2303.11366](https://arxiv.org/abs/2303.11366)
- [Self-Refine — arXiv 2303.17651](https://arxiv.org/abs/2303.17651)
- [LLM-as-a-Judge — arXiv 2306.05685](https://arxiv.org/abs/2306.05685)
- [Let's Verify Step by Step — arXiv 2305.20050](https://arxiv.org/abs/2305.20050)
- [Generative Verifiers (GenRM) — arXiv 2408.15240 (ICLR 2025)](https://arxiv.org/html/2408.15240)
- [Trust but Verify: A Survey on Verification Design for Test-time Scaling — arXiv 2508.16665](https://arxiv.org/pdf/2508.16665)
- [Anthropic — Define Outcomes (docs)](https://platform.claude.com/docs/en/managed-agents/define-outcomes)
- [Cognition — Devin Fusion](https://cognition.com/blog/devin-fusion)

⚠️ **Confiança parcial, declarada (Lei 7):** as citações de *Multi-Layer Memory* e *ACT-R+LLM* vieram do próprio Hunter Report e foram validadas como **reais** pelo nosso checador, mas os identificadores exatos não foram reconferidos linha a linha aqui — tratar como **direção conceitual confirmada**, não como ID a copiar cegamente. Os itens da coluna MAL RESOLVIDO carregam o motivo da reprova; nenhum foi "reprovado por gosto".

---

*ALSHAM Global Commerce Ltda · Universo Bonaparte · Documento de pesquisa (design-report), não canon. Material para a fábrica de agentes — os nossos próprios testes, fora dos sistemas de clientes. A adoção é decisão do dono, com este mapa na mesa.*
