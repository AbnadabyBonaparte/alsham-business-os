# 💬 MÓDULO 27 — PESQUISAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `cx`

> Leitura obrigatória para quem for mexer no schema `nps` ou no pacote
> `@alsham/nps`.
>
> **Leia junto com [MODULO-CARE-SPEC](MODULO-CARE-SPEC.md)** — o caso que
> reabre, aqui re-perguntado e DIVERGIDO — e com
> [MODULO-MNT-SPEC](MODULO-MNT-SPEC.md), o precedente do CHECK argumentado.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `nps`.** O nome mundial do método, três letras, greppável
com fronteira, zero colisões. "pesquisa" é prosa constante do canon e não
serviria de prefixo.

**`domain_key` = `cx`.** A Taxonomia §5 põe *Pesquisas NPS/CSAT* na linha
do 💬 Atendimento ao Cliente — a mesma do care: o care escuta quem
reclama; o nps pergunta a quem não reclamou.

**⭐ A RÉGUA 0–10 É CHECK ARGUMENTADO — a segunda física da onda** (o
precedente é o corretiva/preventiva do mnt; nesta onda, o
published/dropped do edcal foi a primeira). A régua do NPS (detrator 0–6,
neutro 7–8, promotor 9–10) é convenção MUNDIAL do método — solta, cada
tenant inventaria uma régua e nenhum placar seria comparável. **A
PERGUNTA, essa sim, é texto do tenant.** Há teste de contraste mnt×nps.

**⭐ O PLACAR É VIEW — nunca coluna.** `nps.survey_score`
(`security_invoker`): %promotores − %detratores, calculado DO LIVRO — o
saldo do inv e o progresso do goal re-perguntados para a OPINIÃO. ⭐ E
pesquisa SEM resposta NÃO tem linha na view (nem `computeScore()` devolve
número): "ainda sem placar" é a verdade — Lei 7.

**⭐ CLOSED É TERMINAL — o DIVERGE assinado do care.** O caso reaberto é o
MESMO pedido (`resolved → open` existe lá); a pesquisa reaberta seria
OUTRA medição — misturar respostas de abril com as de setembro no mesmo
placar mentiria as duas. A rodada que volta é PESQUISA NOVA. Teste de
contraste care×nps assina os dois lados. **E ABRIR CONGELA a pergunta**
(a física do quote): resposta antiga não pode responder pergunta nova.

**⭐ A RESPOSTA É ATO** — imutável em 3 camadas, ordenada pela SEQUÊNCIA,
carimbada pelo servidor (quem DIGITOU, quando). SÓ a aberta colhe: o
rascunho ainda não abriu; a fechada é medição encerrada. O respondente é
TEXTO NEUTRO OPCIONAL ("mesa 12") — LGPD-mínimo — e **não passeia no
envelope, nem o comentário**.

**⛔ ANON = NADA, sem exceção.** O link público de resposta NÃO existe:
`anon` não recebe grant nenhum neste schema, e há guarda em teste. O
coletor externo é INTEGRAÇÃO FUTURA declarada (serviço de fora → API com
chave, o padrão da Forja). Hoje quem registra a resposta é operador
logado, com permissão própria.

---

## 1. AS PEÇAS

- `nps.surveys`: a rodada — título, a pergunta do tenant, o ciclo com os
  carimbos de abrir e encerrar.
- `nps.responses`: o livro — nota na régua do método, comentário,
  respondente neutro opcional, carimbo do servidor.
- `nps.survey_score`: ⭐ o placar calculado (view, `security_invoker`).

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `nps.survey.drafted` | a rodada nasceu no rascunho |
| `nps.survey.opened` | a coleta abriu — a pergunta congelou |
| `nps.survey.closed` | a medição encerrou. Terminal |
| `nps.response.recorded` | uma voz entrou no livro — a NOTA no envelope |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/pesquisas`: o quadro na ordem de leitura (`orderSurveys()`), redigir,
abrir em dois passos (com o aviso do congelamento), registrar resposta na
régua (0–10 + comentário + respondente opcional), o placar calculado na
tela (`computeScore()` — e "ainda sem placar" quando não há voz),
encerrar. Porta própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`manage` (redigir, abrir, encerrar) e `record` (registrar a voz no
livro). Quem conduz a medição não é necessariamente quem digita a voz.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Envio da pesquisa (e-mail/WhatsApp/QR) | **Lei 3** — o transporte é integração; o módulo registra a medição |
| Link público de resposta | **ANON = NADA:** coletor externo → API com chave (o padrão da Forja), quando o dono decidir — nunca um grant a `anon` |
| Análise de sentimento dos comentários | capacidade da FORJA (IA do Core) — pedida por ela quando fizer sentido, nunca embutida aqui |
| Meta de NPS | isso é o módulo **goal** (métrica texto livre já aceita "NPS da praça") — a ponte é id solto pela tela, nunca FK nem handler |
| CSAT / outras réguas | a capacidade da Taxonomia nomeia NPS/CSAT; esta peça entrega o NPS — a régua CSAT viria como rodada de outro tipo, com decisão de canon própria |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sexta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `nps` (`0042_nps.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §19) |
| Pacote `@alsham/nps` (ciclo, régua, placar calculado, validação) | ✅ construído, com testes |
| Seed (27º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`32_nps_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/pesquisas` (quadro, coleta, placar calculado) | ✅ CONSTRUÍDO |
| Envio · link anônimo · sentimento · meta · CSAT | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0042_nps.sql` (depois do `0041`).
2. Reaplicar o seed — o 27º cartão entra.
3. ⚠️ **Expor o schema `nps` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
