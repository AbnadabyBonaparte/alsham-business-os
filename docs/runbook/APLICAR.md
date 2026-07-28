# 🔧 RUNBOOK — APLICAR O BANCO DO BUSINESS OS

**Para quem:** o dono, aplicando pelo painel do Supabase. Não exige CLI.
**Quando:** uma vez, ao criar um projeto Supabase novo.
**Quanto tempo:** ~15 minutos, incluindo a conferência de segurança.

> **O que já foi provado antes de você chegar aqui:** estes arquivos foram aplicados de verdade num PostgreSQL 17 limpo, na ordem abaixo, e passaram num teste de isolamento com usuário real. O CI repete isso a cada mudança. **Não é para dar susto.**

---

## ⛔ LEIA ANTES: parte disto JÁ FOI APLICADO

O dono informou ter aplicado **`0001` a `0005` e o seed** num projeto Supabase de produção, com um tenant piloto — e, em **28/07/2026**, ter **ligado o correio**. **O repositório não verificou nada disso** — nenhum agente daqui conecta a banco com dado de cliente, e o registro fica assim, literalmente (Lei 7).

| Arquivo | Estado |
|---|---|
| `0001_core.sql` … `0006_install.sql` | **APLICADAS** — não editar |
| `seed/0001_platform.sql` | **APLICADO** — idempotente, pode rodar de novo sem estragar |
| `0007_ap.sql` | **ARQUIVO, ainda não aplicado** — o Módulo 3 (Contas a Pagar) |
| `0008_recon_ap_projection.sql` | **ARQUIVO, ainda não aplicado** — a porta pela qual o Módulo 1 recebe o título |

**Se o seu projeto já existe**, o passo 1 não é para você: pule para o **Passo 8**, que é o roteiro só do `0007` + `0008`.

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
| 6 | `supabase/migrations/0006_install.sql` | o instalador: `core.install_module` e `core.uninstall_module` | `Success. No rows returned` |
| 7 | `supabase/migrations/0007_ap.sql` | o Módulo 3: schema `ap`, 1 tabela, 3 policies | `Success. No rows returned` |
| 8 | `supabase/migrations/0008_recon_ap_projection.sql` | a porta pela qual o Módulo 1 recebe o título | `Success. No rows returned` |
| 9 | `supabase/seed/0001_platform.sql` | o catálogo: papéis, módulos `recon`, `marketing` e `ap`, planos | `Success. No rows returned` |

⚠️ **Num projeto NOVO, exponha os schemas na Data API antes de usar o portal:**
Project Settings → API → *Exposed schemas* → `core`, `recon`, `marketing`, `ap`.
Sem isso as telas carregam vazias, sem erro que diga o motivo (§8.0).

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

**Esperado:** `2 · 8 · 2 · 12 · 0 · 0`

⚠️ **Eram 14 permissões até a Etapa 8; agora são 8.** A diferença são as 6 permissões de módulo que o seed concedia ao papel de sistema `admin` — a ponte provisória que **saiu** quando o instalador nasceu. Quem concede agora é `core.install_module()`, num papel do tenant, quando alguém instala. O porquê está no §7.3.

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

Deve responder `OK` — ou `PARADO`, se houver evento esperando de antes de o job existir.

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

**O número que importa não é quantos estão parados — é há quanto tempo o mais antigo espera.** Um `pending` alto depois de um pico é normal; um `pending` **velho** significa que o correio parou.

```sql
select * from core.courier_status();
```

| Resposta | O que fazer |
|---|---|
| `OK` | nada |
| `ATRASADO` | o mais antigo passa de 10 min — o ciclo está engasgando |
| `PARADO` | passa de 30 min — o correio provavelmente parou |
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

## PASSO 7 — APLICAR O `0006` (o instalador) — ✅ **FEITO em 28/07/2026**

> ⚠️ **Este passo já foi executado.** O dono informou, em 28/07/2026, ter
> aplicado o `0006`, instalado os módulos pela Store (com o clique dele) e
> **executado a limpeza do §7.3** — a concessão global de permissão de módulo
> **não existe mais em produção**. ⚠️ **NÃO VERIFICADO** por este repositório.
>
> O texto abaixo continua valendo inteiro para o **próximo ambiente** —
> homologação, um segundo tenant, uma restauração. É por isso que ele descreve
> o zero, e não o meio.

Este passo é para o projeto que **já existe**. São três coisas: aplicar, conferir, e uma limpeza opcional que muda o comportamento.

### 7.1 — Aplicar

SQL Editor → cole `supabase/migrations/0006_install.sql` inteiro → **Run**.

Ele **não cria tabela nenhuma**. Cria três funções (`core.emit_event`, `core.install_module`, `core.uninstall_module`) e concede as duas últimas a `authenticated` — porque é o painel do cliente que instala, com a sessão dele. A permissão é conferida dentro da função, na primeira linha.

### 7.2 — Conferir

```sql
-- As funções existem?
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'core' and proname in ('install_module','uninstall_module','emit_event')
 order by 1;
```

**Esperado: três linhas.**

```sql
-- E ninguém instala sem permissão. Como service_role você NÃO tem
-- core.module.install (a permissão é de usuário, não de papel de banco),
-- então isto TEM de dar erro:
select core.install_module(
  (select id from core.tenants limit 1), 'recon', 'admin');
```

**Esperado: erro.** Se funcionar, pare — a checagem de permissão não subiu.

### 7.3 — ⚠️ A limpeza opcional, e o que ela muda

**Leia inteiro antes de rodar.**

Até esta etapa, o seed concedia as permissões de `recon` e `marketing` ao papel de **sistema** `admin`. Papel de sistema vale em **todo** tenant — então qualquer tenant novo com um usuário `admin` já nasce com os dois módulos, **sem instalar e sem ocupar vaga no plano**.

Com um tenant só, isso não aparece. Com o segundo, é o módulo inteiro de graça.

O bloco **saiu do seed**, mas tirar de lá **não apaga o que já está no banco**. Para fechar de verdade:

```sql
-- 1. Veja o que existe hoje (só confere, não muda nada):
select role_key, permission_key, module_id
  from core.role_permissions
 where tenant_id is null and module_id <> 'core'
 order by module_id, permission_key;

-- 2. Instale os módulos DE VERDADE no tenant que já os usa, num papel DELE.
--    Troque <TENANT> e <PAPEL> — o papel precisa existir e ser do tenant.
--    Rode como o usuário dono, pelo painel da Store, ou aqui com um papel que
--    tenha core.module.install.
-- select core.install_module('<TENANT>'::uuid, 'recon',     '<PAPEL>');
-- select core.install_module('<TENANT>'::uuid, 'marketing', '<PAPEL>');

-- 3. SÓ DEPOIS de conferir que o tenant continua enxergando tudo,
--    remova a concessão global:
-- delete from core.role_permissions
--  where tenant_id is null and module_id in ('recon','marketing');
```

⛔ **Não rode o passo 3 antes do 2.** Entre um e outro, quem depende da concessão global perde o acesso — os dados continuam intactos, mas as telas ficam vazias até a instalação existir.

**Se você preferir não mexer agora**, não mexa: o vazamento só tem consequência quando existir um segundo tenant. Fica registrado aqui para ser decisão, não descuido.

---

## PASSO 8 — APLICAR O `0007` + `0008` (o Módulo 3 e o triângulo)

Este é o passo da **Etapa 10**, e o único que ainda falta. São **duas**
migrations, e a ordem importa.

### 8.0 — ⚠️ ANTES DE TUDO: EXPOR O SCHEMA `ap` NA DATA API

**Faça isto ANTES de aplicar, ou faça logo depois — mas faça.** É a lição paga
na Etapa 9 com o schema do `marketing`, e o sintoma é traiçoeiro: as telas
carregam **vazias**, sem erro de permissão, sem erro de rede, sem nada no log
que diga o motivo. O Supabase simplesmente não expõe um schema que não está na
lista.

> Painel do Supabase → **Project Settings → API → Exposed schemas** →
> acrescente **`ap`** à lista (que já deve conter `core`, `recon`, `marketing`)
> → **Save**.

O `recon` já está exposto, então a projeção do §8.3 não pede nada novo.

Confira depois de aplicar, com a chave publicável:

```
curl -s "https://<PROJETO>.supabase.co/rest/v1/payables?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Accept-Profile: ap"
```

**Esperado:** `[]` (lista vazia — você não está autenticado, a RLS barra tudo).
**Se vier** `{"message":"The schema must be one of the following: ..."}`, o
schema não foi exposto. Volte ao painel.

### 8.1 — Aplicar o `0007_ap.sql`

SQL Editor → cole `supabase/migrations/0007_ap.sql` inteiro → **Run**.

Cria o schema `ap`, **uma** tabela (`ap.payables`), a porta de saída
(`ap.emit_event`), a tabela de transições (`ap.allowed_transition`) e os
gatilhos que emitem os três eventos.

⛔ Repare no que ele **não** cria: nenhuma policy de DELETE e nenhum GRANT de
DELETE. **Cancelar é estado, nunca apagar** — título apagado é conta paga sem
documento.

### 8.2 — Aplicar o `0008_recon_ap_projection.sql`

SQL Editor → cole `supabase/migrations/0008_recon_ap_projection.sql` inteiro →
**Run**.

⚠️ **Depois do `0007`, nunca antes** — ela é a porta pela qual o Módulo 1 recebe
o título, e faz sentido só quando existe quem emita.

Ela **não cria coluna nem tabela**. `recon.payables` já nasceu na Etapa 2 com
`source = 'event'` e `source_module_id`, esperando exatamente isto. A migration
só abre a porta de escrita que faltava, e a concede **apenas** ao correio —
`authenticated` não a executa.

### 8.3 — Reaplicar o seed

```
supabase/seed/0001_platform.sql
```

⚠️ **Reaplicar agora NÃO é opcional**, e o motivo é novo: além de registrar o
módulo `ap` no catálogo, o seed **atualiza a linha do `recon`**, que passou a
declarar que escuta `ap.*`.

⚠️ **E o seed mudou de comportamento nesta etapa:** os blocos do catálogo eram
`on conflict do nothing` e agora são `do update`. Sem isso, reaplicar não faria
nada e a Store exibiria o catálogo antigo **para sempre**, sem erro nenhum.

**Consequência que você precisa saber:** se você editou o `core.module_registry`
à mão no banco (mudou um `status` para `deprecated`, por exemplo), **a
reaplicação desfaz a edição**. É o preço de ter uma fonte só. Depreciar um
módulo se faz mudando o arquivo do seed.

### 8.4 — Conferir

```sql
-- 1. O schema subiu, com RLS ligada E forçada.
select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forcada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'ap' and c.relkind = 'r';
```
**Esperado:** `payables | t | t`.

```sql
-- 2. ⛔ Nenhuma porta de DELETE. As duas camadas.
-- ⚠️ Filtre o grantee: o DONO da tabela sempre tem DELETE, implicitamente e
-- sem como tirar. A regra é que o CLIENTE não tem porta de DELETE.
select count(*) as grants_de_delete from information_schema.role_table_grants
 where table_schema = 'ap' and privilege_type = 'DELETE'
   and grantee in ('anon','authenticated','PUBLIC');
select count(*) as policies_de_delete from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'ap' and p.polcmd = 'd';
```
**Esperado: zero nos dois.** Se vier qualquer coisa maior, pare.

```sql
-- 3. A porta de projeção existe e NÃO é do cliente.
select has_function_privilege('authenticated',
  'recon.record_external_payable(uuid,text,text,date,bigint,char,text,bigint,text,text,text)',
  'execute') as cliente_pode_projetar;
```
**Esperado: `f`.** Se vier `t`, o cliente pode inventar um título "vindo de
outro módulo", com origem forjada por dentro da RLS. Pare e revogue.

```sql
-- 4. O catálogo conta a história certa.
select module_id, status,
       jsonb_array_length(events_emits)    as emite,
       jsonb_array_length(events_consumes) as consome
  from core.module_registry order by module_id;
```
**Esperado:**

| module_id | status | emite | consome |
|---|---|---|---|
| `ap` | published | 3 | 0 |
| `marketing` | published | 3 | 1 |
| `recon` | published | 3 | 3 |

Se `recon` vier com `consome = 0`, o seed não foi reaplicado (ou foi reaplicado
antes de a versão nova entrar).

```sql
-- 5. E o seed continua sem conceder permissão de módulo a papel de sistema.
select count(*) from core.role_permissions
 where tenant_id is null and module_id <> 'core';
```
**Esperado: zero.** É a limpeza do §7.3, que precisa continuar valendo.

### 8.5 — Instalar o módulo no tenant

O módulo aparece na Store assim que o seed é reaplicado, mas **ninguém o tem até
alguém instalar**. Pelo painel: **Store → Contas a Pagar → Instalar**, escolhendo
um papel **DO TENANT**.

Papel de sistema é recusado, e é de propósito: ele vale em todos os tenants e
faria o módulo vazar para quem não o contratou.

Depois de instalar, o item **Contas a pagar** aparece no menu do portal — ele só
existe para quem tem `ap.payable.manage` ou `ap.payable.cancel`.

### 8.6 — ⭐ A prova de que o triângulo está vivo

Registre um título pela tela. Um minuto depois (o correio roda de 1 em 1
minuto):

```sql
-- O fato saiu e foi entregue?
select event_type, produced_by, status, attempts
  from core.event_outbox
 where event_type like 'ap.%'
 order by occurred_at desc limit 5;
```
**Esperado:** `ap.payable.registered | ap | delivered`.

```sql
-- E chegou do outro lado, com a origem do envelope?
select external_ref, source, source_module_id, amount_cents, status
  from recon.payables
 where source = 'event'
 order by created_at desc limit 5;
```
**Esperado:** a linha do título que você acabou de registrar, com
`source = event` e `source_module_id = ap` — **sem ninguém ter redigitado
nada**, e sem que nenhum dos dois módulos conheça o outro.

Se o evento estiver `pending` com `attempts = 0` há mais de dois minutos, o
correio parou: veja o §6.5.

Se estiver `delivered` mas a linha não apareceu no `recon`, o consumidor rodou e
ignorou o evento — quase sempre porque o módulo do outro lado não está
instalado, ou porque já existia um título com aquela referência marcado
`source = 'imported'` (a projeção **não sobrescreve** o que uma pessoa digitou).

---

## O QUE AINDA NÃO EXISTE

Honestidade de escopo, para você não procurar o que não foi construído:

| Peça | Estado |
|---|---|
| Correio (`@alsham/workflow` + `apps/api`) | ✅ **NO AR desde 28/07/2026** — job de 1 em 1 minuto (informado pelo dono; **NÃO VERIFICADO** aqui) |
| Instalador de módulo em runtime | ✅ **CONSTRUÍDO e APLICADO** (`0006_install.sql`) — em 28/07/2026, informado pelo dono (⚠️ NÃO VERIFICADO aqui) |
| Store (vitrine + instalar/desinstalar) | ✅ construída em `apps/portal/src/app/store/` |
| Consumidor de trilha (`core.audit_log`) | ✅ construído e inscrito na composição |
| Consumidor do Módulo 2 (verba da campanha) | ✅ construído e inscrito na composição |
| Módulo 3 — Contas a Pagar (`0007_ap.sql`) | ✅ **CONSTRUÍDO** — arquivo, ainda não aplicado (§8) |
| Consumidor do Módulo 1 (título vindo de outro módulo) | ✅ construído e inscrito na composição — fecha o triângulo |
| Registro de liquidação e estorno **pela tela** | **NÃO CONSTRUÍDO** — o ciclo de vida aceita os dois e é provado; o botão é etapa própria |
| Pagamento de verdade (remessa, integração bancária) | **NÃO CONSTRUÍDO**, e é Lei 3: integra-se, não se constrói |
| Telas (`apps/portal`) | ✅ construídas — login, quatro telas do Módulo 1 e a carteira de campanhas |
| Parser de OFX/CSV | ✅ construído em `@alsham/finance-reconciliation` |
| Visão de saúde da fila | ✅ construída — `core.courier_status()` e `core.courier_health` (§6.5) |
| Leitor de CAMT.053 | **NÃO CONSTRUÍDO** |
| Preço em reais e gateway de pagamento | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro |
| Instalação automática de CONSUMIDOR de evento | **NÃO CONSTRUÍDA** — instalar dá acesso e permissões; o handler é código, inscrito à mão na composição. Não há plugin dinâmico |
| Alarme automático de fila parada | **NÃO CONSTRUÍDO** — a §6.5 é consulta, não notificação. Quem olha é você |
| Publicação real em canal (rede social, e-mail) | **NÃO CONSTRUÍDO** — "publicar" muda o estado e conta o fato |
| Deploy configurado neste repositório | **NÃO EXISTE** — não há `vercel.json`; publicar é ato do dono |

Aplicar este banco **não** põe o produto no ar. Põe a fundação no ar, provada e trancada — e, com o Passo 6, o Lego passa a conversar de verdade.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
