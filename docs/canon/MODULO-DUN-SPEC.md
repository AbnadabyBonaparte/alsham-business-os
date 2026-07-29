# 💰 MÓDULO 12 — RÉGUA DE COBRANÇA

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `dun` ou no pacote
> `@alsham/dunning`.
>
> **Leia junto com [MODULO-RECON-SPEC](MODULO-RECON-SPEC.md)** — de onde vem
> o padrão E10 de projeção que este módulo aplica pela quarta vez — e com
> [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md), a Lei das Etapas que aqui tem a
> terceira aplicação.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `dun`.** "Cobrança" tem duas donas nesta plataforma: **a
régua cobra O CLIENTE DO TENANT; `billing` cobra o tenant.** `dun` (de
dunning, o termo internacional) é curto, não disputa a palavra e foi
conferido por grep com fronteira de palavra: zero colisões.

**`domain_key` = `finance`** — Taxonomia §5, bloco **💰 Financeiro (19)**,
capacidade **Cobrança** (a mesma que o `0010_ar.sql` declarou "outra peça do
Domain Financeiro" ao recusar juros/multa/régua no título). "Régua",
"dunning" e "inadimplência" não existem no mapa — a tela fala régua, o
manifesto fala *Cobrança*. Há teste contando as palavras.

**⛔ O MÓDULO NÃO ENVIA NADA.** Ele diz O QUE fazer e registra QUE FOI FEITO
— quem, quando, por qual canal (texto livre), com anotação. E-mail,
mensagem, ligação automática são integrações futuras DECLARADAS (§6): o
fato `dun.step.executed` já carrega tudo o que uma integração de envio
precisará escutar no dia em que existir.

**⭐⭐ `consumes` NÃO É VAZIO — e o handler EXISTE.** É a Lei 7 do jeito
certo, e é o ponto do módulo: a régua só faz sentido escutando. Ver §3.

---

## 1. ⭐ A LEI DAS ETAPAS, TERCEIRA APLICAÇÃO — re-perguntada de novo

> O passo da régua é DADO DO TENANT: nome livre, dias após o vencimento,
> canal texto livre. Jamais enum do produto.

| Decisão dos irmãos | Resposta no `dun` | Por quê |
|---|---|---|
| passo/etapa é linha de tabela, nome livre (`ops`/`deal`) | ✅ **mantido** | a régua de uma escola ("aviso na agenda") e a de uma distribuidora ("bloqueio de pedido") moram na mesma tabela |
| canal como TEXTO LIVRE (a lição do `crm`) | ✅ **mantido** | colunas por canal congelariam o instrumento de uma década |
| DELETE de passo permitido; trilha sobrevive pelos CARIMBOS | ✅ **mantido** | a execução guarda nome, canal e dias do passo — redesenhar não apaga história |
| trilha imutável em 3 camadas | ✅ **mantido** | ato de cobrança é fé pública |
| esteiras/funis MÚLTIPLOS por tenant | ⛔ **DIVERGE: UMA régua ativa** | a negociação ESCOLHE o funil ao nascer; o título vencido não escolhe nada — ele CAI na régua. Réguas múltiplas exigiriam regra de atribuição que ninguém desenhou: capacidade futura declarada. Um índice único parcial é a lei |
| dias livres por passo | ⭐ **decisão própria: NÃO-DECRESCENTES** | um "3º aviso aos 5 dias" depois de um "2º aos 15" faria o desenho dizer uma ordem e o calendário outra |
| mesmo passo repetido no mesmo título | ⛔ **recusado** (índice único) | o segundo "2º aviso" seria cobrar em dobro sem perceber |

## 2. A FILA — consequência calculada

"Na régua" = **vencido e em aberto** (`open`/`partially_received` +
`due_date < hoje`). A view `dun.queue` (com `security_invoker`) calcula por
data, sempre atual — a TELA nunca mente sobre quem está vencido.

⚠️ **A honestidade sobre o relógio:** os fatos `dun.title.entered`/`left`
são emitidos quando um FATO toca o título (projeção) ou quando o primeiro
passo é executado. A entrada por PURA passagem de tempo (venceu ontem, nenhum
evento novo) não emite fato — emitir exigiria cron, capacidade futura
declarada (§6). A fila da tela não depende disso: é consulta calculada.

## 3. ⭐ O CONSUMIDOR (padrão E10, quarta aplicação)

- `packages/dunning/src/dun-title.ts`: traduz os fatos de títulos a receber
  campo a campo, **ignora sem erro** o que não é título (o padrão é
  curinga), e lê a origem de **`envelope.producedBy`** — nunca constante.
- `dun.record_external_receivable()`: security definer, **revogada de
  todos** — só a composição (service_role) chama. Idempotente por
  `(tenant_id, external_ref)`. É ELA quem decide entrada/saída da régua:
  **a baixa ou o cancelamento na origem tira o título SOZINHO**, pelo mesmo
  fato que o trouxe.
- `apps/api/src/composition.ts`: a inscrição `dun-title-projection`, o
  SEGUNDO consumidor do mesmo padrão de eventos (o `recon` é o outro) — o
  correio entrega o mesmo fato aos dois, cada um com a sua idempotência.
- `supabase/tests/17_dun_triangle.sql`: o triângulo provado no banco,
  inclusive com produtor fictício (`erp-bridge`) gravando a origem dele.

⚠️ Não há entrada manual de título ("mão humana ganha" não tem o que ganhar
aqui: não existe import neste módulo — a projeção é a única porta, e o
cliente não a executa).

## 4. O ATO — executar um passo

`dun.execute_step(título, passo, anotação)`: exige `dun.step.execute`,
título NA RÉGUA, passo da régua ATIVA, e recusa o passo repetido. Carimba
nome/canal/dias do passo + autor, emite `dun.step.executed` com os dias de
atraso. O **próximo passo** é decisão do pacote (`nextStep()`): o primeiro
devido (`daysAfterDue <= atraso`) ainda não executado.

## 5. OS FATOS

| Fato | Quando |
|---|---|
| `dun.title.entered` | título vencido e em aberto entrou na régua |
| `dun.title.left` | saiu — baixa, cancelamento ou vencimento renegociado NA ORIGEM |
| `dun.step.executed` | um passo foi executado — com passo pelo nome, canal, atraso e anotação |

E os três consumidos: `ar.receivable.registered` / `updated` / `cancelled` —
**com handler**, conferidos no cartão pelo CI.

---

## 6. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| ENVIO (e-mail/mensagem/ligação) | integração inteira, com credencial do tenant e opt-out LGPD. O fato `dun.step.executed` já carrega o necessário |
| Réguas múltiplas | a regra de atribuição título→régua (por valor? por contraparte? por etiqueta?) — decisão de produto que ninguém tomou |
| `entered` por passagem de tempo | cron/relógio da plataforma — quando existir, é o correio do Core quem acorda, jamais uma segunda fila |
| Juros, multa, correção | política financeira — capacidade própria do Domain; a régua cobra o que o título diz |
| Consumo de outros produtores de título | o handler já aceita qualquer `*.receivable.*` com payload no formato — declarar no cartão exige o produtor existir |

---

## 7. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 29/07/2026, na Missão Trina.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `dun` (`0027_dun.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §16) |
| Pacote `@alsham/dunning` (régua, fila, próximo passo, consumidor) | ✅ construído, com testes |
| Consumidor `ar.*` → régua (handler + inscrição + adaptador) | ✅ **CONSTRUÍDO** — o 7º inscrito da composição |
| Seed (12º cartão, com os 3 consumos) | ✅ CONSTRUÍDO |
| Teste triangular (`17_dun_triangle.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/cobranca` (fila, próximo passo, executar, desenhar régua) | ✅ CONSTRUÍDO |
| Envio · réguas múltiplas · entered por relógio · juros/multa | ⛔ **NÃO CONSTRUÍDO** — ver §6 |

---

## 8. APPLY (dono)

1. Aplicar `0027_dun.sql` (depois do `0026`).
2. Reaplicar o seed — o 12º cartão entra, com os três consumos.
3. ⚠️ **Expor o schema `dun` na Data API.**
4. Instalar pela Store, no tenant que o comprou.
5. ⚠️ **REDEPLOYAR o `apps/api`** — a inscrição `dun-title-projection` só
   existe no build novo. Sem redeploy, os fatos de títulos chegam como
   `no-subscriber` e a régua fica vazia, sem erro que diga o motivo.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
