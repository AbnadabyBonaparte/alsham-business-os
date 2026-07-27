# 📢 MÓDULO 2 — CAMPANHAS DE MARKETING
## ALSHAM Business OS™ · Especificação do módulo · Domain `marketing`

**Versão:** 1.0 · **Data:** 27/07/2026 · **Status:** Canônico
**Subordinação:** obedece à [Taxonomia](TAXONOMIA-EMPRESARIAL-ALSHAM.md), ao [Roadmap](ROADMAP-TECNICO-V1.md) e ao [CORE-SPEC](CORE-SPEC.md). Em divergência, os três vencem.

| Peça | O que é |
|---|---|
| `packages/marketing/` | manifesto + máquina de estados + o handler de consumo (domínio puro) |
| `supabase/migrations/0004_marketing.sql` | schema `marketing` — **arquivo, não aplicado** |
| `apps/portal/src/app/campanhas/` | a tela de campanhas |

> **Lei 7:** o que não foi construído está marcado **NÃO CONSTRUÍDO**, e o estado corrente está em **[§6](#6-estado-da-obra--o-que-existe-e-o-que-não-existe)**.

---

## 1. POR QUE ESTE MÓDULO EXISTE — e não é "porque marketing é importante"

O Módulo 1 provou que **um módulo não toca o Core indevidamente**. É metade da tese.

A outra metade nunca tinha sido provada: **dois módulos coexistindo, um reagindo ao fato do outro, sem que nenhum conheça o outro.** Enquanto houvesse um módulo só, "o Lego funciona" era uma afirmação sobre o futuro.

Este módulo existe para transformar essa afirmação em coisa conferível. Se ele funciona — e se o `recon` puder ser desinstalado sem quebrá-lo —, o resto da plataforma é repetir o padrão. Se não funcionasse, a hora de descobrir era esta, com dois módulos, e não com onze.

**Escolhido Marketing, e não outro Domain, de propósito:** é onde o viés mais tenta entrar. Um módulo financeiro tem forma parecida em qualquer empresa; um módulo de marketing convida a codificar *como esta empresa faz marketing*. Se a Lei anti-viés sobrevive aqui, sobrevive em qualquer lugar.

---

## 2. ⭐ O QUE ATRAVESSA A FRONTEIRA — e o que não

### 2.1 O módulo EMITE

Três fatos, todos pela porta única `marketing.emit_event()`, que escreve em `core.event_outbox` **na mesma transação do dado**:

| Evento | Quando |
|---|---|
| `marketing.campaign.published` | a campanha entrou no ar |
| `marketing.campaign.completed` | a campanha cumpriu o ciclo |
| `marketing.campaign.cancelled` | a ação destrutiva — some da operação, nunca da trilha |

**Rascunho salvo e campanha agendada não emitem nada.** Trabalho interno não é fato para o mundo, e emitir a cada salvamento encheria a caixa de saída de ruído — pelo qual o tenant pagaria, porque a cobrança conta evento entregue.

### 2.2 O módulo CONSUME — e isto nunca tinha acontecido aqui

Ele escuta **`recon.approval.decided`**: *uma decisão financeira foi visada por um humano*.

Quando a referência da decisão bate com a `budget_ref` de uma campanha, a campanha fica sabendo. **Ninguém digita nada.**

O que torna isso arquitetura, e não integração:

| O que ele NÃO faz | Por quê |
|---|---|
| não importa `@alsham/finance-reconciliation` | dependência de código é o que impede desinstalar um módulo |
| não faz join em `recon.*` | schema alheio é código alheio com outro nome |
| não conhece o correio (`@alsham/workflow`) | o módulo expõe uma função; quem a inscreve é a composição |
| não implementa idempotência | quem garante é o correio, com `processed_events` |

O único acoplamento é **a string `'recon.approval.decided'`** — contrato público, do mesmo jeito que um cabeçalho HTTP. Se ninguém emitir aquele tipo, este módulo não é acordado, e **nada quebra**.

E há uma consequência que só se percebe olhando o código: o handler lê `producedBy` **do envelope**, não de uma constante. No dia em que um módulo de Contas a Pagar emitir o mesmo formato, ele é atendido **sem uma linha a mais**.

### 2.3 Como isso é verificado, e não prometido

- **`packages/marketing/src/consumption.test.ts`** — roda o `deliverDue()` de verdade, do `@alsham/workflow`, entregando ao handler de verdade. Nada é simulado exceto a persistência, que é justamente o que os pacotes não têm.
- **`supabase/tests/03_marketing_consumption.sql`** — prova o efeito no banco: o fato entra uma vez, a reentrega não repete, a decisão de um tenant não carimba a campanha do outro, e o cliente não forja aprovação.
- **Guarda de CI "módulo não conhece módulo"** — reprova import, dependência declarada em `package.json` e acesso a schema alheio no SQL. Sabotada nas três formas antes de entrar.

---

## 3. A PROJEÇÃO LOCAL — o padrão que todo módulo vai repetir

`marketing.spend_approvals` guarda a **cópia local** de uma decisão tomada em outro módulo, montada só com o que veio no payload.

Três decisões que o schema carrega:

- **Não é fonte da verdade.** `source_module_id` diz de quem é. Aqui é cópia.
- **Não é escrita por gente.** Não há policy de INSERT, UPDATE nem DELETE para `authenticated`, e a função `record_spend_decision()` não é concedida a ele. Só o correio escreve, com `service_role`. Deixar o cliente lançar a própria aprovação de verba seria deixá-lo aprovar a própria verba.
- **`unique (tenant_id, source_module_id, external_ref)`** — cinto além do suspensório. O correio já garante uma entrega por consumidor; isto segura o replay que vier por qualquer outro caminho: reprocessamento manual, restauração de backup, um segundo correio ligado por engano.

**A projeção guarda o fato mesmo quando nenhuma campanha aponta para ele** — e isso é deliberado. A decisão pode chegar **antes** de a campanha existir. Uma projeção que só servisse para carimbar campanhas já criadas perderia todo fato que chegasse cedo, e o sintoma seria uma campanha eternamente sem aprovação com a aprovação guardada no banco. `budgetStatusFor()` fecha essa janela.

---

## 4. ⚖️ O TESTE ANTI-VIÉS, CAMPO A CAMPO

Pergunta de cada coluna: **"uma clínica, uma fábrica e um shopping usariam esta coluna exatamente como está?"**

### O que ENTROU

| Campo | Por que é universal |
|---|---|
| `status` (rascunho→agendada→publicada→encerrada) | toda empresa que faz campanha planeja, põe no ar, tira do ar |
| `scheduled_for` | quando vai ao ar |
| `budget_planned_cents` + `currency` | quanto se pretende gastar. Inteiro em centavos, sem moeda presumida |
| `budget_ref` | referência **opaca** ao item financeiro que banca — o tenant escolhe o que é |
| `audience_note` (texto livre) | o público, como o humano o descreve |
| `channel` na peça (texto livre) | onde a peça vai |
| `metric` + `value` + `unit` no resultado | a clínica mede consultas, a fábrica mede cotações, o shopping mede fluxo |

### O que virou `settings` ou ficou de fora

| Recusado | Por quê |
|---|---|
| **Exigir verba aprovada para publicar** | processo de ALGUMAS empresas. Virou `settings.publishing.requireBudgetClearance`, **default `false`** — o produto não presume burocracia que o cliente não pediu |
| Tipo/categoria de campanha | toda lista dessas é o vocabulário de uma empresa |
| **Enum de canal** (Instagram, e-mail, rádio) | além de viés, é viés que APODRECE: quem escrevesse a lista em 2010 não teria TikTok |
| Público-alvo estruturado | segmentação séria é *CRM marketing*, capacidade própria, e difere por canal |
| ROI, CAC, CPL, taxa de conversão | são CONTAS sobre os números, e a fórmula muda por empresa. Conta é *Analytics* (ENGINE) |
| Fluxo de briefing, aprovação de peça, alçada | *Briefings* e *Produção* são capacidades à parte, e a política é `settings` |
| **Lojista, praça, mall, franqueado** | é a Vertical Shopping (Taxonomia §6). Outro produto, outra etapa |

**A linha que mais importa é a primeira.** Se `requireBudgetClearance` fosse um `if` sem configuração, o produto teria adotado a burocracia de um cliente — e há teste provando que o default não exige nada.

---

## 5. QUEM CRIA NÃO É QUEM PUBLICA

Mesma decisão que o Módulo 1 tomou entre conciliar e visar. O produto **permite** que sejam a mesma pessoa — basta pôr as duas permissões no mesmo papel —, mas não **presume**.

A separação é real, não decorativa: vive num **trigger**, e não numa policy, porque policy de UPDATE não recebe o `old` — ela sabe quem está escrevendo, não o que mudou. Sem o trigger, qualquer um com `manage` publicaria.

Prova colateral que só apareceu ao escrever o teste: **nem o superusuário do banco publica sem a permissão.** O trigger confere `core.has_permission`, não papel de banco.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 27/07/2026, na Etapa 7.*

| Peça | Estado |
|---|---|
| Manifesto, tipos, máquina de estados | ✅ construído, com testes |
| Handler de consumo + projeção local | ✅ construído — a prova da etapa |
| Schema `marketing` (`0004_marketing.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono |
| Tela de campanhas | ✅ construída — listar, criar rascunho, mudar estado com confirmação |
| Peças e resultados | ⚠️ **schema existe, sem tela.** As tabelas estão prontas e provadas; a UI é etapa própria |
| Agente de IA embarcado | **NÃO CONSTRUÍDO** — o kraken-v2 é a peça a minerar (Balanço: PROVADO), e minerar é etapa própria |
| Calendário, social media, e-mail marketing, landing pages | **NÃO CONSTRUÍDO** — 12 das 13 capacidades do Domain |
| Publicação real em qualquer canal | **NÃO CONSTRUÍDO** — "publicar" muda o estado e conta o fato; não posta em lugar nenhum |

**A última linha merece leitura em voz alta.** Este módulo **não publica em rede social**. Ele registra que a campanha entrou no ar e conta isso à plataforma. Integrar canal é *Construir × INTEGRAR* (Lei 3) e é decisão de dono.

---

## 7. O QUE A PRÓXIMA ETAPA HERDA

- **O correio continua não ligado.** Enquanto não estiver (runbook §6), o consumo provado aqui **não acontece em produção**: o evento fica em `pending`. É a peça que mais falta na plataforma inteira, e agora dois módulos dependem dela.
- O padrão da projeção local está pronto para o Módulo 3 copiar.
- A dívida do adaptador de banco (`MODULO-RECON-SPEC §7`) **não piorou**: o encanamento compartilhado já estava fatorado, e cada módulo ganhou porta própria.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
