-- =============================================================================
-- O MÓDULO 79 NO BANCO — o incidente de segurança que se isola, o ciclo NIST de
-- 5 estados, a editabilidade-enquanto-aberto que CONGELA no fechamento (o DIVERGE
-- do occ) e a timeline de resposta IMUTÁVEL (a física da tratativa do occ,
-- mantida de propósito).
-- =============================================================================
--
-- ⭐ Domain 🔐 Segurança da Informação (Onda Dezenove, Fase 3) — capacidade
-- *Resposta a incidentes*.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o incidente nasce `detected`, o servidor carimba `created_by`, e um tenant
--      não vê o do outro; `severity` 1..5 (CHECK) e `detected_at` no FUTURO
--      recusado (a coerência do occ, re-perguntada);
--   2. ⭐ o ciclo NIST completo (detected → contained → eradicated → recovered →
--      closed), o atalho de falso-positivo (detected → closed), o `closed`
--      TERMINAL e o salto ilegal recusado — tudo pelo gatilho de transição;
--   3. ⭐ editável ENQUANTO ABERTO (o vetor de ataque se descobre investigando) e
--      CONGELA no fechamento (o DIVERGE do occ imutável, a física do risk);
--   4. ⭐⭐ a timeline de resposta é IMUTÁVEL nas DUAS camadas (cliente sem porta;
--      o dono barrado pelo gatilho `fato consumado`);
--   5. cross-tenant barrado; a caneta de emitir evento não é do cliente; `anon`
--      não encosta; e ⛔ o vetor de ataque NÃO passeia no correio (privacidade);
--   6. cada fase do ciclo virou fato no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert84(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: secincident instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'secincident', 'Resposta a Incidentes', '0.1.0',
  'O incidente de segurança: ciclo NIST de 5 estados, editável enquanto aberto, congela no fim; a resposta é livro imutável.',
  'domain', 'infosec',
  '[{"key":"incident-response","canonicalName":"Resposta a incidentes"}]'::jsonb,
  '[{"key":"secincident.incident.manage","moduleId":"secincident","description":"Gerir incidentes e a timeline de resposta."}]'::jsonb,
  '[{"type":"secincident.incident.registered","version":1,"description":"Registrado."},
    {"type":"secincident.incident.contained","version":1,"description":"Contido."},
    {"type":"secincident.incident.eradicated","version":1,"description":"Erradicado."},
    {"type":"secincident.incident.recovered","version":1,"description":"Recuperado."},
    {"type":"secincident.incident.closed","version":1,"description":"Fechado."},
    {"type":"secincident.action.recorded","version":1,"description":"Ação de resposta registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secincident', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'secincident', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Os dois usuários têm a permissão de gerir: conter, erradicar, recuperar e
-- fechar são atos do mesmo papel neste módulo.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'secincident.incident.manage', 'secincident'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE DETECTED, O SERVIDOR CARIMBA O AUTOR, ISOLA; O CHECK DA
--             SEVERIDADE E A COERÊNCIA DO DETECTED_AT (SEM FUTURO)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce detected; severity 1..5; detected_at sem futuro; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT. O gatilho descarta e carimba quem está logado.
  insert into secincident.incidents (tenant_id, title, description, severity, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'Acesso indevido ao painel', 'Login fora do horário, IP desconhecido', 3,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert84(v_st = 'detected', 'o incidente nasce detected');
  perform pg_temp.assert84(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  -- severity fora da faixa 1..5 (zero) é recusada pelo CHECK.
  begin
    insert into secincident.incidents (tenant_id, title, description, severity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sev zero', 'x', 0);
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: severity 0');
  exception when check_violation then
    perform pg_temp.assert84(true, '⭐ severity fora de 1..5 (zero) é recusada pelo CHECK');
  end;

  -- detected_at no FUTURO é recusado (a coerência do occ, re-perguntada).
  begin
    insert into secincident.incidents (tenant_id, title, description, severity, detected_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Do futuro', 'x', 2, now() + interval '1 day');
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: detected_at no futuro');
  exception when check_violation then
    perform pg_temp.assert84(true, '⭐ detectar no futuro não existe — a constraint não-futuro recusa');
  end;

  -- O Beta não vê o incidente do Alfa.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from secincident.incidents;
  perform pg_temp.assert84(v_n = 0, 'o Beta não vê o incidente do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CICLO NIST: LINEAR, O ATALHO DE FALSO-POSITIVO, O TERMINAL,
--             E O SALTO ILEGAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: detected→contained→eradicated→recovered→closed; atalho e terminal ==='

do $$
declare v_id uuid; v_closed timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into secincident.incidents (tenant_id, title, description, severity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ransomware detectado', 'Cripto em compartilhado', 5)
  returning id into v_id;

  -- Salto ILEGAL: detected → eradicated (pula contained). Recusado pelo gatilho.
  begin
    update secincident.incidents set status='eradicated' where id = v_id;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: detected → eradicated (salto ilegal)');
  exception when invalid_parameter_value then
    perform pg_temp.assert84(true, '⭐ o salto detected → eradicated não existe no ciclo NIST');
  end;

  -- O caminho NIST linear, passo a passo.
  update secincident.incidents set status='contained'  where id = v_id;
  perform pg_temp.assert84((select status='contained'  from secincident.incidents where id=v_id), 'detected → contained');
  update secincident.incidents set status='eradicated' where id = v_id;
  perform pg_temp.assert84((select status='eradicated' from secincident.incidents where id=v_id), 'contained → eradicated');
  update secincident.incidents set status='recovered'  where id = v_id;
  perform pg_temp.assert84((select status='recovered'  from secincident.incidents where id=v_id), 'eradicated → recovered');

  -- Fechar SEM nota é recusado (a nota de encerramento é obrigatória).
  begin
    update secincident.incidents set status='closed' where id = v_id;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: fechar sem nota de encerramento');
  exception when invalid_parameter_value then
    perform pg_temp.assert84(true, '⭐ fechar exige a nota de encerramento (lições / conclusão)');
  end;

  -- Fechar COM nota: carimba closed_at.
  update secincident.incidents set status='closed', close_note='conta rotacionada; backup restaurado' where id = v_id;
  select closed_at into v_closed from secincident.incidents where id = v_id;
  perform pg_temp.assert84(v_closed is not null, '⭐ recovered → closed com nota carimba closed_at');

  -- ⭐ closed é TERMINAL: closed → recovered não existe.
  begin
    update secincident.incidents set status='recovered' where id = v_id;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: closed → recovered (closed é terminal)');
  exception when invalid_parameter_value then
    perform pg_temp.assert84(true, '⭐ closed é TERMINAL — o que recorre é incidente novo');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ O atalho de FALSO-POSITIVO: detected → closed (com nota).
  insert into secincident.incidents (tenant_id, title, description, severity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alerta de SIEM', 'Suspeita de exfiltração', 2)
  returning id into v_id;

  update secincident.incidents set status='closed', close_note='falso positivo — varredura agendada' where id = v_id;
  perform pg_temp.assert84((select status='closed' from secincident.incidents where id=v_id),
    '⭐ detected → closed: o atalho de falso positivo existe (com nota)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ EDITÁVEL ENQUANTO ABERTO; CONGELA NO FECHAMENTO (o DIVERGE do occ)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o entendimento evolui enquanto aberto; congela ao fechar ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into secincident.incidents (tenant_id, title, description, severity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Injeção no formulário', 'Comportamento anômalo no login', 4)
  returning id into v_id;

  -- ⭐ ENQUANTO ABERTO: o vetor de ataque se descobre investigando — o UPDATE passa.
  update secincident.incidents set attack_vector='sql injection' where id = v_id;
  perform pg_temp.assert84((select attack_vector='sql injection' from secincident.incidents where id=v_id),
    '⭐ enquanto aberto, o attack_vector se atualiza — o entendimento evolui (o DIVERGE do occ)');

  -- Fecha o incidente.
  update secincident.incidents set status='contained'  where id = v_id;
  update secincident.incidents set status='eradicated' where id = v_id;
  update secincident.incidents set status='recovered'  where id = v_id;
  update secincident.incidents set status='closed', close_note='WAF ativado; código corrigido' where id = v_id;

  -- ⭐ DEPOIS DE FECHADO: editar o conteúdo é recusado (congelou).
  begin
    update secincident.incidents set attack_vector='outra coisa' where id = v_id;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: editar attack_vector de incidente fechado');
  exception when invalid_parameter_value then
    perform pg_temp.assert84(true, '⭐ fechado: o attack_vector congelou — nada nele muda mais');
  end;

  begin
    update secincident.incidents set description='reescrita' where id = v_id;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: editar description de incidente fechado');
  exception when invalid_parameter_value then
    perform pg_temp.assert84(true, '⭐ fechado: a descrição congelou também');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ A TIMELINE DE RESPOSTA É IMUTÁVEL: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a ação de resposta é fato consumado — cliente sem porta; nem o dono ==='

do $$
declare v_inc uuid; v_act uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into secincident.incidents (tenant_id, title, description, severity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Phishing em massa', 'Campanha contra colaboradores', 3)
  returning id into v_inc;

  -- Uma ação na timeline de resposta.
  insert into secincident.response_actions (tenant_id, incident_id, action_taken)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_inc, 'Bloqueio do remetente no gateway')
  returning id into v_act;

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (só select/insert): barrado
  -- antes mesmo de o gatilho rodar.
  begin
    update secincident.response_actions set action_taken='outra' where id = v_act;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: cliente editou uma ação de resposta');
  exception when insufficient_privilege then
    perform pg_temp.assert84(true, '⭐ CAMADA 1: o cliente não edita a timeline — não há porta de UPDATE');
  end;

  -- CAMADA 1 — e nem apaga.
  begin
    delete from secincident.response_actions where id = v_act;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: cliente apagou uma ação de resposta');
  exception when insufficient_privilege then
    perform pg_temp.assert84(true, '⭐ CAMADA 1: o cliente não apaga a timeline — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: alcança o gatilho, e o gatilho recusa.
  reset role;
  begin
    update secincident.response_actions set action_taken='reescrita do dono' where id = v_act;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: o dono reescreveu a ação de resposta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert84(v_erro like '%fato consumado%',
      '⭐⭐ CAMADA 2: nem o dono reescreve — a ação é fato consumado (registre outra)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, ANON, E O VETOR QUE NÃO PASSEIA NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora; privacidade do vetor ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Escrever no tenant do vizinho é barrado pela RLS.
  begin
    insert into secincident.incidents (tenant_id, title, description, severity)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'x', 1);
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert84(true, '⭐ cross-tenant barrado: o Alfa não registra no tenant do Beta');
  end;

  -- A caneta de emitir evento não é do cliente.
  begin
    perform secincident.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secincident.incident.registered', '{}'::jsonb);
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert84(true, 'secincident.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from secincident.incidents limit 1;
    perform pg_temp.assert84(false, 'DEVERIA TER FALHADO: anon leu secincident.incidents');
  exception when insufficient_privilege then
    perform pg_temp.assert84(true, '⭐ anon não encosta em secincident.incidents');
  end;
  reset role;
end $$;

-- ⛔ BÔNUS: o envelope de um incidente registrado NÃO carrega o vetor de ataque
-- nem os dados comprometidos — o correio leva só metadado (privacidade).
do $$
declare v_id uuid; v_secret text := 'zero-day-CVE-DEDO-DURO-9999'; v_payloads text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into secincident.incidents (tenant_id, title, description, severity, attack_vector, affected_data)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vazamento', 'Exfiltração confirmada', 5,
          v_secret, 'base de clientes')
  returning id into v_id;

  reset role;
  select string_agg(payload::text, ' ') into v_payloads
    from core.event_outbox
   where event_type like 'secincident.%'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.assert84(position(v_secret in coalesce(v_payloads,'')) = 0,
    '⛔ o vetor de ataque NÃO passeia no correio — o envelope é só metadado (privacidade)');
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — cada fase do ciclo virou fato na caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: o ciclo NIST e a timeline viraram fato no correio ==='

do $$
declare v_n int;
begin
  reset role;

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.incident.registered';
  perform pg_temp.assert84(v_n >= 1, 'o registro emitiu secincident.incident.registered');

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.incident.contained';
  perform pg_temp.assert84(v_n >= 1, 'a contenção emitiu secincident.incident.contained');

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.incident.eradicated';
  perform pg_temp.assert84(v_n >= 1, 'a erradicação emitiu secincident.incident.eradicated');

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.incident.recovered';
  perform pg_temp.assert84(v_n >= 1, 'a recuperação emitiu secincident.incident.recovered');

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.incident.closed';
  perform pg_temp.assert84(v_n >= 1, 'o fechamento emitiu secincident.incident.closed');

  select count(*) into v_n from core.event_outbox where event_type = 'secincident.action.recorded';
  perform pg_temp.assert84(v_n >= 1, 'a ação de resposta emitiu secincident.action.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 79 OK: ciclo NIST (5 estados, terminal), editável-enquanto-aberto/congela-no-fim, timeline imutável (2 camadas), vetor fora do correio, anon fora ==='
