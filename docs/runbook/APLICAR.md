# 🔧 RUNBOOK — APLICAR O BANCO DO BUSINESS OS

**Para quem:** o dono, aplicando pelo painel do Supabase. Não exige CLI.
**Quando:** uma vez, ao criar o projeto Supabase novo.
**Quanto tempo:** ~15 minutos, incluindo a conferência de segurança.

> **O que já foi provado antes de você chegar aqui:** estes arquivos foram aplicados de verdade num PostgreSQL 17 limpo, na ordem abaixo, e passaram num teste de isolamento com usuário real. O CI repete isso a cada mudança. **Não é para dar susto.**

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
| 4 | `supabase/seed/0001_platform.sql` | o catálogo: papéis, módulo `recon`, planos | `Success. No rows returned` |

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
 where n.nspname in ('core','recon') and c.relkind = 'r'
 group by 1 order by 1;
```

**Esperado — os três números iguais em cada linha:**

| schema | tabelas | rls_ligada | rls_forcada |
|---|---|---|---|
| core | 11 | 11 | 11 |
| recon | 5 | 5 | 5 |

```sql
-- 2. Alguma tabela com RLS ligada mas SEM policy nenhuma?
-- (Uma tabela assim está trancada — pode ser de propósito, ou pode ser bug.)
select n.nspname||'.'||c.relname as tabela,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('core','recon') and c.relkind = 'r'
 order by 2, 1;
```

**Esperado:** 36 policies no total. Exatamente **duas** tabelas com `0`: `core.event_outbox` e `core.processed_events` — são encanamento, trancadas de propósito.

```sql
-- 3. O catálogo entrou?
select (select count(*) from core.roles            where tenant_id is null) as papeis_sistema,
       (select count(*) from core.role_permissions)                          as permissoes,
       (select count(*) from core.module_registry  where status='published') as modulos,
       (select count(*) from core.plan_limits)                               as limites,
       (select count(*) from core.tenants)                                   as tenants_deve_ser_zero,
       (select count(*) from auth.users)                                     as usuarios_deve_ser_zero;
```

**Esperado:** `2 · 11 · 1 · 12 · 0 · 0`

Os dois últimos zeros são o ponto: **o seed é catálogo, não cliente.** Se aparecer tenant ou usuário aqui, alguém aplicou algo que não devia.

---

## PASSO 4 — CHECKLIST DE SEGURANÇA

Faça este passo **no mesmo dia**. É ele que separa este banco do `suna-core`, que nasceu com RLS aberta e virou P0.

### 🔴 No banco

- [ ] **RLS ligada e forçada em 16/16 tabelas** — consulta 1 do Passo 3, três colunas com o mesmo número.
- [ ] **Nada em `public`.** Rode:
  ```sql
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r';
  ```
  **Esperado: `0`.** O Business OS vive em `core` e `recon` de propósito — nada nasce exposto via API por padrão. Se aparecer tabela em `public`, alguém criou por fora e ela **está exposta**.
- [ ] **`anon` não tem nada.** Rode:
  ```sql
  select count(*) from information_schema.role_table_grants
   where grantee='anon' and table_schema in ('core','recon');
  ```
  **Esperado: `0`.** Ninguém lê o Business OS sem estar autenticado.
- [ ] **Nenhuma policy `USING (true)`.** Rode:
  ```sql
  select n.nspname||'.'||c.relname as tabela, p.polname
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('core','recon')
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
- ❌ **Não edite `0001` ou `0002` depois de aplicados.** Arquivo aplicado é história. Correção vira `0003_*.sql`.
- ❌ **Não rode o seed com dado de cliente dentro.** Se precisar de um tenant de exemplo, é script descartável, fora do repositório.
- ❌ **Não desligue a RLS "só para testar".** É exatamente assim que o `suna-core` chegou onde chegou.

---

## PASSO 6 — LIGAR O CORREIO DO CORE

Sem o correio, todo evento emitido pelos módulos fica em `pending` para sempre. A lógica existe e é testada (`@alsham/workflow`); **ligá-la é ato seu**, e há dois caminhos.

### Opção A — `pg_cron` dentro do Supabase (o padrão da Casa)

É o padrão PROVADO do `casa-bonaparte-saas`: um job por minuto, sem servidor a manter, sem chave saindo do banco. Precisa das extensões `pg_cron` e `pg_net`, habilitadas no painel em **Database → Extensions**.

**Vantagem:** roda dentro do banco; se a aplicação cair, a fila continua andando.
**Custo:** a lógica de entrega precisa existir em SQL ou chamar um endpoint via `pg_net`.

### Opção B — endpoint protegido + agendador externo

Um endpoint no servidor chama `deliverDue()` e é acionado por um agendador (Vercel Cron, GitHub Actions, o que for).

**Vantagem:** a lógica de entrega é a mesma TypeScript já testada.
**Custo:** o endpoint precisa de segredo próprio, e quem o chama roda com `service_role`.

⛔ **Nos dois casos:** quem entrega roda com `service_role`, **do servidor**. Essa chave nunca vai para o painel do cliente — `apps/portal` não a tem e há guarda no CI para que continue assim.

### Como conferir se está andando

```sql
-- Quantos eventos estão parados na caixa, e há quanto tempo?
select status, count(*), min(occurred_at) as mais_antigo
  from core.event_outbox
 group by status order by 2 desc;
```

**Esperado com o correio ligado:** `delivered` crescendo, `pending` perto de zero.
**Se `pending` só cresce:** o correio não está rodando.
**Se aparecer `dead`:** houve evento que falhou todas as tentativas — a linha tem o `last_error`. Isso pede olho humano, e é de propósito que não some.

---

## O QUE AINDA NÃO EXISTE

Honestidade de escopo, para você não procurar o que não foi construído:

| Peça | Estado |
|---|---|
| Lógica do correio (`@alsham/workflow`) | ✅ **CONSTRUÍDA e testada** — mas **não ligada**: ver Passo 6 |
| Consumidor de trilha (`core.audit_log`) | ✅ construído no pacote; grava quando o correio for ligado |
| Preço em reais e gateway de pagamento | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro |
| Instalador de módulo em runtime | **NÃO CONSTRUÍDO** — por isso o seed já põe as permissões do `recon` no papel `admin` |
| Qualquer tela | **NÃO CONSTRUÍDO** |
| Parser de OFX/CSV | **NÃO CONSTRUÍDO** |

Aplicar este banco **não** põe o produto no ar. Põe a fundação no ar, provada e trancada — que é o que esta etapa se propôs a entregar.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
