# packages/billing · `@alsham/billing`

**Contabilidade de uso** — quanto o tenant consumiu, e se ainda pode.

**Fase do roadmap:** Fase 1 — Core.

**Status:** ✅ **FUNDAÇÃO CONSTRUÍDA** — leitura de limite e contagem de uso. 9 testes.
❌ **Sem gateway de pagamento, sem preço.**

---

## ⚠️ Não há preço aqui, e é de propósito (Lei 7)

Este pacote conta **uso**, não dinheiro. Nenhum valor em reais, nenhuma moeda, nenhuma tabela de preço, nenhuma conversão.

Preço é decisão do dono, com números que ele mede. Enquanto não existirem, escrever qualquer um seria inventar promessa — e há **guarda no CI** que falha o build se um preço ou uma moeda aparecer neste pacote ou no `0003_billing.sql`.

Separar o que o plano **permite** (`plan_limits`) do que o plano **custa** é o que deixa mudar preço sem tocar em limite, e vender o mesmo limite por preços diferentes por região ou contrato.

---

## De onde foi minerado

`usage_ledger` + `plan_limits` do **kraken-v2** (Balanço de Tecnologia §1 e Balanço Supabase §1: **PROVADO** em produção, com 95+ lançamentos reais e economia unitária calculada). É a peça mais próxima de cobrança por uso que o império possui.

---

## O que decide

`checkLimit()` — puro, determinístico:

| Situação | Veredito |
|---|---|
| dentro do teto | passa |
| plano sem teto (`limit: null`) | passa, ilimitado |
| estourou com `on_exceed: 'meter'` | **passa** e mede o excedente |
| estourou com `on_exceed: 'block'` | **corta** |
| não existe teto configurado | **nega** |

**A última linha é a que importa.** Falta de regra não é permissão: é assim que um plano gratuito vira ilimitado por esquecimento, e ninguém descobre até a fatura de infraestrutura chegar.

---

## O livro-caixa

`core.usage_ledger` (em `0003_billing.sql`) é um **livro, não um contador**. Cada consumo é um lançamento; o total é a soma. Um campo `total` que se incrementa perderia a resposta para *"de onde veio esse número?"* — e é exatamente essa pergunta que uma fatura contestada faz.

Três decisões que o schema carrega:

- **O tenant lê o próprio consumo; escrever é `service_role`.** Deixar o cliente lançar o próprio uso seria deixá-lo escolher a própria fatura.
- **Correção é estorno, não edição.** `quantity` aceita negativo, e não há policy de UPDATE. As linhas antigas ficam.
- **`unique (tenant_id, metric, source_ref)`** — o mesmo fato não conta duas vezes. Reentrega do correio bate aqui e é recusada; sem isso, um retry de rede viraria cobrança a mais, que é o pior tipo de bug: o cliente descobre antes de nós.

O período é `YYYY-MM` **do fato**, não da digitação — um lançamento retroativo cai no mês em que o consumo aconteceu.

---

## Zero I/O

Gravação entra por `UsageRecorder`, relógio entra por parâmetro. Quem tem `service_role` é a composição, nunca esta lógica.

---

## O que fica para a próxima etapa

| Peça | Estado |
|---|---|
| Preço em reais | **NÃO CONSTRUÍDO** — decisão do dono, com números medidos |
| Gateway de pagamento (Stripe) | **NÃO CONSTRUÍDO** — o padrão está PROVADO na casa-bonaparte, mas integrar é etapa própria |
| Fatura, cobrança, inadimplência | **NÃO CONSTRUÍDO** |
| Tela de consumo no portal | **NÃO CONSTRUÍDA** |
