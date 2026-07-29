# ⚖ MÓDULO 13 — CONTRATOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `legal`

> Leitura obrigatória para quem for mexer no schema `ctr` ou no pacote
> `@alsham/contracts`.
>
> **Leia junto com [MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)** — a identidade
> por documento que aqui é re-perguntada e DIVERGE na renovação — e com
> [MODULO-INV-SPEC](MODULO-INV-SPEC.md), o "saldo é consequência calculada"
> que aqui vira "o termo vigente é consequência calculada".
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `ctr`.** "Contrato" já é vocabulário do CORAÇÃO do canon: o
CORE-SPEC é "o CONTRATO do Lego", `packages/core` é "contrato puro", e o
acoplamento entre módulos é "com o tipo do evento, que é contrato público".
Sol Único — o mesmo argumento que derrubou `event` no Módulo 11 e `os` no
Módulo 7. `ctr` é curto, greppável e foi conferido por grep com fronteira de
palavra: zero colisões.

**`domain_key` = `legal`** — Taxonomia §5, bloco **⚖ Jurídico (12)**,
capacidade **Contratos**. *Assinaturas* é capacidade PRÓPRIA do mesmo Domain
(e há Engine de Assinatura Digital na §4) — não entra aqui.

**⭐ O TERMO VIGENTE NÃO É COLUNA.** O contrato guarda os termos ORIGINAIS e
eles congelam em vigor; o que muda depois muda por ATO imutável (reajuste,
renovação), e o vigente é CALCULADO na leitura (`ctr.contract_terms`). Editar
o valor de um contrato em vigor direto na coluna apagaria o COMO ele chegou
lá — que é o que uma auditoria pergunta.

**⭐ RENOVAÇÃO É ATO NO MESMO CONTRATO — o DIVERGE consciente do `quote`.**
Lá, "renegociar é documento novo" (a contraparte respondeu a UMA proposta
congelada). Aqui a relação contratual é CONTÍNUA: a locação renovada da mesma
sala com a mesma parte é o MESMO contrato aos olhos do mundo, e documento
novo a cada renovação partiria o livro de reajustes em dois (o argumento do
`crm`). Renovar ESTENDE — encurtar prazo não é renovação, é rescisão.

**⭐ O SISTEMA NÃO CALCULA ÍNDICE.** Reajuste é REGISTRO do que gente
decidiu: índice em TEXTO LIVRE ("IGP-M", "IPCA", "acordo"), valor anterior
(o VIGENTE) e valor novo. Índice econômico é ofício (a Lei 3 vizinha) — o
módulo registra; quem calcula é gente. E reajuste sem índice é recusado: a
linha muda do `inv`, aplicada ao dinheiro do contrato.

---

## 1. O CICLO — re-perguntado dos irmãos, com o quadro escrito

```
draft → active | cancelled          active → ended | terminated
```

| Decisão dos irmãos | Resposta no `ctr` | Por quê |
|---|---|---|
| fins TERMINAIS (`quote`/`ap`) | ✅ **mantido** | o que continua é renovação (ato no mesmo); o que recomeça é documento novo |
| expirar/encerrar só com calendário vencido (`quote.expired`) | ✅ **mantido** em `ended` | encerrar contrato vigente mentiria sobre a data — e o fim conferido é o RENOVADO |
| razão obrigatória no desfecho ruim (`deal.lost`) | ✅ **mantido** em `terminated` | o livro existe para se aprender por que se rompe |
| ato carimbado pelo servidor (`quote.decided_*`) | ✅ **mantido** | `decided_at`/`decided_by` via `auth.uid()`/`now()` no porteiro |
| conteúdo congela ao sair do rascunho (`quote` congela a mesa) | ⭐ **ampliado**: termos congelam EM VIGOR | valor muda por REAJUSTE, prazo por RENOVAÇÃO, parte por documento novo. `description` segue editável — anotação não é termo |
| tipo como dado do tenant (Lei das Etapas) | ⭐ **decisão própria: TEXTO LIVRE** | o tipo não agrega nem decide nada neste módulo — cadastro para etiqueta seria cerimônia. Quando um agregado por tipo existir, re-pergunta-se |
| vínculo com crm | ✅ **mantido do `deal`**: ID SOLTO + nome carimbado | nunca FK — a guarda da matriz reprovaria |

**Entrar em vigor exige o essencial:** contraparte e início de vigência (como
o `quote` não põe proposta vazia na mesa). `ends_on` é opcional SEMPRE —
prazo indeterminado existe, e contrato sem fim não "acaba": rescinde-se.

## 2. OS DOIS LIVROS — reajustes e renovações, imutáveis em 3 camadas

- `ctr.adjustments`: quando passa a valer (aceita passado — fato consumado
  registrado depois, o `occurred_at` do `inv`), índice texto livre
  OBRIGATÓRIO, valor anterior VIGENTE + valor novo, anotação, autor.
- `ctr.renewals`: de que fim para que fim (constraint exige ESTENDER),
  anotação, autor.
- Escrita SÓ pelas funções `ctr.register_adjustment()` / `ctr.renew_contract()`
  — security definer que conferem o vínculo POR DENTRO (tenant do CONTRATO,
  nunca de parâmetro) e a permissão `ctr.contract.amend` ANTES.

## 3. OS VENCIMENTOS — consequência calculada

`ctr.expiring` (com `security_invoker`): contratos EM VIGOR com prazo, com
`days_to_end` calculado por data — negativo é "vencido e ainda ativo: a
decisão de renovar ou encerrar está atrasada". **Sem cron fingido**: aviso
automático é integração futura declarada (§5); a view nunca mente.

## 4. OS FATOS

| Fato | Quando |
|---|---|
| `ctr.contract.registered` | nasceu (rascunho) |
| `ctr.contract.updated` | o rascunho mudou no que é FATO |
| `ctr.contract.activated` | entrou em vigor |
| `ctr.contract.adjusted` | reajuste registrado — índice, anterior, novo |
| `ctr.contract.renewed` | vigência estendida — o MESMO contrato |
| `ctr.contract.ended` | fim natural, com a vigência vencida |
| `ctr.contract.terminated` | rescisão, com razão |
| `ctr.contract.cancelled` | rascunho cancelado |

Payload autossuficiente: partes pelo NOME, termos original E vigente.
`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Assinatura digital | é ENGINE da Taxonomia §4 — quando existir, o contrato a consome pelo Core |
| Upload do PDF / anexos | *Storage & Arquivos* é capacidade do Core, NÃO CONSTRUÍDA (a mesma ausência declarada do `ops`) |
| Aditivos estruturados além de reajuste/renovação | mudança de objeto/escopo por aditivo é capacidade própria; hoje, documento novo |
| Garantias (caução, fiança, seguro) | capacidade própria do Domain |
| Aviso automático de vencimento | envio é integração; a view `ctr.expiring` serve o honesto sem cron fingido |
| `quote.proposal.accepted` → contrato | o aceite não carrega vigência nem partes formais — virar contrato exige decisão de CONTRATAÇÃO. Caminho: consumidor E10 + rascunho pré-preenchido + mão humana completa. Exige handler completo para ser declarado |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Quadra.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `ctr` (`0028_ctr.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §17) |
| Pacote `@alsham/contracts` (ciclo, termo vigente, fila de vencimentos) | ✅ construído, com testes |
| Seed (13º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`18_ctr_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/contratos` (carteira, vencimentos, reajustar, renovar, rescindir) | ✅ CONSTRUÍDO |
| Assinatura · PDF · aditivos · garantias · avisos | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0028_ctr.sql` (depois do `0027`).
2. Reaplicar o seed — o 13º cartão entra.
3. ⚠️ **Expor o schema `ctr` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
