-- =============================================================================
-- PÁGINAS RESERVADAS NO BANCO — a superfície `core.secret_pages` (0120) que se
-- isola: ⭐ o tenant abre a PRÓPRIA página pelo slug; ⭐ saber o slug de outro
-- tenant NÃO abre nada (a consulta roda no próprio tenant); ⭐ a tabela nua é
-- FECHADA ao authenticated (a única porta é o leitor); ⭐ o slug adivinhável e o
-- título vazio são recusados na constraint (Lei 7); ⭐ anon não encosta.
-- =============================================================================
--
-- ⭐ É CORE, não módulo: sem manifesto, fora da Store. Roda depois do
-- `01_rls_isolation.sql` (usa os tenants Alfa/Beta e os usuários dele).
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
--
-- ⚠️ Os ids são LITERAIS dentro dos blocos `do $$` de propósito: psql não
-- interpola `:variavel` dentro de corpo dollar-quoted. Alfa = tenant aaaa /
-- user 1111; Beta = tenant bbbb / user 2222 (criados pelo 01_rls_isolation).
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert109(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== CENÁRIO 1: o dono insere a página do Alfa; o Alfa a abre pelo slug ==='

do $$
declare v_title text; v_body text;
begin
  -- O conteúdo é inserido pelo dono/serviço (no teste, o dono do banco).
  reset role;
  insert into core.secret_pages (tenant_id, slug, title, body)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'pagina-reservada-do-alfa-0001-abcdef',
    'Documento reservado',
    E'# Título\n\nCorpo em **markdown**.');
  perform pg_temp.assert109(true, 'o serviço insere a página reservada do Alfa');

  -- O Alfa, autenticado, abre a própria página pelo slug.
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select title, body into v_title, v_body
    from core.read_secret_page(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'pagina-reservada-do-alfa-0001-abcdef');
  perform pg_temp.assert109(v_title = 'Documento reservado', '⭐ o Alfa abre a própria página pelo slug');
  perform pg_temp.assert109(v_body like '# Título%', 'o corpo markdown chega inteiro');
end $$;

\echo ''
\echo '=== CENÁRIO 2: ISOLAMENTO — o slug do Alfa não abre nada para o Beta ==='

do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  -- Beta pede DENTRO do próprio tenant, com o slug do Alfa: volta vazio (o slug
  -- não pertence ao tenant dele — a consulta roda no próprio tenant).
  select count(*) into v_n
    from core.read_secret_page(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
      'pagina-reservada-do-alfa-0001-abcdef');
  perform pg_temp.assert109(v_n = 0, '⭐ o slug do Alfa não resolve no tenant do Beta');

  -- E pedir a página passando o tenant do Alfa é barrado na 1ª linha (sem vínculo).
  begin
    perform 1 from core.read_secret_page(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'pagina-reservada-do-alfa-0001-abcdef');
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: o Beta leu passando o tenant do Alfa');
  exception when insufficient_privilege then
    perform pg_temp.assert109(true, '⭐⭐ o Beta é barrado ao passar o tenant do Alfa (sem vínculo)');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 3: a tabela nua é FECHADA ao authenticated (só o leitor expõe) ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- A tabela nua não se lê: a única porta é a função leitora.
  begin
    perform 1 from core.secret_pages limit 1;
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: authenticated leu a tabela nua');
  exception when insufficient_privilege then
    perform pg_temp.assert109(true, '⭐ a tabela nua é fechada — só a função leitora expõe');
  end;

  -- O tenant NÃO escreve a própria página: a inserção é do serviço.
  begin
    insert into core.secret_pages (tenant_id, slug, title, body)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'forjada-pelo-tenant-autenticado-x', 'forjada', '');
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: o tenant inseriu uma página');
  exception when insufficient_privilege then
    perform pg_temp.assert109(true, '⭐ insert na prateleira não é concedido ao authenticated');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 4: ⭐ o slug adivinhável e o título vazio são recusados (Lei 7) ==='

do $$
begin
  reset role;  -- privilégio de serviço (no teste, o dono do banco)

  -- Slug curto/adivinhável: a constraint recusa (< 24 chars).
  begin
    insert into core.secret_pages (tenant_id, slug, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'curto', 'Título');
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: slug curto/adivinhável');
  exception when check_violation then
    perform pg_temp.assert109(true, '⭐ slug curto é recusado (endereço não-óbvio é regra)');
  end;

  -- Título vazio: recusado (Lei 7).
  begin
    insert into core.secret_pages (tenant_id, slug, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'slug-valido-porem-sem-titulo-0001', '   ');
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: título vazio');
  exception when check_violation then
    perform pg_temp.assert109(true, '⭐ título vazio é recusado (Lei 7)');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 5: ⭐ o slug default nasce aleatório e não-óbvio (≥ 24 hex) ==='

do $$
declare v_slug text;
begin
  reset role;
  insert into core.secret_pages (tenant_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'Sem slug informado')
  returning slug into v_slug;
  perform pg_temp.assert109(char_length(v_slug) >= 24, '⭐ o slug default é longo e não-óbvio');
  perform pg_temp.assert109(v_slug ~ '^[0-9a-f]+$', 'e é hexadecimal puro (aleatório)');
end $$;

\echo ''
\echo '=== CENÁRIO 6: anon não encosta em nada ==='

do $$
begin
  set local role anon;

  begin
    perform 1 from core.secret_pages limit 1;
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: anon leu a tabela');
  exception when insufficient_privilege then
    perform pg_temp.assert109(true, '⭐ anon não encosta na tabela');
  end;

  begin
    perform 1 from core.read_secret_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'pagina-reservada-do-alfa-0001-abcdef');
    perform pg_temp.assert109(false, 'DEVERIA TER FALHADO: anon chamou a leitora');
  exception when insufficient_privilege then
    perform pg_temp.assert109(true, '⭐ a função leitora não é concedida a anon');
  end;

  reset role;
end $$;

\echo ''
\echo '=== PÁGINAS RESERVADAS OK: lê o dono do tenant, isola pelo tenant, tabela fechada, slug/título validados, anon fora ==='
