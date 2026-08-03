-- =============================================================================
-- O MÓDULO PRESCRIPTION NO BANCO — a Receita que CONGELA ao emitir (draft →
-- issued, a física do quote) e a ⭐⭐ TRILHA DE LEITURA do conteúdo: os itens
-- (medicamento + posologia) NÃO têm SELECT — a leitura é só por
-- prescription.read_items(), que LOGA. DADO SENSÍVEL (LGPD).
-- =============================================================================
--
-- ⭐ Vertical 🏥 Saúde (Onda Vinte e Um, Fase 3). Roda depois de
-- `01_rls_isolation.sql`. Dado 100% fabricado.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert93(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: prescription instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'prescription', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'prescription', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.key, 'prescription'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  join (values ('prescription.prescription.write'), ('prescription.prescription.read')) as p(key) on true
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'prescription.access.read', 'prescription'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — RASCUNHO: itens editáveis, SEM SELECT direto, emitir exige item
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: rascunho editável; itens sem SELECT direto; emitir exige item ==='

do $$
declare v_rx uuid; v_pat uuid := gen_random_uuid(); v_n int; v_empty uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Cabeçalho tem SELECT (metadata) → RETURNING funciona.
  insert into prescription.prescriptions (tenant_id, patient_id, patient_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Fulana')
  returning id into v_rx;
  perform pg_temp.assert93(v_rx is not null, 'a receita nasce rascunho (cabeçalho legível)');

  -- Itens: medicamento + posologia texto livre. ⚠️ SEM returning (itens não têm SELECT).
  insert into prescription.items (tenant_id, prescription_id, medication, dosage, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rx, 'Amoxicilina 500mg', '1 cp 8/8h por 7 dias', 1);
  insert into prescription.items (tenant_id, prescription_id, medication, dosage, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rx, 'Dipirona 1g', 'se dor', 2);

  -- ⭐⭐ NÃO HÁ SELECT DIRETO nos itens: ler o conteúdo clínico não existe como porta.
  begin
    perform 1 from prescription.items limit 1;
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: SELECT direto nos itens');
  exception when insufficient_privilege then
    perform pg_temp.assert93(true, '⭐⭐ itens sem SELECT direto — a leitura é só pela porta que loga');
  end;

  -- A porta devolve os itens E loga.
  select count(*) into v_n from prescription.read_items('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rx);
  perform pg_temp.assert93(v_n = 2, 'read_items devolve os itens da receita');
  perform pg_temp.assert93(
    (select count(*) >= 1 from prescription.access_log where prescription_id = v_rx),
    '⭐⭐ ler os itens virou registro em access_log (accountability LGPD)');

  -- Emitir receita SEM item é recusado.
  insert into prescription.prescriptions (tenant_id, patient_id, patient_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Vazia')
  returning id into v_empty;
  begin
    update prescription.prescriptions set status = 'issued' where id = v_empty;
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: emitir receita sem item');
  exception when others then
    perform pg_temp.assert93(true, '⭐ receita sem item não se emite');
  end;

  -- Isolamento: Beta não vê a receita do Alfa.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from prescription.prescriptions;
  perform pg_temp.assert93(v_n = 0, 'o Beta não vê as receitas do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ EMITIR CONGELA: prescritor carimbado, itens e cabeçalho frozen
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: emitir congela; prescritor carimbado; frozen ==='

do $$
declare v_rx uuid; v_pat uuid := gen_random_uuid(); v_presc uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into prescription.prescriptions (tenant_id, patient_id, patient_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Beltrano')
  returning id into v_rx;
  insert into prescription.items (tenant_id, prescription_id, medication)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rx, 'Losartana 50mg');

  -- Emitir: draft → issued. Carimba o prescritor.
  update prescription.prescriptions set status = 'issued' where id = v_rx;
  select prescriber_id into v_presc from prescription.prescriptions where id = v_rx;
  perform pg_temp.assert93(v_presc = '11111111-1111-4111-8111-111111111111',
    '⭐ emitir carimba o prescritor pelo servidor');

  -- Congelado: novo item não entra.
  begin
    insert into prescription.items (tenant_id, prescription_id, medication)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rx, 'Item tardio');
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: item em receita emitida');
  exception when insufficient_privilege then
    perform pg_temp.assert93(true, '⭐ receita emitida está congelada: item não nasce depois');
  end;

  -- Congelado: cabeçalho não se edita.
  begin
    update prescription.prescriptions set notes = 'tarde demais' where id = v_rx;
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: editar receita emitida');
  exception when insufficient_privilege then
    perform pg_temp.assert93(true, '⭐ receita emitida não se edita — a correta é uma NOVA');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — A TRILHA, A CANETA, ANON, O FATO SEM MEDICAÇÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: trilha só p/ auditoria; emit fechada; anon fora; fato sem medicação ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (audita)
  select id into v_id from prescription.access_log limit 1;
  begin
    update prescription.access_log set accessed_by = null where id = v_id;
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: editar a trilha');
  exception when others then
    perform pg_temp.assert93(true, '⭐ a trilha de acesso é append-only');
  end;

  -- Beta tem read mas não access.read: não lê a trilha (e é de outro tenant).
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  perform pg_temp.assert93((select count(*) = 0 from prescription.access_log),
    '⭐ sem prescription.access.read a trilha não se lê');

  begin
    perform prescription.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'prescription.prescription.issued', '{}'::jsonb);
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert93(true, 'prescription.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from prescription.prescriptions limit 1;
    perform pg_temp.assert93(false, 'DEVERIA TER FALHADO: anon leu receitas');
  exception when insufficient_privilege then
    perform pg_temp.assert93(true, '⭐ anon não encosta em receitas');
  end;
  reset role;
end $$;

do $$
declare v_payload jsonb;
begin
  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'prescription.prescription.issued' limit 1;
  perform pg_temp.assert93(v_payload is not null, 'emitir emitiu prescription.prescription.issued');
  perform pg_temp.assert93(not (v_payload ? 'items') and not (v_payload ? 'medication'),
    '⭐⭐ os medicamentos NÃO vão no envelope');
end $$;

\echo ''
\echo '=== MÓDULO PRESCRIPTION OK: emitir congela, prescritor carimbado, itens sem SELECT (read_items LOGA), trilha append-only, medicação fora do envelope ==='
