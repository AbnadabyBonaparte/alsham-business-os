# 🔧 RUNBOOK — APLICAR O BANCO DO BUSINESS OS

**Para quem:** o dono, aplicando pelo painel do Supabase. Não exige CLI.
**Quando:** uma vez, ao criar um projeto Supabase novo.
**Quanto tempo:** ~15 minutos, incluindo a conferência de segurança.

> **O que já foi provado antes de você chegar aqui:** estes arquivos foram aplicados de verdade num PostgreSQL 17 limpo, na ordem abaixo, e passaram num teste de isolamento com usuário real. O CI repete isso a cada mudança. **Não é para dar susto.**

---

## ⛔ LEIA ANTES: parte disto JÁ FOI APLICADO

Em **27/07/2026** o dono informou ter aplicado `0001_core.sql`, `0002_recon.sql` e o seed num projeto Supabase de produção, com um tenant piloto. **O repositório não verificou esse apply** — nenhum agente daqui conecta a banco com dado de cliente, e o registro fica assim, literalmente (Lei 7).

| Arquivo | Estado |
|---|---|
| `0001_core.sql` | **APLICADO** — não editar |
| `0002_recon.sql` | **APLICADO** — não editar |
| `seed/0001_platform.sql` | **APLICADO** — idempotente, pode rodar de novo sem estragar |
| `0003_billing.sql` | **ARQUIVO, ainda não aplicado** |
| `0004_marketing.sql` | **ARQUIVO, ainda não aplicado** — o Módulo 2 |
| `0005_courier_cron.sql` | **ARQUIVO, ainda não aplicado** — a saúde da fila e o agendador |

**Se o seu projeto já existe**, o passo 1 não é para você: pule para o Passo 2 e rode **`0003`, `0004` e `0005`, nesta ordem**, depois confira o Passo 3, o Passo 4 e — para dar vida ao Lego — o **Passo 6**.

**Este documento continua valendo inteiro** para o próximo ambiente — homologação, um segundo tenant, uma restauração. É por isso que ele descreve o zero, e não o meio.

---

## ANTES DE COMEÇAR

Três coisas que não são passo, são regra:

1. **Ninguém aplica isto por você, e nenhum agente aplica sozinho.** Criar projeto e aplicar migration é ato do dono. É por isso que este arquivo existe em vez de um script automático.
2. **Nenhuma chave sai do painel.** A `service_role key` é a chave-mãe: quem a tem, ignora toda a RLS. Ela nunca vai para o navegador, para o repositório, para um print ou para uma conversa.
3. **Aplique na ordem.** `0002` depende de `0001` existir. O seed depende dos dois.

---

## PASSO 1 — Criar o projeto

No painel do Supabase → **New project**.

| Campo | O que usar |
|---|---|
| Nome | algo que identifique o ambiente (ex.: `business-os-prod`) |
| Região | a mais próxima de quem vai usar |
| Postgres | **17** (é o padrão; os 12 bancos do império já são 17) |
| Senha do banco | gere no próprio painel e guarde no gerenciador de senhas |

Anote o **Project Ref** (aquele código tipo `abcdefghijklmnop`). Você vai precisar dele para conferir depois.

---

## PASSO 2 — Aplicar os arquivos, nesta ordem

Painel → **SQL Editor** → **New query**. Para cada arquivo: abra o arquivo do repositório, **copie o conteúdo inteiro**, cole no editor e clique em **Run**.

| # | Arquivo | O que faz | Sinal de que deu certo |
|---|---|---|---|
| 1 | `supabase/migrations/0001_core.sql` | o Core: 10 tabelas, 19 policies | `Success. No rows returned` |
| 2 | `supabase/migrations/0002_recon.sql` | o Módulo 1: schema `recon`, 5 tabelas, 16 policies | `Success. No rows returned` |
| 3 | `supabase/migrations/0003_billing.sql` | a contabilidade de uso: `usage_ledger` | `Success. No rows returned` |
| 4 | `supabase/migrations/0004_marketing.sql` | o Módulo 2: schema `marketing`, 4 tabelas, 11 policies | `Success. No rows returned` |
| 5 | `supabase/migrations/0005_courier_cron.sql` | a saúde da fila (o agendador vem comentado) | `Success. No rows returned` |
| 6 | `supabase/seed/0001_platform.sql` | o catálogo: papéis, módulos `recon` e `marketing`, planos | `Success. No rows returned` |

### ⚠️ NÃO aplique a pasta `supabase/tests/`

`supabase/tests/00_supabase_shim.sql` recria um `auth` de mentirinha para testar num Postgres nu. **Aplicar isso num Supabase de verdade quebraria o `auth` de verdade.** Aquela pasta é só para o CI.

### Se der erro

Pare no arquivo que falhou e não siga em frente. O erro traz a linha. Copie a mensagem inteira e leve para o repositório como issue — não tente consertar no editor, porque a correção precisa voltar para o arquivo versionado, senão o próximo ambiente nasce diferente deste.

---

## PASSO 3 — Conferir que subiu

Cole isto no SQL Editor e rode. **É a mesma consulta que o CI roda.**

```sql
-- 1. As tabelas existem e a RLS está ligada e FORÇADA em todas?
select n.nspname                                              as schema,
       count(*)                                               as tabelas,
       count(*) filter (where c.relrowsecurity)               as rls_ligada,
       count(*) filter (where c.relforcerowsecurity)          as rls_forcada
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('core','recon','marketing') and c.relkind = 'r'
 group by 1 order by 1;
```

**Esperado — os três números iguais em cada linha:**

| schema | tabelas | rls_ligada | rls_forcada |
|---|---|---|---|
| core | 11 | 11 | 11 |
| marketing | 4 | 4 | 4 |
| recon | 5 | 5 | 5 |

```sql
-- 2. Alguma tabela com RLS ligada mas SEM policy nenhuma?
-- (Uma tabela assim está trancada — pode ser de propósito, ou pode ser bug.)
select n.nspname||'.'||c.relname as tabela,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('core','recon','marketing') and c.relkind = 'r'
 order by 2, 1;
```

**Esperado:** 47 policies no total. Exatamente **duas** tabelas com `0`: `core.event_outbox` e `core.processed_events` — são encanamento, trancadas de propósito.

⚠️ `marketing.spend_approvals` aparece com **1** policy, e só de leitura. É deliberado: aquela tabela é escrita pelo correio, com `service_role`. Se ela ganhar uma policy de INSERT, o cliente passa a poder aprovar a própria verba.

```sql
-- 3. O catálogo entrou?
select (select count(*) from core.roles            where tenant_id is null) as papeis_sistema,
       (select count(*) from core.role_permissions)                          as permissoes,
       (select count(*) from core.module_registry  where status='published') as modulos,
       (select count(*) from core.plan_limits)                               as limites,
       (select count(*) from core.tenants)                                   as tenants_deve_ser_zero,
       (select count(*) from auth.users)                                     as usuarios_deve_ser_zero;
```

**Esperado:** `2 · 14 · 2 · 12 · 0 · 0`

Os dois módulos publicados são `recon` e `marketing`; as 14 permissões incluem as 3 do Módulo 2.

Os dois últimos zeros são o ponto: **o seed é catálogo, não cliente.** Se aparecer tenant ou usuário aqui, alguém aplicou algo que não devia.

---

## PASSO 4 — CHECKLIST DE SEGURANÇA

Faça este passo **no mesmo dia**. É ele que separa este banco do `suna-core`, que nasceu com RLS aberta e virou P0.

### 🔴 No banco

- [ ] **RLS ligada e forçada em 20/20 tabelas** — consulta 1 do Passo 3, três colunas com o mesmo número.
- [ ] **Nada em `public`.** Rode:
  ```sql
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r';
  ```
  **Esperado: `0`.** O Business OS vive em `core` e `recon` de propósito — nada nasce exposto via API por padrão. Se aparecer tabela em `public`, alguém criou por fora e ela **está exposta**.
- [ ] **`anon` não tem nada.** Rode:
  ```sql
  select count(*) from information_schema.role_table_grants
   where grantee='anon' and table_schema in ('core','recon','marketing');
  ```
  **Esperado: `0`.** Ninguém lê o Business OS sem estar autenticado.
- [ ] **Nenhuma policy `USING (true)`.** Rode:
  ```sql
  select n.nspname||'.'||c.relname as tabela, p.polname
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('core','recon','marketing')
     and pg_get_expr(p.polqual, p.polrelid) = 'true';
  ```
  **Esperado: nenhuma linha.**
- [ ] **A trilha não se apaga.** Rode os três, um por vez. **Os três têm que dar erro** dizendo `append-only` — mesmo com a tabela ainda vazia:
  ```sql
  update core.audit_log set action = 'x';
  delete from core.audit_log;
  truncate core.audit_log;
  ```
  O `truncate` é o que mais importa: até a Etapa 3 os guardas eram *row-level* e o `truncate` **apagava a trilha inteira sem erro nenhum**. Se algum dos três funcionar, os triggers não subiram.

### 🔴 Nas chaves

- [ ] **`service_role key` só no servidor.** Nunca em `NEXT_PUBLIC_*`, nunca em componente de cliente, nunca commitada. Na Vercel, é variável de ambiente **sem** o prefixo `NEXT_PUBLIC_`.
- [ ] **A chave publicável (`anon`) é a única que pode ir ao navegador** — e, pelo item acima, ela não dá acesso a nada aqui.
- [ ] **Rotacione qualquer chave que tenha aparecido em print, chat, log ou histórico de terminal.** Uma chave vista é uma chave queimada.
- [ ] **Nenhuma chave neste repositório.** Ele é o registro público da obra; segredo mora no painel e no cofre.

### 🔴 No projeto

- [ ] **Backup / PITR ligado** antes de existir o primeiro dado real.
- [ ] **Acesso ao painel** só para quem precisa, com 2FA.
- [ ] **Anote a data do apply** e a versão das migrations aplicadas, em algum lugar que você reencontre.

---

## PASSO 5 — O QUE **NÃO** FAZER

- ❌ **Não crie tabela pelo editor de tabelas do painel.** Ela nasceria em `public`, exposta, sem RLS e fora do controle de versão. Toda mudança de schema é uma migration nova no repositório, revisada em PR.
- ❌ **Não edite `0001` nem `0002` — elas já foram aplicadas.** Arquivo aplicado é história. Corrigir no lugar faz o próximo ambiente nascer diferente da produção **sem ninguém perceber**, e o CI continua verde porque ele aplica do zero. Correção é migration nova: a próxima é `0004_*.sql`.
- ❌ **Não rode o seed com dado de cliente dentro.** Se precisar de um tenant de exemplo, é script descartável, fora do repositório.
- ❌ **Não desligue a RLS "só para testar".** É exatamente assim que o `suna-core` chegou onde chegou.

---

## PASSO 6 — LIGAR O CORREIO DO CORE

Sem o correio, todo evento emitido pelos módulos fica em `pending` para sempre — e, desde a Etapa 7, **dois módulos dependem disso**: é assim que a campanha fica sabendo da verba aprovada.

A partir da Etapa 8 existe tudo o que faltava: a persistência real, a composição que liga os consumidores, o endpoint e a visão de saúde. **Ligar continua sendo ato seu**, e são quatro passos.

> ⚠️ **Nada disto está no ar.** Este repositório não cria projeto, não faz deploy e não guarda segredo. O que segue é o roteiro para você fazer.

### 6.1 — Aplicar o `0005`

`supabase/migrations/0005_courier_cron.sql`, pelo SQL Editor, como os outros.

Ele cria **só a visão de saúde** (`core.courier_health` e `core.courier_status()`). O agendamento vem comentado dentro do arquivo, de propósito: um `cron.schedule` com URL falsa criaria um job que falha a cada minuto, para sempre.

Confira que subiu:

```sql
select * from core.courier_status();
```

Deve responder `OK` (ou `PARADO`, se já houver evento esperando — o que é a resposta certa, porque o correio ainda não está rodando).

### 6.2 — Subir o `apps/api`

É o servidor que entrega. Um processo Node, sem framework, com duas rotas.

| Variável | O que é |
|---|---|
| `DATABASE_URL` | a conexão do Postgres **com privilégio de serviço** — Supabase → Project Settings → Database → Connection string (URI) |
| `COURIER_SECRET` | um valor aleatório e longo que você gera (`openssl rand -hex 32`) |
| `PORT` | opcional, padrão 8080 |

```bash
pnpm --filter @alsham/api start
```

⛔ **Este app NÃO vai junto com o `apps/portal`.** A `DATABASE_URL` de serviço ignora toda a RLS: quem a tem enxerga todos os tenants. O painel do cliente fala com o banco pela chave publicável, sob RLS, e há guarda no CI para que a fronteira continue de pé.

Onde subir é sua escolha — qualquer lugar com HTTPS e IP de saída estável serve. O que **não** serve é o mesmo deploy do painel.

Confira que respondeu:

```bash
curl -s -H "x-correio-secret: $COURIER_SECRET" https://SEU-ENDPOINT/correio/saude
```

Sem o cabeçalho tem de dar **401**. Se der 200, pare: o endpoint está aberto.

### 6.3 — Guardar a URL e o segredo no Vault

No painel: **Database → Vault → Add new secret**. Dois segredos:

| Nome | Valor |
|---|---|
| `courier_url` | `https://SEU-ENDPOINT/correio/entregar` |
| `courier_secret` | o mesmo `COURIER_SECRET` do passo anterior |

⛔ **Não escreva esses valores dentro de uma migration.** Migration é arquivo deste repositório, que é o registro público da obra. É por isso que o `insert` no Vault não está no `0005`.

### 6.4 — Habilitar as extensões e agendar

Painel → **Database → Extensions** → ligar **`pg_cron`** e **`pg_net`**.

Depois, no SQL Editor, cole o bloco que está comentado no fim do `0005_courier_cron.sql` — ele agenda uma rodada por minuto lendo a URL e o segredo do Vault.

Para desligar a qualquer momento:

```sql
select cron.unschedule('correio-do-core');
```

---

### A alternativa: agendador externo, sem `pg_cron`

Se preferir não habilitar extensão nenhuma, o mesmo endpoint funciona chamado de fora — Vercel Cron, GitHub Actions, um cron de máquina. É um `POST` por minuto com o cabeçalho do segredo.

**Vantagem:** nada de novo no banco; o agendador fica onde você já tem observabilidade.
**Custo:** se o agendador externo cair, a fila para — e você descobre pela §6.5, não por um alarme.

**Não implementei as duas.** O `0005` traz o caminho do `pg_cron` porque é o padrão PROVADO da Casa (`casa-bonaparte-saas`) e porque roda dentro do banco: se a aplicação cair, a fila continua andando.

---

### 6.5 — Como conferir se está andando

**O número que importa não é quantos estão parados — é há quanto tempo o mais antigo espera.** Um `pending` alto depois de um pico é normal; um `pending` **velho** significa que o correio não está rodando.

```sql
select * from core.courier_status();
```

| Resposta | O que fazer |
|---|---|
| `OK` | nada |
| `ATRASADO` | o mais antigo passa de 10 min — o ciclo está engasgando |
| `PARADO` | passa de 30 min — o correio provavelmente não está rodando |
| `ATENCAO` | **há evento morto**. Conferência humana |

E o detalhe, por estado:

```sql
select * from core.courier_health order by status;
```

**Se aparecer `dead`:** um evento falhou todas as tentativas. A linha **continua na caixa, com o `last_error`** — desistir de entregar não é desistir de guardar. Veja o erro:

```sql
select event_id, event_type, attempts, last_error
  from core.event_outbox where status = 'dead' order by occurred_at desc;
```

⚠️ **O `pg_cron` não vai te avisar de erro.** `net.http_post` é assíncrono: o job dispara e não espera resposta. Se o endpoint responder 401 ou 500, o `cron.job_run_details` continua dizendo *success*. A conferência de verdade é a consulta acima — se o `pending` não cai, não está entregando, não importa o que o cron diga.

---

## O QUE AINDA NÃO EXISTE

Honestidade de escopo, para você não procurar o que não foi construído:

| Peça | Estado |
|---|---|
| Correio (`@alsham/workflow` + `apps/api`) | ✅ **CONSTRUÍDO, testado contra Postgres e LIGÁVEL** — o Passo 6 é o roteiro. **Não está no ar** |
| Consumidor de trilha (`core.audit_log`) | ✅ construído e inscrito na composição |
| Consumidor do Módulo 2 (verba da campanha) | ✅ construído e inscrito na composição |
| Telas (`apps/portal`) | ✅ construídas — login, quatro telas do Módulo 1 e a carteira de campanhas |
| Parser de OFX/CSV | ✅ construído em `@alsham/finance-reconciliation` |
| Visão de saúde da fila | ✅ construída — `core.courier_status()` e `core.courier_health` (§6.5) |
| Leitor de CAMT.053 | **NÃO CONSTRUÍDO** |
| Preço em reais e gateway de pagamento | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro |
| Instalador de módulo em runtime | **NÃO CONSTRUÍDO** — por isso o seed já põe as permissões no papel `admin`, e por isso a lista de consumidores é escrita à mão na composição |
| Alarme automático de fila parada | **NÃO CONSTRUÍDO** — a §6.5 é consulta, não notificação. Quem olha é você |
| Publicação real em canal (rede social, e-mail) | **NÃO CONSTRUÍDO** — "publicar" muda o estado e conta o fato |
| Deploy configurado neste repositório | **NÃO EXISTE** — não há `vercel.json`; publicar é ato do dono |

Aplicar este banco **não** põe o produto no ar. Põe a fundação no ar, provada e trancada — e, com o Passo 6, o Lego passa a conversar de verdade.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
