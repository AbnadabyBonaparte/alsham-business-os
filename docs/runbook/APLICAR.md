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
| `0007_ap.sql` · `0008_recon_ap_projection.sql` | **APLICADAS** em 28/07/2026 — não editar |
| `0009_crm.sql` | **APLICADA** em 28/07/2026 — não editar |
| `0010_ar.sql` … `0014_ap_apply_recon_match.sql` | ✅ **APLICADAS em produção** em 29/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |

**Se o seu projeto já existe**, o passo 1 não é para você: pule para o **Passo 10**, que é o roteiro só do `0010`.

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
| 9 | `supabase/migrations/0009_crm.sql` | o Módulo 4: schema `crm`, 2 tabelas, 4 policies | `Success. No rows returned` |
| 10 | `supabase/migrations/0010_ar.sql` | o Módulo 5: schema `ar`, 1 tabela, 3 policies | `Success. No rows returned` |
| 11 | `supabase/seed/0001_platform.sql` | o catálogo: papéis, os cinco módulos, planos | `Success. No rows returned` |

⚠️ **Num projeto NOVO, exponha os schemas na Data API antes de usar o portal:**
Project Settings → API → *Exposed schemas* → `core`, `recon`, `marketing`, `ap`, `crm`, `ar`.
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

## PASSO 8 — APLICAR O `0007` + `0008` (o Módulo 3 e o triângulo) — ✅ **FEITO em 28/07/2026**

> ⚠️ **Este passo já foi executado.** O dono informou ter aplicado `0007` e
> `0008`, reaplicado o seed, instalado o módulo `ap` no tenant piloto **pela
> Store** e registrado o primeiro título real, cujo `ap.payable.registered` foi
> **emitido e entregue** pelo correio. ⚠️ **NÃO VERIFICADO** por este
> repositório.
>
> ⚠️ **A projeção no `recon` ainda não aconteceu em produção, e o motivo é de
> INFRAESTRUTURA, não de código:** o host do `apps/api` ainda roda o build
> anterior ao consumidor novo. **Falta o redeploy do `apps/api`, que é ato do
> dono.** Assim que ele subir, o correio reentrega — a caixa de saída guarda o
> evento, e é exatamente para isso que ela existe. Nada precisa ser corrigido
> aqui: o teste do triângulo no CI é a prova que vale, e ele está verde.
>
> O texto abaixo continua valendo inteiro para o **próximo ambiente**.

São **duas** migrations, e a ordem importa.

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

## PASSO 9 — APLICAR O `0009` (o Módulo 4, Relacionamentos) — ✅ **FEITO em 28/07/2026**

> ⚠️ **Este passo já foi executado.** O dono informou ter aplicado `0009` e
> reaplicado o seed com os quatro módulos. ⚠️ **NÃO VERIFICADO** por este
> repositório.
>
> ⚠️ **Pendências de infraestrutura que continuam com o dono** (não são deste
> repositório e nada aqui as conserta): o **redeploy do `apps/api`** no host, a
> **exposição do schema `crm`** na Data API, e a **instalação do módulo `crm`**
> pela Store.
>
> O texto abaixo continua valendo inteiro para o **próximo ambiente**.

Uma migration só.

### 9.0 — ⚠️ ANTES DE TUDO: EXPOR O SCHEMA `crm` NA DATA API

**Terceira vez que este aviso aparece, e é o mesmo aviso.** É a lição paga na
Etapa 9 com o `marketing` e repetida na 10 com o `ap`. O sintoma é traiçoeiro:
as telas carregam **vazias**, sem erro de permissão, sem erro de rede, sem nada
no log que diga o motivo.

> Painel do Supabase → **Project Settings → API → Exposed schemas** →
> acrescente **`crm`** à lista (que já deve conter `core`, `recon`, `marketing`,
> `ap`) → **Save**.

Confira depois de aplicar, com a chave publicável:

```
curl -s "https://<PROJETO>.supabase.co/rest/v1/parties?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Accept-Profile: crm"
```

**Esperado:** `[]` (lista vazia — você não está autenticado, a RLS barra tudo).
**Se vier** `{"message":"The schema must be one of the following: ..."}`, o
schema não foi exposto. Volte ao painel.

### 9.1 — Aplicar o `0009_crm.sql`

SQL Editor → cole `supabase/migrations/0009_crm.sql` inteiro → **Run**.

Cria o schema `crm`, **duas** tabelas (`parties` e `interactions`), a porta de
saída (`crm.emit_event`), a tabela de transições e os gatilhos que emitem os
quatro eventos.

⛔ Repare no que ele **não** cria: nenhuma policy de DELETE em tabela nenhuma, e
nenhuma policy de UPDATE em `interactions`. **Arquivar é estado, nunca apagar**;
**interação é fato consumado e não se edita.**

### 9.2 — Reaplicar o seed

```
supabase/seed/0001_platform.sql
```

É ele que põe o **4º cartão** na Store. O seed continua idempotente e continua
`do update` no catálogo — reaplicá-lo traz as quatro linhas para a verdade dos
manifestos, e desfaz edição feita à mão no `core.module_registry`.

### 9.3 — Conferir

```sql
-- 1. As duas tabelas subiram, com RLS ligada E forçada.
select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forcada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'crm' and c.relkind = 'r' order by 1;
```
**Esperado:** `interactions | t | t` e `parties | t | t`.

```sql
-- 2. ⛔ A interação é imutável. Filtre o grantee: o DONO da tabela sempre tem
--    tudo, implicitamente. A regra é que o CLIENTE não tem a porta.
select coalesce(string_agg(privilege_type, ','), 'nenhum') as portas_de_escrita
  from information_schema.role_table_grants
 where table_schema='crm' and table_name='interactions'
   and privilege_type in ('UPDATE','DELETE')
   and grantee in ('anon','authenticated','PUBLIC');
```
**Esperado: `nenhum`.** Se vier qualquer coisa, pare.

```sql
-- 3. E a terceira camada, que protege de nós mesmos:
select tgname from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='crm' and c.relname='interactions' and not t.tgisinternal;
```
**Esperado:** entre eles, `interactions_immutable`.

```sql
-- 4. O catálogo tem QUATRO cartões, e o novo consome ZERO.
select module_id, status,
       jsonb_array_length(events_emits)    as emite,
       jsonb_array_length(events_consumes) as consome
  from core.module_registry order by module_id;
```
**Esperado:**

| module_id | status | emite | consome |
|---|---|---|---|
| `ap` | published | 3 | 0 |
| `crm` | published | 4 | 0 |
| `marketing` | published | 3 | 1 |
| `recon` | published | 3 | 3 |

Se `crm` não aparecer, o seed não foi reaplicado.

```sql
-- 5. E o seed continua sem conceder permissão de módulo a papel de sistema.
select count(*) from core.role_permissions
 where tenant_id is null and module_id <> 'core';
```
**Esperado: zero.**

### 9.4 — Instalar o módulo no tenant

**Store → Relacionamentos → Instalar**, escolhendo um papel **DO TENANT**.

Depois de instalar, o item **Relacionamentos** aparece no menu do portal — ele
só existe para quem tem alguma das três permissões `crm.*`.

### 9.5 — A prova de que está vivo

Cadastre uma contraparte pela tela e registre um contato. Depois:

```sql
select event_type, produced_by, status
  from core.event_outbox
 where event_type like 'crm.%'
 order by occurred_at desc limit 5;
```
**Esperado:** `crm.party.registered` e `crm.interaction.registered`, os dois com
`produced_by = crm`, e `delivered` depois de um minuto (o correio roda de 1 em 1
minuto).

⚠️ **`delivered` aqui significa "a trilha registrou".** Nenhum módulo escuta
`crm.*` — `events_consumes` do CRM é vazio e nenhum outro módulo o declara. É o
esperado: o módulo funciona inteiro sozinho, e quem quiser reagir aos fatos dele
constrói o handler primeiro (Lei 7).

---

## PASSO 10 — APLICAR O `0010` (o Módulo 5, Contas a Receber)

Este é o passo da **Etapa 12**, e o único que ainda falta. Uma migration só.

### 10.0 — ⚠️ ANTES DE TUDO: EXPOR O SCHEMA `ar` NA DATA API

**Quarta vez que este aviso aparece, e é o mesmo aviso.** Lição paga na Etapa 9
com o `marketing`, repetida na 10 com o `ap` e na 11 com o `crm`. O sintoma é
traiçoeiro: as telas carregam **vazias**, sem erro de permissão, sem erro de
rede, sem nada no log que diga o motivo.

> Painel do Supabase → **Project Settings → API → Exposed schemas** →
> acrescente **`ar`** à lista (que já deve conter `core`, `recon`, `marketing`,
> `ap`, `crm`) → **Save**.

Confira depois de aplicar, com a chave publicável:

```
curl -s "https://<PROJETO>.supabase.co/rest/v1/receivables?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Accept-Profile: ar"
```

**Esperado:** `[]` (lista vazia — você não está autenticado, a RLS barra tudo).
**Se vier** `{"message":"The schema must be one of the following: ..."}`, o
schema não foi exposto. Volte ao painel.

### 10.1 — Aplicar o `0010_ar.sql`

SQL Editor → cole `supabase/migrations/0010_ar.sql` inteiro → **Run**.

Cria o schema `ar`, **uma** tabela (`ar.receivables`), a porta de saída
(`ar.emit_event`), a tabela de transições e os gatilhos que emitem os três
eventos.

⛔ Repare no que ele **não** cria: nenhuma policy de DELETE e nenhum GRANT de
DELETE. **Cancelar é estado, nunca apagar.**

⭐ **E repare no que ele deliberadamente NÃO tem:** a constraint de "não receber
a maior". O `ap` tem `payables_no_overpay`; aqui a ausência é decisão, e está
explicada no §2.1 do próprio arquivo. Se você comparar os dois e achar que
faltou alguma coisa, leia aquele bloco antes de "consertar".

### 10.2 — Reaplicar o seed

```
supabase/seed/0001_platform.sql
```

É ele que põe o **5º cartão** na Store. Continua idempotente e continua
`do update` no catálogo.

### 10.3 — Conferir

```sql
-- 1. A tabela subiu, com RLS ligada E forçada.
select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forcada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'ar' and c.relkind = 'r';
```
**Esperado:** `receivables | t | t`.

```sql
-- 2. ⛔ Nenhuma porta de DELETE para o CLIENTE. (O dono da tabela sempre tem,
--    implicitamente e sem como tirar — por isso o filtro de grantee.)
select count(*) as grants_de_delete from information_schema.role_table_grants
 where table_schema = 'ar' and privilege_type = 'DELETE'
   and grantee in ('anon','authenticated','PUBLIC');
```
**Esperado: zero.**

```sql
-- 3. ⭐ A DIVERGÊNCIA DO ESPELHO, conferida nos dois lados de uma vez.
select
  (select count(*) from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
    where n.nspname='ap' and c.conname='payables_no_overpay')          as ap_recusa_pagar_a_maior,
  (select count(*) from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
    where n.nspname='ar'
      and pg_get_constraintdef(c.oid) ilike '%received_amount_cents <= amount_cents%')
                                                                       as ar_recusa_receber_a_maior;
```
**Esperado: `1` e `0`.** Se vier `1` e `1`, alguém "consertou o `ar` por
simetria" e quebrou a decisão — ver `MODULO-AR-SPEC §3`.

```sql
-- 4. O catálogo tem CINCO cartões, e o novo consome ZERO.
select module_id, status,
       jsonb_array_length(events_emits)    as emite,
       jsonb_array_length(events_consumes) as consome
  from core.module_registry order by module_id;
```
**Esperado:**

| module_id | status | emite | consome |
|---|---|---|---|
| `ap` | published | 3 | 0 |
| `ar` | published | 3 | 0 |
| `crm` | published | 4 | 0 |
| `marketing` | published | 3 | 1 |
| `recon` | published | 3 | 3 |

⚠️ **`ar` com `consome = 0` é o esperado, e não é um esquecimento.** A
conciliação de recebimentos exigiria mudar o motor do Módulo 1, que hoje recusa
linha de crédito. Ver `MODULO-AR-SPEC §2.3`.

```sql
-- 5. E o seed continua sem conceder permissão de módulo a papel de sistema.
select count(*) from core.role_permissions
 where tenant_id is null and module_id <> 'core';
```
**Esperado: zero.**

### 10.4 — Instalar o módulo no tenant

**Store → Contas a Receber → Instalar**, escolhendo um papel **DO TENANT**.

Depois de instalar, o item **Contas a receber** aparece no menu do portal — ele
só existe para quem tem `ar.receivable.manage` ou `ar.receivable.cancel`.

### 10.5 — A prova de que está vivo

Registre um título pela tela. Depois:

```sql
select event_type, produced_by, status
  from core.event_outbox
 where event_type like 'ar.%'
 order by occurred_at desc limit 5;
```
**Esperado:** `ar.receivable.registered | ar | delivered` depois de um minuto.

⚠️ **`delivered` aqui significa "a trilha registrou".** Nenhum módulo escuta
`ar.*` — é o esperado, e está explicado acima.

### 10.6 — ⭐ Um teste de mesa que vale a pena fazer uma vez

Registre um título de 250,00 e edite o recebido para 253,00 (pelo SQL Editor, já
que o registro de recebimento **pela tela ainda não existe** — ver
`MODULO-AR-SPEC §5`):

```sql
update ar.receivables
   set received_amount_cents = 25300, status = 'received'
 where external_ref = '<a sua referência>';
```

**Esperado: passa**, e a tela mostra o selo *"recebido a maior"* com a
explicação. Se você tentar o equivalente no `ap`, o banco recusa. É a
divergência do módulo, e vê-la funcionando uma vez vale mais do que lê-la.

---

## 11. Aplicar o Módulo 6 — Compras (`0017_po.sql`)

Ordem (depois de `0010`–`0014` se ainda não aplicados):

1. `0017_po.sql`
2. Reaplicar `seed/0001_platform.sql` (idempotente — atualiza o 6º cartão)
3. **Expor o schema `po` na Data API** (Project Settings → API → Exposed schemas)
4. Instalar **Compras (Pedidos)** pela Store no tenant
5. Conferir menu `/compras` e permissões `po.order.*`

Nenhum agente aplica em produção. Integração pedido recebido → Contas a Pagar
continua **NÃO CONSTRUÍDA** (`MODULO-PO-SPEC §2.3`).
## PASSO 12 — `0018_ops.sql` (Etapa 13, Módulo 7: Esteira de Produção)

⚠️ **Só depois do Passo 10.** A migration `0011` supõe `0001`→`0010` aplicadas.

### 12.0 — ⛔ ANTES DE TUDO: EXPOR O SCHEMA `ops` NA DATA API

**Quinta vez que este aviso aparece, e ele continua sendo a lição mais cara do
repositório.** Sem isto a tela da esteira carrega **vazia, sem erro nenhum** — e
você vai procurar o defeito no código.

`Project Settings → API → Exposed schemas` → acrescente **`ops`** à lista.

Faça **antes** de aplicar. Reaplicar o SQL não conserta a exposição.

### 12.1 — Aplicar

No **SQL Editor** do projeto, cole o conteúdo de
`supabase/migrations/0018_ops.sql` inteiro e execute.

**Esperado:** `Success. No rows returned.` — cinco tabelas, treze policies,
quinze funções e dez gatilhos no schema `ops`. (Números contados no banco de
prova em 28/07/2026.)

### 12.2 — Reaplicar o seed

O catálogo ganhou o **sexto cartão**. Cole `supabase/seed/0001_platform.sql` e
execute de novo.

⚠️ Lembrete permanente: os blocos de `core.module_registry` são
`on conflict do update`. **Reaplicar o seed desfaz edição feita à mão no
catálogo** — e é assim que se quer.

```sql
select module_id, name, status from core.module_registry order by module_id;
```
**Esperado:** seis linhas, todas `published`.

### 12.3 — Conferência de segurança

```sql
select c.relname,
       c.relrowsecurity  as rls_ligada,
       c.relforcerowsecurity as rls_forcada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'ops' and c.relkind = 'r'
 order by 1;
```
**Esperado:** cinco linhas, `true` nas duas colunas em todas.

```sql
-- Só a ETAPA tem porta de DELETE, e é decisão: redesenhar a esteira é
-- tentativa e erro. As outras quatro tabelas não têm.
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'ops' and privilege_type = 'DELETE'
   and grantee in ('anon','authenticated','PUBLIC');
```
**Esperado:** **uma** linha — `pipeline_stages | DELETE`.

### 12.4 — Instalar o módulo no tenant, **pela Store**

Como nos anteriores: entre no portal como dono, abra **Store**, e instale
**Esteira de Produção**. É `core.install_module()` que concede as três
permissões, num papel **do tenant**.

⛔ **Nunca conceda `ops.*` por SQL direto.** Permissão de módulo concedida à mão
não é revogada ao desinstalar.

### 12.5 — ⭐ O primeiro desenho é SEU

Abra **Esteiras** e desenhe a primeira. **Não semeamos nenhuma de propósito** —
sugerir uma seria opinar sobre como a sua empresa trabalha.

Marque *exige aprovação* nas etapas em que alguém precisa decidir para o
trabalho seguir, e *pode ser pulada* nas que nem sempre se aplicam. As duas
marcas são mecânicas, não decorativas:

- passar de uma etapa marcada como aprovação **exige `ops.order.decide`**;
- pular uma etapa **exige a razão**, e ela fica na trilha para sempre.

### 12.6 — Conferir o fato na caixa de saída

Abra uma OS e avance uma etapa. Depois:

```sql
select event_type, produced_by, status, payload ->> 'stageName' as etapa
  from core.event_outbox
 where event_type like 'ops.%'
 order by occurred_at desc limit 5;
```
**Esperado:** `ops.order.opened` e `ops.stage.advanced`, produzidos por `ops`, e
o payload trazendo o **nome** da etapa — não só o id.

⚠️ `delivered` aqui significa "a trilha registrou". Nenhum módulo escuta `ops.*`
— é o esperado, e está declarado em `MODULO-OPS-SPEC §4.1`.

### 12.7 — ⭐ O teste de mesa que vale a pena fazer uma vez

Pule uma etapa pulável e escreva a razão. Depois:

```sql
select kind, from_stage_name, to_stage_name, note
  from ops.order_events
 where kind = 'skipped'
 order by occurred_at desc limit 1;
```

**Esperado:** a linha existe, com o nome das duas etapas e a sua razão. Agora
**apague a etapa pulada** em Esteiras e rode a consulta de novo: **a linha
continua lá, com o nome**. É a decisão do `0011` sobre o nome carimbado
funcionando — e vê-la funcionando uma vez vale mais do que lê-la.

---

## PASSO 13 — A FORJA (Etapa 14): `0019_forge.sql` + `0020_ops_machine_draft.sql`

O motor plugado na esteira. O operador pede a geração numa etapa; o resultado
entra como **versão de entregável marcada como rascunho de máquina**; e a
pessoa decide.

### 13.0 — ⛔ ANTES DE TUDO

O `0019` cria objetos no schema **`core`**, que já está exposto na Data API.
**Não há schema novo para expor nesta etapa** — a forja é Core, não módulo, e
por isso também **não aparece na Store**: qualquer módulo pede geração sem
precisar instalá-la.

### 13.1 — Aplicar

```
supabase/migrations/0019_forge.sql
supabase/migrations/0020_ops_machine_draft.sql
```

Nesta ordem. O `0020` é a migration **do módulo** `ops` (a coluna `origin` do
entregável), separada da do Core pelo mesmo motivo que a projeção do recon
viveu no `0008` e não no `0007`.

### 13.2 — As variáveis novas, no host do `apps/api`

⚖️ **LEI DO MOTOR:** o nome do fornecedor pode existir aqui e no
`.env.example`. Ele **não pode existir** em nenhuma tela, rótulo, toast,
e-mail ou resposta de API que o cliente leia — lá o que existe é o **motor
ALSHAM**. Há guarda de CI sobre isso, e ela foi sabotada de três formas antes
de entrar.

| Variável | Onde | O que é |
|---|---|---|
| `FORGE_SECRET` | **`apps/api` e `apps/portal`** | o segredo do endpoint da forja. **Próprio**, separado do `COURIER_SECRET`: quem pede geração não precisa poder acionar o correio. Gere com `openssl rand -hex 32`. |
| `ALSHAM_API_URL` | `apps/portal` | a URL do `apps/api` publicado. |
| `ALSHAM_TEXT_API_KEY` | `apps/api` | a chave do motor de texto. |
| `ALSHAM_TEXT_ENDPOINT` | `apps/api` | o endpoint do motor de texto. |
| `ALSHAM_TEXT_MODEL` | `apps/api` | o modelo a executar. Configuração de engenharia. |
| `ALSHAM_IMAGE_API_KEY` | `apps/api` | a chave do motor de arte. |
| `ALSHAM_IMAGE_ENDPOINT` | `apps/api` | o endpoint do motor de arte. |
| `ALSHAM_FORGE_DEMO` | `apps/api` | `true` liga o **modo demonstração**. |

⛔ **Nenhuma delas tem prefixo `NEXT_PUBLIC_`, e nenhuma pode ganhar.** O
prefixo é o que faz um segredo virar parte do bundle que o navegador baixa.

⛔ **No Vault (Supabase → Settings → Vault) ou no cofre do host:** `FORGE_SECRET`,
`ALSHAM_TEXT_API_KEY`, `ALSHAM_IMAGE_API_KEY`. As demais são configuração, não
segredo — mas o endpoint do fornecedor revela quem ele é, então trate-o com o
mesmo cuidado.

### 13.3 — ⭐ SEM MEDIÇÃO, SEM GERAÇÃO

O botão de gerar **não aparece** enquanto o plano do tenant não tiver teto
declarado para a métrica `ai-generations-per-month`. Não é um botão desativado:
é a seção inteira explicando o motivo.

É de propósito, e é a regra que impede o produto de queimar dinheiro sem saber
— uma geração que não vira linha no `usage_ledger` é custo invisível. A cadeia
inteira depende de `checkLimit()` **negar por omissão**.

O seed já traz a métrica nos planos do catálogo. Confira:

```sql
select plan_code, metric, limit_value, on_exceed
  from core.plan_limits
 where metric = 'ai-generations-per-month'
 order by plan_code;
```

⚠️ **Os tetos do seed são NÃO VERIFICADOS** — nasceram como número de catálogo,
não medido em operação. Ajuste-os quando tiver consumo real para olhar.

### 13.4 — Sem chave, o estado é HONESTO

Suba o `apps/api` **sem** as chaves e abra uma OS. A seção de geração diz, com
todas as letras, que a geração não está configurada neste ambiente, e aponta
para esta seção do runbook. **Ela nunca finge.**

Com `ALSHAM_FORGE_DEMO=true`, ela gera um exemplo fixo, **com o selo de
demonstração na tela**, e não desconta nada do plano — a linha nasce com
`is_mock` e a medição é pulada. É o padrão minerado do `usage_ledger` do
kraken-v2: consumo de laboratório não contamina o número que se cobra.

### 13.5 — Conferir o fato

```sql
select event_type, payload->>'kind', payload->>'metric', payload->>'promptLength'
  from core.event_outbox
 where event_type like 'core.generation.%'
 order by occurred_at desc limit 3;
```

**Esperado:** `core.generation.requested` e `core.generation.completed`, com o
tamanho do prompt — **e nunca o prompt**. O que a marca proíbe, o que o
operador pediu e qual adaptador respondeu **não saem no envelope**, e é decisão
de canon escrita no cabeçalho do `0019`.

---

## PASSO 14 — O PAINEL EXECUTIVO (Etapa 15): `0021_tenant_panel.sql`

A home do tenant logado. **Nenhum número decorativo:** cada um sai de um
`count()` do banco ou de uma linha de `core.plan_limits`.

### 14.1 — Aplicar

```
supabase/migrations/0021_tenant_panel.sql
```

Nenhuma tabela nova. O Painel **lê**; ele não guarda nada. Um painel com tabela
própria é um painel que precisa ser mantido em dia com a verdade, e a verdade
já está nas outras.

### 14.2 — ⭐ A decisão que este arquivo carrega

O Painel mostra a **saúde do correio ao vivo**. A função que a responde
(`core.courier_status()`, da Etapa 8) está fechada de propósito — e **conceder
aquela função ao tenant seria o erro**: ela conta a fila INTEIRA da plataforma.
Um cliente saberia, pelo número de pendentes, quando o vizinho está importando
um extrato grande.

A resposta foi função **nova**: `core.tenant_courier_summary()`, que devolve o
**veredito da plataforma em texto** ("entregando", "com atraso", "parado") e
**só os números deste tenant**. O `detalhe` da função global é reescrito, porque
ele cita a contagem global.

```sql
-- ⛔ Estas duas continuam fechadas, e a conferência abaixo tem de dar 0:
select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'core' and p.proname in ('courier_status','tenant_courier_view')
   and has_function_privilege('authenticated', p.oid, 'execute');
```

### 14.3 — Conferir na tela

Entre no portal. A home deve mostrar, **tudo com fonte**:

- o veredito do correio e os números **da sua empresa** (fila, espera, esgotados);
- o consumo do mês contra o teto, **por métrica**, com aviso a partir de 80%;
- os módulos instalados, com a versão **que este tenant tem**;
- as últimas linhas da trilha;
- os atalhos — os mesmos itens do menu, filtrados pela sua permissão.

⚠️ Se uma seção não carregar, ela diz que **não conseguiu ler** — nunca inventa
"OK". Um veredito falso é pior do que veredito nenhum: ele faz quem opera parar
de olhar.

---

## PASSO 15 — FECHAR O `EXECUTE` DE `PUBLIC`: `0022_revoke_public_execute.sql`

⛔ **Segurança. Aplique junto com o `0021`, na mesma janela.**

### 15.1 — O que aconteceu

Uma sabotagem da Etapa 15 apagou o `grant execute` da leitura do plano para
conferir se a guarda de CI reclamava. **Ela não reclamou** — o privilégio
continuava lá.

O motivo é uma regra do PostgreSQL: **toda função nasce com `EXECUTE`
concedido a `PUBLIC`**. Diferente de tabela, que nasce fechada. Quer dizer que
o `grant execute … to authenticated` que se escreve depois de um
`create function` normalmente **não concede nada** — e que **`anon` também
herdou** o privilégio.

Contadas no banco (cadeia `0001`→`0021` + seed, Postgres 17 limpo), eram
**oito** funções executáveis por quem não fez login:

```
core.can_generate       core.emit_event        core.install_module
core.tenant_courier_summary   core.tenant_plan_usage   core.uninstall_module
core.usage_in_period    recon.on_match_decided
```

⚠️ **Nenhuma delas vaza dado hoje** — todas checam `has_permission()` ou
`is_tenant_member()`, que passam por `auth.uid()`; para `anon` o uid é nulo e a
função levanta exceção. **A porta está trancada por dentro.** O defeito é que
ela não devia estar no corredor. É a mesma lição paga P0 do Balanço §5: a RLS
aberta do `suna-core` também "não vazava" enquanto o app fosse correto.

### 15.2 — Aplicar

```
supabase/migrations/0022_revoke_public_execute.sql
```

⚠️ **Ele revoga de `public` e `anon`, nunca de `authenticated`** — tirar de
`authenticated` derrubaria as concessões legítimas que as migrations
anteriores fizeram uma a uma, e o portal inteiro pararia.

⛔ **E ele CONCEDE `core.install_module` e `core.uninstall_module` a
`authenticated`, explicitamente.** As duas nunca tiveram concessão própria: o
clique de instalar na Store funcionava **por causa do buraco**. Sem essas duas
linhas, o revoke quebraria a Store — e quebraria só no clique, não no apply.

### 15.3 — Conferir

```sql
-- Tem de vir VAZIO.
select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('core','recon','marketing','ap','crm','ar','po','ops')
   and has_function_privilege('anon', p.oid, 'execute');
```

E, do outro lado, o que o portal chama de verdade tem de continuar chamável —
`install_module`, `uninstall_module`, `advance_order`, `skip_stage`,
`send_back_order`, `tenant_courier_summary`, `tenant_plan_usage`. Há guarda de
CI conferindo os dois lados: a segurança não pode fechar a porta do cliente
junto.

---

## PASSO 16 — A MISSÃO TRINA: os cinco módulos (`0023` em diante)

Os cinco módulos da Missão Trina nascem como ARQUIVO, e o apply é seu, na
ordem das migrations. Para cada um, o rito é o mesmo de sempre:

1. **Aplicar a migration** no SQL Editor do projeto de produção, na ordem:
   - `0023_inv.sql` — Módulo 8, Estoque (schema `inv`)
   - `0024_quote.sql` — Módulo 9, Propostas (schema `quote`)
   - `0025_deal.sql` — Módulo 10, Funil Comercial (schema `deal`)
   - `0026_evt.sql` — Módulo 11, Eventos (schema `evt`)
   - `0027_dun.sql` — Módulo 12, Régua de Cobrança (schema `dun`)
2. **Reaplicar o seed** (`supabase/seed/0001_platform.sql`) — os cartões
   novos entram no catálogo da Store. Reaplicar não muda o que já está lá.
3. ⚠️ **Expor os schemas novos na Data API** (Project Settings → API →
   Exposed schemas): `inv`, `quote`, `deal`, `evt`, `dun`. Sem isso as telas
   carregam vazias, sem erro que diga o motivo — lição paga cinco vezes.
4. **Instalar cada módulo pela Store**, no tenant que o contratou. O seed
   não concede permissão nenhuma; quem concede é `core.install_module()`.
5. ⚠️ O Módulo 12 (régua) **consome `ar.receivable.*`**: confirme que o
   `apps/api` foi **redeployado** depois do merge — a inscrição nova
   (`dun-title-projection`) só existe no build novo. Sem redeploy, os fatos
   do `ar` são entregues como `no-subscriber` e a régua fica vazia.

Nenhum agente aplica em produção. Depois do apply, a conferência de
segurança do PASSO 15 (§ pós-apply) vale para os cinco schemas novos.

## PASSO 17 — A MISSÃO QUADRA: os módulos seguintes (`0028` em diante)

O rito é o mesmo do Passo 16 — migration na ordem, seed, Data API, Store:

1. **Aplicar a migration** no SQL Editor, na ordem:
   - `0028_ctr.sql` — Módulo 13, Contratos (schema `ctr`)
   - `0029_cash.sql` — Módulo 14, Fluxo de Caixa (schema `cash`)
   - `0030_care.sql` — Módulo 15, Atendimento (schema `care`)
   - `0031_occ.sql` — Módulo 16, Ocorrências (schema `occ`)
   - `0032_mnt.sql` — Módulo 17, Manutenção (schema `mnt`)
2. **Reaplicar o seed** — os cartões novos entram no catálogo.
3. ⚠️ **Expor os schemas novos na Data API**: `ctr`, `cash`, `care`, `occ`, `mnt`. Sem isso as telas
   carregam vazias, sem erro que diga o motivo.
4. **Instalar cada módulo pela Store**, no tenant que o contratou.

Nenhum agente aplica em produção. A conferência de segurança do PASSO 15
(§ pós-apply) vale para os schemas novos.

## PASSO 18 — A MISSÃO PENTA: os módulos seguintes (`0033` em diante)

O rito é o mesmo dos Passos 16 e 17 — migration na ordem, seed, Data API,
Store:

1. **Aplicar a migration** no SQL Editor, na ordem:
   - `0033_pat.sql` — Módulo 18, Patrimônio (schema `pat`)
2. **Reaplicar o seed** — os cartões novos entram no catálogo.
3. ⚠️ **Expor os schemas novos na Data API**: `pat`. Sem isso as telas
   carregam vazias, sem erro que diga o motivo.
4. **Instalar cada módulo pela Store**, no tenant que o contratou.
5. Nenhum módulo desta onda consome evento — **não há redeploy obrigatório
   do `apps/api`**.

Nenhum agente aplica em produção. A conferência de segurança do PASSO 15
(§ pós-apply) vale para os schemas novos.

## O QUE AINDA NÃO EXISTE

Honestidade de escopo, para você não procurar o que não foi construído:

| Peça | Estado |
|---|---|
| Correio (`@alsham/workflow` + `apps/api`) | ✅ **NO AR desde 28/07/2026** — job de 1 em 1 minuto (informado pelo dono; **NÃO VERIFICADO** aqui) |
| Instalador de módulo em runtime | ✅ **CONSTRUÍDO e APLICADO** (`0006_install.sql`) — em 28/07/2026, informado pelo dono (⚠️ NÃO VERIFICADO aqui) |
| Store (vitrine + instalar/desinstalar) | ✅ construída em `apps/portal/src/app/store/` |
| Consumidor de trilha (`core.audit_log`) | ✅ construído e inscrito na composição |
| Consumidor do Módulo 2 (verba da campanha) | ✅ construído e inscrito na composição |
| Módulo 3 — Contas a Pagar (`0007_ap.sql`) | ✅ **CONSTRUÍDO** e **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |
| Módulo 4 — Relacionamentos (`0009_crm.sql`) | ✅ **CONSTRUÍDO** e **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório |
| Módulo 5 — Contas a Receber (`0010_ar.sql`) | ✅ **CONSTRUÍDO** e **APLICADO em produção** em 29/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** aqui |
| Módulo 6 — Compras / Pedidos (`0017_po.sql`) | ✅ **CONSTRUÍDO** — arquivo, ainda não aplicado (§12). **Expor schema `po` na Data API** ao aplicar. |
| Pedido recebido → título no Contas a Pagar | **NÃO CONSTRUÍDO** — ver `MODULO-PO-SPEC §2.3` |
| Conciliação de RECEBIMENTOS (crédito × título a receber) | ✅ **CONSTRUÍDA** em arquivo (`0011`–`0013`) — apply do dono |
| Módulo 7 — Esteira de Produção (`0018_ops.sql`) | ✅ **CONSTRUÍDO** — arquivo, ainda não aplicado (§12) |
| Upload de arquivo no entregável | **NÃO CONSTRUÍDO**, e é decisão: *Storage & Arquivos* é capacidade do Core, ainda não construída. Ver `MODULO-OPS-SPEC §3.4` |
| Reordenar/renomear etapa **pela tela** | **NÃO CONSTRUÍDO** — o schema aceita (a `position` é `deferrable` justamente para isso); o formulário de edição é etapa própria |
| Baixa por perda de título a receber | **NÃO CONSTRUÍDA** — ver `MODULO-AR-SPEC §5` |
| Consumidor do Módulo 1 (título vindo de outro módulo) | ✅ construído e inscrito na composição — fecha o triângulo |
| Registro de liquidação/recebimento **avulso** e estorno **pela tela** | ✅ **CONSTRUÍDO** — `applyPayableSettlement` / `applyReceivableReceipt` e a mudança de estado. A baixa vinda do EXTRATO já existia (`0012`–`0014`): confirmar o casamento emite `recon.match.decided` e o título se liquida sozinho. O que faltava — e agora existe — é o dinheiro que **não** passa por extrato importado |
| Pagamento de verdade (remessa, integração bancária) | **NÃO CONSTRUÍDO**, e é Lei 3: integra-se, não se constrói |
| Telas (`apps/portal`) | ✅ construídas — login, quatro telas do Módulo 1 e a carteira de campanhas |
| Parser de OFX/CSV | ✅ construído em `@alsham/finance-reconciliation` |
| Visão de saúde da fila | ✅ construída — `core.courier_status()` e `core.courier_health` (§6.5) |
| Leitor de CAMT.053 | **NÃO CONSTRUÍDO** |
| Preço em reais e gateway de pagamento | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro |
| Instalação automática de CONSUMIDOR de evento | **NÃO CONSTRUÍDA** — instalar dá acesso e permissões; o handler é código, inscrito à mão na composição. Não há plugin dinâmico |
| Alarme automático de fila parada | **NÃO CONSTRUÍDO** — a §6.5 é consulta, não notificação. Quem olha é você |
| Publicação real em canal (rede social, e-mail) | **NÃO CONSTRUÍDO** — "publicar" muda o estado e conta o fato |
| Forja / IA Base (`0019`+`0020`) | ✅ **CONSTRUÍDA** — arquivo, ainda não aplicada (§13). É **Core**: não aparece na Store |
| Geração ASSÍNCRONA (fila de jobs) | **NÃO CONSTRUÍDA**, e é decisão: a geração desta etapa é **síncrona**. Se um dia for assíncrona, a fila é o correio do Core — **nunca uma segunda** |
| Upload/armazenamento da ARTE gerada | **NÃO CONSTRUÍDO** — o entregável guarda a referência em texto. *Storage & Arquivos* é capacidade do Core, ainda não construída |
| Política de repetição de geração que FALHOU | **NÃO CONSTRUÍDA** — repetir chamada paga sem política é pagar duas vezes por um erro. Declarado no cabeçalho do `0019` |
| Painel Executivo (`0021`) | ✅ **CONSTRUÍDO** — arquivo, ainda não aplicado (§14). É **Core**: não entra no catálogo |
| Fechar o `EXECUTE` de `PUBLIC` (`0022`) | ✅ **CONSTRUÍDO** — arquivo, ainda não aplicado (§15). ⛔ Aplique junto com o `0021` |
| Preço da geração / repasse de custo | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro. Lei 7 |
| Deploy configurado neste repositório | **NÃO EXISTE** — não há `vercel.json`; publicar é ato do dono |

Aplicar este banco **não** põe o produto no ar. Põe a fundação no ar, provada e trancada — e, com o Passo 6, o Lego passa a conversar de verdade.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
