-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0085_fiscalcert.sql
-- Módulo 70: Certificado Digital (metadados). Schema `fiscalcert`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §30, o
-- ÚNICO módulo da Onda Dezessete (Fase 2 — ABRE o Domain 🧾 Contábil & Fiscal, o
-- mais restrito do mapa POR LEI). Nasce sob `domain_key='accounting'`.
--
-- Taxonomia: Domain 🧾 Contábil & Fiscal (§5) — capacidade *Certificado digital*.
-- Spec: docs/canon/MODULO-FISCALCERT-SPEC.md
--
-- ⚠️ O `domain_key` é `accounting` (a chave canônica da store-taxonomy para
-- Contábil & Fiscal), CONFERIDA no arquivo antes de escrever esta migration.
--
-- -----------------------------------------------------------------------------
-- ⚠️⚠️ A LEI 3 MANDA AQUI — 7 das 8 capacidades ficam FORA, e não por preguiça
-- -----------------------------------------------------------------------------
-- O Domain Contábil & Fiscal tem 8 capacidades. Sete delas NÃO NASCEM como
-- schema neste produto — a Lei 3 (README/CLAUDE.md) é explícita: "folha
-- (eSocial), fiscal (NF/SPED/SAT) e PDV são empresas inteiras; por padrão,
-- INTEGRA-SE, construir só com decisão de dono explícita".
--
--   ⛔ NF-e · NFS-e · NFC-e · SPED · eSocial — são documentos/obrigações
--      EMITIDOS E VALIDADOS pelo Fisco: exigem certificado válido, assinatura
--      criptográfica e webservices governamentais homologados (SEFAZ, Receita,
--      eSocial) — na prática, uma biblioteca/parceiro fiscal CERTIFICADO.
--      Construí-los como schema seria fingir competência fiscal que este
--      produto não tem, e expor o cliente a autuação. É INTEGRAÇÃO, não módulo.
--   ⛔ Apuração de impostos — cálculo tributário correto depende de regime,
--      NCM, CFOP, substituição tributária: é motor de cálculo fiscal
--      certificado, não CRUD de Domain. FORA.
--   ⛔ Integração com contador — é, pelo nome, o PONTO DE INTEGRAÇÃO. O contato
--      do contador é o `crm` genérico (não se duplica). FORA.
--
-- Sobra UMA capacidade genuinamente construível sem tocar no Fisco:
-- *Certificado digital* — e mesmo ela, apenas o REGISTRO DE METADADOS.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — UM LEMBRETE DE VALIDADE, NÃO UM COFRE CRIPTOGRÁFICO
-- -----------------------------------------------------------------------------
-- `fiscalcert.certificates` guarda os METADADOS de um certificado digital: o
-- tipo, o titular e — o dado que justifica o módulo — QUANDO VENCE. É a agenda
-- que avisa "o e-CNPJ vence em 30 dias", não o lugar onde o certificado mora.
--
-- ⛔⛔ O QUE NÃO ENTRA, NEM AGORA NEM DISFARÇADO (e há guarda de CI):
--   • o ARQUIVO do certificado (.pfx/.p12) — Storage do Core, NÃO CONSTRUÍDO; e
--     mesmo se existisse, uma credencial privada jamais passaria pela Store
--     genérica sem uma decisão de segurança à parte;
--   • a CHAVE PRIVADA — nunca, em hipótese alguma, toca este banco;
--   • qualquer OPERAÇÃO DE ASSINATURA de documento — não existe aqui;
--   • ALERTA automático de vencimento — seria Engine de notificação (capacidade
--     futura). Este módulo GUARDA a data; quem avisa é outra frente.
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` — a física do `vendor`/`dc`, re-perguntada
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- certificado revogado, vencido ou trocado é ARQUIVADO, não apagado: o registro
-- histórico continua consultável (que certificado assinou o quê, quando). E se o
-- mesmo registro voltar a fazer sentido, `archived → active` existe. É a física
-- do `vendor` (relação que volta), não a do `hr` (desligamento terminal).
--
-- 🔴 Nenhuma leitura de schema alheio. Nenhum objeto fora de `fiscalcert`.
-- `consumes` VAZIO.
-- =============================================================================

create schema if not exists fiscalcert;

comment on schema fiscalcert is
  'Módulo Certificado Digital (metadados). Domain accounting (Contábil & Fiscal) da Taxonomia. Guarda os METADADOS de um certificado (tipo/titular/validade) — um lembrete de vencimento, NUNCA o arquivo .pfx, a chave privada ou uma operação de assinatura (tudo isso FORA por lei/segurança). As outras 7 capacidades do domínio são INTEGRAÇÃO (Lei 3), não módulo. tipo/titular TEXTO LIVRE; valid_until obrigatória. active ↔ archived (a física do vendor/dc). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function fiscalcert.emit_event(
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
  if p_event_type not like 'fiscalcert.%' then
    raise exception 'fiscalcert.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'fiscalcert',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function fiscalcert.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function fiscalcert.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'fiscalcert.certificate.manage')
      or core.has_permission(p_tenant_id, 'fiscalcert.certificate.decide');
$$;

create or replace function fiscalcert.touch_updated_at()
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
-- 2. CERTIFICATES — os METADADOS do certificado (nunca o certificado em si)
-- =============================================================================

create table fiscalcert.certificates (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O tipo em TEXTO LIVRE (e-CNPJ, e-CPF, e-NF-e...) — a legislação de
  -- certificação muda; congelar num enum envelheceria o produto.
  cert_type   text        not null check (length(btrim(cert_type)) > 0),
  -- O titular em TEXTO LIVRE (razão social, nome, CNPJ mascarado — o tenant
  -- descreve). Obrigatório e não-vazio.
  holder      text        not null check (length(btrim(holder)) > 0),
  -- A data de início da validade. OPCIONAL.
  valid_from  date,
  -- ⭐ A data de vencimento — OBRIGATÓRIA. É o dado que justifica o módulo:
  -- saber QUANDO VENCE.
  valid_until date        not null,
  -- ⭐ active ↔ archived (o certificado trocado/revogado é arquivado, não
  -- apagado — a física do vendor/dc).
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint fiscalcert_certificates_id_tenant unique (id, tenant_id),
  -- Coerência das datas: se há início, o vencimento não pode ser antes dele.
  constraint fiscalcert_certificates_dates check (
    valid_from is null or valid_until >= valid_from
  )
);

create index fiscalcert_certificates_roster_idx
  on fiscalcert.certificates (tenant_id, status, valid_until);

create trigger fiscalcert_certificates_touch
  before update on fiscalcert.certificates
  for each row execute function fiscalcert.touch_updated_at();

alter table fiscalcert.certificates enable row level security;
alter table fiscalcert.certificates force row level security;

create policy fiscalcert_certificates_select on fiscalcert.certificates
  for select to authenticated
  using (fiscalcert.can_access(tenant_id));

create policy fiscalcert_certificates_insert on fiscalcert.certificates
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'fiscalcert.certificate.manage'));

-- ⚠️ USING = can_access (não decide): quem só arquiva ALCANÇA a linha e bate no
-- gatilho, que decide — o padrão do vendor/mall.
create policy fiscalcert_certificates_update on fiscalcert.certificates
  for update to authenticated
  using (fiscalcert.can_access(tenant_id))
  with check (fiscalcert.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Certificado é história de assinatura —
-- arquivar é status, e `archived → active` existe.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function fiscalcert.guard_certificate_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o certificado nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger fiscalcert_certificates_stamp
  before insert on fiscalcert.certificates
  for each row execute function fiscalcert.guard_certificate_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/fiscalcert
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o certificado volta — a física do vendor).

create or replace function fiscalcert.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function fiscalcert.allowed_transition(text, text) is
  'Ciclo de vida do registro de certificado. Espelho de ALLOWED_TRANSITIONS em @alsham/fiscalcert. active ↔ archived: o certificado trocado/revogado é arquivado, não apagado, e o registro volta se voltar a fazer sentido (a física do vendor/dc).';

create or replace function fiscalcert.guard_certificate_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not fiscalcert.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do certificado', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'fiscalcert.certificate.decide') then
    raise exception 'arquivar ou reativar um certificado exige a permissão fiscalcert.certificate.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger fiscalcert_certificates_guard_status
  before update of status on fiscalcert.certificates
  for each row execute function fiscalcert.guard_certificate_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- -----------------------------------------------------------------------------
-- ⛔ O envelope carrega tipo/titular/validade — NUNCA nada que se pareça com o
-- certificado em si (não há o que carregar: ele não existe neste banco).
-- =============================================================================

create or replace function fiscalcert.certificate_payload(p fiscalcert.certificates)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'certificateId', p.id,
    'certType',      p.cert_type,
    'holder',        p.holder,
    'validFrom',     p.valid_from,
    'validUntil',    p.valid_until,
    'status',        p.status
  );
$$;

comment on function fiscalcert.certificate_payload(fiscalcert.certificates) is
  'O envelope de um certificado — AUTOSSUFICIENTE, só metadados. Quem escuta não faz join.';

create or replace function fiscalcert.on_certificate_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fiscalcert.emit_event(new.tenant_id, 'fiscalcert.certificate.registered', fiscalcert.certificate_payload(new));
  return new;
end;
$$;

create trigger fiscalcert_certificates_emit_registered
  after insert on fiscalcert.certificates
  for each row execute function fiscalcert.on_certificate_registered();

create or replace function fiscalcert.on_certificate_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform fiscalcert.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'fiscalcert.certificate.archived'
           else 'fiscalcert.certificate.restored' end,
      fiscalcert.certificate_payload(new)
    );
    return new;
  end if;

  if new.cert_type is distinct from old.cert_type
     or new.holder is distinct from old.holder
     or new.valid_from is distinct from old.valid_from
     or new.valid_until is distinct from old.valid_until
     or new.note is distinct from old.note then
    perform fiscalcert.emit_event(new.tenant_id, 'fiscalcert.certificate.updated', fiscalcert.certificate_payload(new));
  end if;

  return new;
end;
$$;

create trigger fiscalcert_certificates_emit_changed
  after update on fiscalcert.certificates
  for each row execute function fiscalcert.on_certificate_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema fiscalcert                  from public, anon, authenticated;
revoke all on all tables    in schema fiscalcert from public, anon, authenticated;
revoke all on all functions in schema fiscalcert from public, anon, authenticated;

grant usage on schema fiscalcert to authenticated;

grant select, insert, update on fiscalcert.certificates to authenticated;

grant execute on function fiscalcert.can_access(uuid) to authenticated;

-- `fiscalcert.emit_event` NÃO é concedida. `fiscalcert.certificate_payload` é
-- encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum arquivo .pfx. Nenhuma chave privada. Nenhuma assinatura. Nenhum
-- alerta automático. Nenhum enum de tipo. Nenhum objeto fora de `fiscalcert`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO. As outras 7 capacidades
-- do domínio são INTEGRAÇÃO (Lei 3), declaradas FORA.
-- =============================================================================
