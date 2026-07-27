-- =============================================================================
-- SHIM DE TESTE LOCAL — NÃO É MIGRATION E NUNCA VAI PARA O SUPABASE
-- =============================================================================
--
-- ⚠️ ESTE ARQUIVO NÃO ESTÁ EM `supabase/migrations/` DE PROPÓSITO.
--
-- Um projeto Supabase já traz o schema `auth`, a função `auth.uid()` e os
-- papéis `anon` / `authenticated` / `service_role`. Um Postgres nu, não.
--
-- Este arquivo recria **só o mínimo** dessas peças para que as migrations
-- possam ser aplicadas de verdade num Postgres efêmero e o isolamento possa
-- ser testado com usuário real. Ele existe para PROVAR as migrations, não
-- para fazer parte delas.
--
-- Aplicar isto num projeto Supabase real quebraria o `auth` de verdade.
-- O runbook (`docs/runbook/APLICAR.md`) diz explicitamente para pular esta
-- pasta.
-- =============================================================================

-- Os três papéis que o Supabase provisiona.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- A tabela de identidade. No Supabase tem dezenas de colunas; aqui só o que
-- as migrations referenciam de fato.
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

/**
 * `auth.uid()` — o usuário da requisição.
 *
 * Reproduz o comportamento do Supabase: lê a claim `sub` do JWT, que o
 * PostgREST injeta como GUC de sessão. Aceita as duas formas que o Supabase
 * já usou, para que o teste não dependa da versão.
 *
 * No teste, "autenticar" é `set local request.jwt.claim.sub = '<uuid>'`.
 */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
