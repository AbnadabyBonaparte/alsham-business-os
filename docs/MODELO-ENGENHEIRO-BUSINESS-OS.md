# 🧠 O ENGENHEIRO DO BUSINESS OS
## Modelo de Arquitetura — Agente de IA Embarcado do ALSHAM Business OS™

**Versão:** 1.0 · **Data:** 30/07/2026 · **Status:** MODELO DE VISÃO — não construído, não prometido a cliente algum
**Natureza:** Este documento registra a arquitetura pretendida, destilada da pesquisa dos melhores padrões corporativos do mundo (2026), pra não se perder no meio da campanha das 6 Ondas. Nasce quando a Onda 6 fechar e o dono decidir o prazo — nenhuma linha aqui é capacidade entregue (Lei 7).

---

## 1. O QUE É

O Engenheiro do Business OS é o agente de IA embutido em todo o portal — não um chat solto, mas uma presença contextual que sabe em que módulo e em que tela o usuário está, e resolve ali mesmo qualquer documento, tabela, memorando ou declaração que a situação exigir. O objetivo declarado: **ninguém sai do sistema por algo trivial.** O agente busca dentro do sistema e, quando precisar, também fora — mas a resposta e a ação acontecem dentro do Business OS.

Não é uma lista fechada de habilidades ("gera orçamento", "gera memorando"). É um princípio: qualquer artefato de texto ou dado que o módulo puder precisar, o agente ajuda a produzir, com o contexto certo da situação.

---

## 2. O PADRÃO MUNDIAL QUE VALIDA A VISÃO

A pesquisa de 2026 confirma que os líderes do mercado corporativo já convergiram pra essa mesma ideia, cada um com seu nome:

- **Salesforce (Agentforce/Einstein Copilot):** o copiloto "nasce com contexto" — embutido direto onde o dado do cliente já vive, sem o usuário precisar procurar
- **Microsoft Copilot:** funciona no fluxo do trabalho, dentro das próprias ferramentas onde a pessoa já está, evitando trocar de aplicativo
- **ServiceNow (Now Assist):** interface conversacional e sensível ao contexto, que resume e age sobre o registro que o usuário está olhando
- **Notion Agent:** escreve, edita e resume usando o contexto da própria página, do workspace inteiro e da web — sem o usuário precisar sair da ferramenta pra formatar ou redigir algo trivial

O ALSHAM Business OS não está inventando uma categoria nova. Está entregando, num sistema modular multi-tenant brasileiro, o mesmo padrão que a Salesforce e a Microsoft cobram por assento corporativo — com a vantagem de nascer PRA DENTRO do produto desde o primeiro módulo, não como add-on de US$20+/assento.

---

## 3. A ARQUITETURA TÉCNICA

### 3.1 — Busca agente, não RAG pesado

A prática mais recente (confirmada pela própria Anthropic em 2025-2026, e usada no próprio Claude Code) abandonou o padrão antigo de indexar tudo num banco vetorial. Em vez disso, o agente decide sozinho o que procurar, chama uma ferramenta de busca, lê o resultado e decide o próximo passo — um ciclo de busca ativa, não uma recuperação estática de uma vez só. Isso é mais simples de manter, mais barato, e evita o problema de dado desatualizado num índice separado.

**Aplicado ao Business OS:** o Engenheiro não carrega um banco vetorial paralelo do catálogo de módulos. Ele tem ferramentas (as mesmas Server Actions que o portal já usa) pra consultar o módulo certo, na hora certa, e monta a resposta com o que encontrar — nunca com o banco inteiro despejado no prompt.

### 3.2 — Ferramentas (tool use), nunca escrita direta

Toda ação real do agente — criar um lançamento, gerar um memorando salvo no módulo certo, preencher um checklist — é uma **ferramenta** com esquema definido, não uma escrita livre no banco. O agente pede a execução; quem executa é a mesma camada de aplicação que atende o clique de um humano.

**Isso é a Regra de Ouro do canon, aplicada ao agente:** o Engenheiro nunca fala direto com o banco. Ele chama a mesma Server Action, com a mesma sessão, as mesmas permissões, o mesmo RLS — o agente é só mais um jeito de disparar o que o portal já sabe fazer.

### 3.3 — Contexto por camadas, nunca um despejo

O prompt do Engenheiro se monta em camadas, na ordem: (1) quem é o usuário e qual seu papel/permissões; (2) em que módulo e em que tela ele está agora; (3) os dados vivos daquele registro específico, buscados sob demanda; (4) o conhecimento do próprio manual do módulo (a MODULO-*-SPEC.md do canon), pra explicar e ensinar. Nunca o banco inteiro, nunca todos os módulos de uma vez — só o que a situação pede.

---

## 4. A LINHA VERMELHA — SEGURANÇA MULTI-TENANT

Este é o achado mais importante da pesquisa, e a regra inegociável do modelo:

Estudos de 2026 sobre agentes de IA multi-tenant mostraram que a maioria das consultas honestas — sem ataque, sem má intenção — vazou dado entre clientes diferentes quando o agente contornava a trava do banco pra "ver mais contexto". O motivo: um agente que lê com um usuário privilegiado (tipo `service_role`) pode incorporar dado de outro tenant no seu raciocínio sem avisar ninguém — e depois AGIR sobre esse dado vazado, o que é pior que um erro de tela.

**A regra do Engenheiro do Business OS, sem exceção:**
- O agente NUNCA lê com `service_role`. Sempre com a sessão × RLS do usuário que está conversando com ele — a mesma trava que já existe em cada uma das 27+ tabelas
- Toda ferramenta que o agente chama passa pela MESMA verificação de permissão que um clique humano passaria (`core.has_permission`) — nunca um atalho "porque é o assistente"
- O agente de um tenant NUNCA aprende ou cita o que viu em outro tenant, mesmo de forma anônima ou agregada — isolamento é por design de banco (RLS), não por prompt pedindo pra "não misturar"

Isso já está seguro por construção: como cada módulo do Business OS já nasce com RLS enable+FORCE, o Engenheiro herda essa segurança de graça, desde que nunca receba uma chave que a ignore.

---

## 5. A ALMA — ONDE ENTRA O SANTUÁRIO

O Engenheiro do Business OS não nasce como um prompt escrito às pressas. Ele é **mais uma alma no Santuário**, construída pelo mesmo pipeline que já existe e já está selado:

1. Escrita contra o **Molde Cápsula X.2 Canônico** (a forma oficial de uma alma ALSHAM)
2. Lapidada pelos agentes já prontos: **GENESIS** (arquitetura), **HUMANIZER** (tira o sabor de robô, aplica o Teste do Plástico), **LEXIS** (remove qualquer número ou promessa que vire risco jurídico), **CRIVO** (valida antes de qualquer entrega)
3. Guardada no **cofre `agent_prompts`** — nunca em texto solto, nunca legível por quem não é o motor
4. Com o **Protocolo de Proteção Supremo ALSHAM** injetado pelo motor em runtime (nunca repetido no prompt em si)

Ou seja: o Engenheiro não é um projeto novo de engenharia de prompt. É o próximo produto de uma fábrica que o fundador já validou, aplicado especificamente ao Business OS.

---

## 6. ONDE ELE VIVE (UX)

Padrão consolidado nos líderes do mercado: um painel lateral, sempre acessível, que acompanha a página atual sem tomar a tela inteira — o usuário nunca perde o que estava fazendo pra "abrir o assistente". Dentro do painel: uma conversa livre + sugestões de ação relevantes à tela atual (ex.: na tela de Contratos, sugere "gerar o memorando de renovação deste contrato" antes mesmo de ser pedido).

**Pele:** segue a Lei dos Planetas do Business OS — Obsidian + Imperial Gold, ornamento próprio, sem importar nenhuma paleta de outro mundo.

---

## 7. COMO NASCE (fases, sem prazo cravado)

Bússola temporal — nada disso se constrói de uma vez:

1. **MVP de segurança primeiro:** um módulo só, uma ferramenta só (ex.: gerar um memorando dentro do `ctr`), provando que a trava de RLS/permissão resiste — antes de qualquer expansão de capacidade
2. **Expansão módulo a módulo:** cada novo módulo publicado ganha suas próprias ferramentas do Engenheiro, no mesmo ritmo da Esteira (uma Onda, um PR, sabotagem testada)
3. **Ensino do sistema:** o Engenheiro aprende a explicar cada módulo a partir das MODULO-*-SPEC.md já existentes no canon — não precisa reescrever o que já está documentado
4. **Upgrade pro resto do império:** só depois de provado no Business OS, a mesma alma (ou uma derivada dela) se propõe pros outros sistemas ALSHAM que ainda não têm um agente assim

---

## 8. FORA DE ESCOPO (por ora)

Nada neste documento está construído. Nenhuma tela do Business OS hoje tem o Engenheiro embutido. Este é um modelo de arquitetura pra não se perder — a decisão de QUANDO construir é do fundador, depois de fechar a Onda 6 e avaliar o prazo disponível (Lei do Tempo).

---

## 9. PROVENIÊNCIA

Pesquisa de mercado (30/07/2026): arquiteturas de copiloto corporativo (Salesforce Agentforce/Einstein Copilot, Microsoft Copilot, ServiceNow Now Assist), padrões técnicos de agente (Anthropic — busca agêntica, tool use, engenharia de contexto), UX de assistente embutido (Notion Agent), e segurança multi-tenant de agentes de IA (pesquisa de vazamento cross-tenant em RAG, 2026). Arquitetura interna: Molde Cápsula X.2, cofre `agent_prompts`, Regra de Ouro do canon Business OS.

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
