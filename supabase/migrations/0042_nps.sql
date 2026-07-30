-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0042_nps.sql
-- Módulo 27: Pesquisas. Schema `nps`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §19,
-- depois do `0041_media.sql`.
--
-- Taxonomia: Domain 💬 Atendimento ao Cliente (CX) — capacidade
-- *Pesquisas NPS/CSAT* (a linha do CX na Taxonomia §5, a mesma do care).
-- Spec: docs/canon/MODULO-NPS-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A NOTA 0–10 É CHECK ARGUMENTADO — a segunda física da onda
-- -----------------------------------------------------------------------------
-- A régua do NPS (0 a 10; detrator 0–6, neutro 7–8, promotor 9–10) é
-- convenção MUNDIAL do método, não vocabulário de casa — como o
-- corretiva/preventiva do mnt e o published/dropped do edcal. Uma
-- pesquisa em qualquer setor e qualquer país usa esta régua EXATAMENTE
-- assim; congelá-la em CHECK não envelhece o produto — solta, cada tenant
-- inventaria uma régua e nenhum placar seria comparável a nada.
-- (A PERGUNTA, essa sim, é texto do tenant.)
--
-- -----------------------------------------------------------------------------
-- ⭐ O PLACAR É VIEW — nunca coluna
-- -----------------------------------------------------------------------------
-- score = %promotores − %detratores, calculado DO LIVRO de respostas
-- (`security_invoker`, sob a RLS de quem lê) — o saldo do inv e o
-- progresso do goal re-perguntados para a OPINIÃO. Placar em coluna é
-- placar que alguém edita. ⭐ E pesquisa SEM resposta NÃO tem linha na
-- view: sem número inventado — "ainda sem placar" é a verdade.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO: draft → open → closed — e CLOSED É TERMINAL
-- -----------------------------------------------------------------------------
-- O care re-perguntado, com a OUTRA resposta: o caso reaberto é o MESMO
-- pedido (resolved → open existe lá); a pesquisa reaberta seria OUTRA
-- MEDIÇÃO — misturar as respostas de abril com as de setembro no mesmo
-- placar mentiria os dois. A rodada que volta é PESQUISA NOVA. Há teste
-- de contraste care×nps que assina os dois lados.
-- ⭐ ABRIR CONGELA A PERGUNTA (a física do quote): mudar a pergunta no
-- meio da coleta invalida o placar — resposta antiga responderia a
-- pergunta nova. No rascunho, edita-se à vontade.
--
-- -----------------------------------------------------------------------------
-- ⭐ A RESPOSTA É ATO — e ANON = NADA, sem exceção
-- -----------------------------------------------------------------------------
-- Cada resposta é ato imutável em 3 camadas, ordenado pela SEQUÊNCIA,
-- carimbado pelo servidor (quem DIGITOU, quando). SÓ a pesquisa ABERTA
-- colhe: o rascunho ainda não abriu (o comm re-perguntado); a fechada é
-- medição encerrada (a física do spc/evt). O respondente é TEXTO NEUTRO
-- OPCIONAL ("mesa 12", "cliente da tarde") — LGPD-mínimo — e NÃO passeia
-- no envelope, nem o comentário.
-- ⛔ O LINK PÚBLICO DE RESPOSTA NÃO EXISTE — e a ausência é declarada:
-- `anon` não recebe NADA neste schema. O coletor externo é INTEGRAÇÃO
-- FUTURA (serviço de fora → API com chave, o padrão da Forja). Hoje quem
-- registra a resposta é operador logado, com permissão própria.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA a pergunta em texto do tenant; o respondente neutro opcional;
--      a régua 0–10 (física do método, ver acima).
--   ❌ NÃO ENTRA envio da pesquisa (Lei 3 — transporte é integração),
--      link anônimo (ver acima), análise de sentimento (capacidade da
--      Forja, pedida quando existir), meta de NPS (isso é o módulo goal —
--      a ponte é id solto pela tela, nunca FK).
-- =============================================================================

create schema if not exists nps;

comment on schema nps is
  'Módulo Pesquisas. Domain cx da Taxonomia (capacidade Pesquisas NPS/CSAT). A régua 0-10 é física do método (CHECK argumentado); o placar é view calculada do livro; abrir congela a pergunta; closed é terminal (a rodada que volta é pesquisa nova — o DIVERGE assinado do care); anon não recebe nada. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima sétima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function nps.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not like 'nps.%' then
    raise exception 'nps.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'nps',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function nps.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function nps.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'nps.survey.manage')
      or core.has_permission(p_tenant_id, 'nps.response.record');
$$;

create or replace function nps.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. SURVEYS — a rodada de medição
-- =============================================================================

create table nps.surveys (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  title      text        not null check (length(btrim(title)) > 0),
  -- A PERGUNTA é texto do tenant — a régua é do método; as palavras, dele.
  question   text        not null check (length(btrim(question)) > 0),
  status     text        not null default 'draft'
             check (status in ('draft', 'open', 'closed')),
  opened_at  timestamptz,
  opened_by  uuid        references auth.users (id) on delete set null,
  closed_at  timestamptz,
  closed_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint nps_surveys_id_tenant unique (id, tenant_id),
  -- Aberta (e fechada) tem o carimbo de abertura; o rascunho não tem.
  constraint nps_surveys_open_coherent check (
    (status = 'draft' and opened_at is null)
    or (status in ('open', 'closed') and opened_at is not null)
  ),
  constraint nps_surveys_close_coherent check (
    (status = 'closed' and closed_at is not null)
    or (status in ('draft', 'open') and closed_at is null)
  )
);

create index nps_surveys_board_idx
  on nps.surveys (tenant_id, status, opened_at desc);

create trigger nps_surveys_touch
  before update on nps.surveys
  for each row execute function nps.touch_updated_at();

alter table nps.surveys enable row level security;
alter table nps.surveys force row level security;

create policy nps_surveys_select on nps.surveys
  for select to authenticated
  using (nps.can_access(tenant_id));

create policy nps_surveys_insert on nps.surveys
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'nps.survey.manage'));

create policy nps_surveys_update on nps.surveys
  for update to authenticated
  using (core.has_permission(tenant_id, 'nps.survey.manage'))
  with check (core.has_permission(tenant_id, 'nps.survey.manage'));

-- ⛔ Sem policy / grant de DELETE. Medição feita é história do tenant.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: no rascunho
-- -----------------------------------------------------------------------------

create or replace function nps.guard_survey_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a pesquisa nasce no rascunho: abrir a coleta é ato registrado depois'
      using errcode = '22023';
  end if;
  new.opened_at := null;
  new.opened_by := null;
  new.closed_at := null;
  new.closed_by := null;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger nps_surveys_stamp
  before insert on nps.surveys
  for each row execute function nps.guard_survey_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/nps
-- -----------------------------------------------------------------------------

create or replace function nps.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'open'),
    ('open',  'closed')
  );
$$;

comment on function nps.allowed_transition(text, text) is
  'Ciclo de vida da pesquisa. Espelho de ALLOWED_TRANSITIONS em @alsham/nps. DOIS pares e closed TERMINAL — o care re-perguntado com a OUTRA resposta: o caso reaberto é o mesmo pedido; a pesquisa reaberta seria outra medição, e misturar rodadas no mesmo placar mentiria as duas. A rodada que volta é pesquisa nova.';

create or replace function nps.guard_survey_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ ABRIR CONGELA a pergunta (e o título): resposta antiga não pode
    -- responder pergunta nova. No rascunho, edita-se à vontade.
    if old.status <> 'draft'
       and (new.title is distinct from old.title
            or new.question is distinct from old.question) then
      raise exception 'a coleta congelou a pergunta: mudar no meio invalidaria o placar — outra pergunta é pesquisa nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not nps.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: a medição encerrada não reabre — a rodada que volta é pesquisa nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'open' then
    new.opened_at := now();
    new.opened_by := (select auth.uid());
  end if;

  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger nps_surveys_guard_status
  before update on nps.surveys
  for each row execute function nps.guard_survey_transition();

-- =============================================================================
-- 3. RESPONSES — ⭐ o livro de respostas: ato imutável, régua do método
-- =============================================================================

create table nps.responses (
  id           uuid        primary key default gen_random_uuid(),
  -- A ordem dos atos é a do LIVRO, nunca a do relógio (a lição do pat).
  seq          bigint      generated always as identity,
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  survey_id    uuid        not null,
  -- ⭐ A régua do MÉTODO — CHECK argumentado (ver o cabeçalho).
  score        smallint    not null check (score >= 0 and score <= 10),
  comment      text        not null default '',
  -- ⭐ Respondente NEUTRO e OPCIONAL — LGPD-mínimo: "mesa 12", "cliente
  -- da tarde". Não passeia no envelope.
  respondent   text        not null default '',
  responded_at timestamptz not null default now(),
  -- Quem DIGITOU — operador logado (anon = nada; ver o cabeçalho).
  recorded_by  uuid        references auth.users (id) on delete set null,
  constraint nps_responses_survey_fk
    foreign key (survey_id, tenant_id)
    references nps.surveys (id, tenant_id)
    on delete restrict
);

create index nps_responses_book_idx
  on nps.responses (tenant_id, survey_id, seq desc);

alter table nps.responses enable row level security;
alter table nps.responses force row level security;

create policy nps_responses_select on nps.responses
  for select to authenticated
  using (nps.can_access(tenant_id));

create policy nps_responses_insert on nps.responses
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'nps.response.record'));

create or replace function nps.guard_response_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from nps.surveys
   where id = new.survey_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'a pesquisa não existe neste tenant' using errcode = '22023';
  end if;

  -- ⭐ SÓ A ABERTA COLHE (ver o cabeçalho).
  if v_status = 'draft' then
    raise exception 'o rascunho ainda não abriu a coleta: não há o que responder'
      using errcode = '22023';
  end if;
  if v_status = 'closed' then
    raise exception 'a medição encerrou: resposta tardia entraria num placar já lido — a rodada nova é outra pesquisa'
      using errcode = '22023';
  end if;

  -- O ato é carimbado pelo servidor — o digitado é descartado.
  new.responded_at := now();
  new.recorded_by  := (select auth.uid());

  return new;
end;
$$;

create trigger nps_responses_stamp
  before insert on nps.responses
  for each row execute function nps.guard_response_insert();

create or replace function nps.guard_responses_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a resposta é registro de fato consumado: não se edita nem se apaga — a opinião dada é a opinião dada.'
    using errcode = '42501';
end;
$$;

create trigger nps_responses_immutable
  before update or delete on nps.responses
  for each row execute function nps.guard_responses_immutable();

-- =============================================================================
-- 4. ⭐ O PLACAR — VIEW calculada do livro, nunca coluna
-- =============================================================================

create view nps.survey_score
with (security_invoker = true)
as
select
  r.tenant_id,
  r.survey_id,
  count(*)::integer                                        as responses,
  count(*) filter (where r.score >= 9)::integer            as promoters,
  count(*) filter (where r.score between 7 and 8)::integer as passives,
  count(*) filter (where r.score <= 6)::integer            as detractors,
  round(
    (count(*) filter (where r.score >= 9))::numeric * 100 / count(*)
    - (count(*) filter (where r.score <= 6))::numeric * 100 / count(*)
  )::integer                                               as score
from nps.responses r
group by r.tenant_id, r.survey_id;

comment on view nps.survey_score is
  '⭐ O placar é CALCULADO do livro de respostas — %promotores − %detratores, a régua mundial do método. Nunca coluna: placar em coluna é placar que alguém edita. Pesquisa sem resposta NÃO tem linha aqui — sem número inventado. security_invoker: lê sob a RLS de quem consulta.';

-- =============================================================================
-- 5. OS FATOS — sem comentário e sem respondente no envelope
-- =============================================================================

create or replace function nps.survey_payload(p nps.surveys)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'surveyId', p.id,
    'title',    p.title,
    'status',   p.status,
    'openedAt', p.opened_at,
    'closedAt', p.closed_at
  );
$$;

comment on function nps.survey_payload(nps.surveys) is
  'O envelope de uma pesquisa — o fato, sem o texto: nem a pergunta inteira passeia, muito menos as respostas.';

create or replace function nps.on_survey_drafted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nps.emit_event(new.tenant_id, 'nps.survey.drafted', nps.survey_payload(new));
  return new;
end;
$$;

create trigger nps_surveys_emit_drafted
  after insert on nps.surveys
  for each row execute function nps.on_survey_drafted();

create or replace function nps.on_survey_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform nps.emit_event(
      new.tenant_id,
      case when new.status = 'open' then 'nps.survey.opened'
           else 'nps.survey.closed' end,
      nps.survey_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger nps_surveys_emit_changed
  after update on nps.surveys
  for each row execute function nps.on_survey_changed();

create or replace function nps.on_response_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select title into v_title
    from nps.surveys where id = new.survey_id and tenant_id = new.tenant_id;

  -- ⚠️ SEM comentário e SEM respondente — LGPD-mínimo e payload leve: o
  -- correio entrega o fato (a nota), não a conversa.
  perform nps.emit_event(new.tenant_id, 'nps.response.recorded', jsonb_build_object(
    'surveyId',    new.survey_id,
    'surveyTitle', v_title,
    'score',       new.score,
    'respondedAt', new.responded_at
  ));
  return new;
end;
$$;

create trigger nps_responses_emit
  after insert on nps.responses
  for each row execute function nps.on_response_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- ⛔ ANON = NADA, sem exceção — o link público é integração futura (§5 da spec).
-- =============================================================================

revoke all on schema nps                  from public, anon, authenticated;
revoke all on all tables    in schema nps from public, anon, authenticated;
revoke all on all functions in schema nps from public, anon, authenticated;

grant usage on schema nps to authenticated;

grant select, insert, update on nps.surveys to authenticated;

-- ⭐ SÓ INSERT+SELECT: a opinião dada é a opinião dada.
grant select, insert on nps.responses to authenticated;

grant select on nps.survey_score to authenticated;

grant execute on function nps.can_access(uuid) to authenticated;

-- `nps.emit_event` NÃO é concedida. `nps.survey_payload` é encanamento
-- dos gatilhos. `anon` não recebe NADA — nem select.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum envio. Nenhum link anônimo. Nenhuma análise
-- de sentimento. Nenhuma meta (isso é o goal). Nenhum objeto fora de
-- `nps`. Nenhuma leitura de schema alheio.
-- =============================================================================
