-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0008_recon_ap_projection.sql
-- A porta pela qual o `recon` recebe um título vindo de FORA dele.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §8.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION É SEPARADA DA `0007_ap.sql`
-- -----------------------------------------------------------------------------
-- Porque **cada migration tem um schema dono**. `0007` só cria objeto em `ap`;
-- esta só cria objeto em `recon`. Escrever uma função `recon.*` dentro do
-- arquivo do módulo de Contas a Pagar seria um módulo mexendo na casa do outro
-- — e obrigaria a guarda de CI "módulo não conhece módulo" a aprender uma
-- exceção. Guarda com exceção é guarda que um dia aceita tudo.
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE ESTA MIGRATION PROVA — E O QUE ELA NÃO PRECISOU MUDAR
-- -----------------------------------------------------------------------------
-- `recon.payables` nasceu na Etapa 2 com `source in ('imported','event')`,
-- `source_module_id` e `unique (tenant_id, external_ref)`. Nenhuma linha do
-- `0002_recon.sql` muda aqui. A tabela foi desenhada esperando um módulo que
-- ainda não existia, e quando ele chegou coube — é essa a prova do Lego.
--
-- Esta migration não acrescenta coluna, não acrescenta tabela e não relaxa
-- constraint nenhuma. Ela só abre a **porta de escrita** que faltava.
--
-- -----------------------------------------------------------------------------
-- ⛔ O QUE ESTA FUNÇÃO NÃO FAZ, E É DELIBERADO
-- -----------------------------------------------------------------------------
-- Ela **não sabe quem é o produtor**. Recebe `p_source_module_id` como
-- argumento e o grava como veio. Não há `'accounts-payable'` nem `'ap'` escrito
-- em lugar nenhum deste arquivo, e não vai haver: a procedência é um dado do
-- envelope do evento, não uma constante de quem projeta. Se amanhã um segundo
-- módulo — ou uma integração de ERP — passar a emitir `*.payable.registered`,
-- esta porta serve os dois sem uma linha de diferença.
--
-- Ela **não lê `ap.payables`**. Tudo o que grava vem do payload, que o `0007`
-- montou autossuficiente exatamente para isso.
-- =============================================================================

-- =============================================================================
-- 1. `recon.record_external_payable` — projetar um título de origem externa
-- -----------------------------------------------------------------------------
-- IDEMPOTENTE por `(tenant_id, external_ref)`: o correio reentrega, e reentrega
-- é normal — a caixa de saída garante *ao menos uma vez*, nunca *exatamente uma
-- vez*. Projetar duas vezes tem de dar o mesmo resultado que projetar uma.
--
-- Devolve TEXTO, não contagem, porque há quatro desfechos e três deles são
-- sucesso. Colapsá-los num número esconderia justamente o quarto:
--
--   'created'          — o título não existia; agora existe.
--   'updated'          — a projeção existia e mudou (valor, data, status).
--   'unchanged'        — reentrega do mesmo fato. O caso comum, e é silencioso.
--   'skipped-imported' — ⚠️ já havia um título com essa referência, digitado ou
--                        importado por uma pessoa deste tenant. A projeção NÃO
--                        o sobrescreve: o que um humano registrou aqui é
--                        verdade local do `recon`, e um evento não apaga
--                        trabalho de gente. O desfecho é devolvido para quem
--                        chamou poder registrá-lo; não é erro, e por isso não
--                        levanta exceção — evento que falha para sempre entope
--                        a fila sem consertar nada.
-- =============================================================================

create or replace function recon.record_external_payable(
  p_tenant_id            uuid,
  p_source_module_id     text,
  p_external_ref         text,
  p_due_date             date,
  p_amount_cents         bigint,
  p_currency             char(3),
  p_status               text,
  p_settled_amount_cents bigint default 0,
  p_supplier_name        text   default null,
  p_supplier_tax_id      text   default null,
  p_description          text   default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing recon.payables;
  v_touched  integer;
begin
  -- A procedência é obrigatória e vem de quem chama. Sem ela, a linha violaria
  -- `payables_source_coherent` de qualquer forma — mas errar aqui, com nome,
  -- é melhor do que errar lá com número de constraint.
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'recon.record_external_payable: origem do título não informada'
      using errcode = '22023';
  end if;

  if p_status not in ('open', 'partially_settled', 'settled', 'cancelled') then
    raise exception 'recon.record_external_payable: estado % não reconhecido', p_status
      using errcode = '22023';
  end if;

  select * into v_existing
    from recon.payables
   where tenant_id = p_tenant_id
     and external_ref = p_external_ref;

  -- ⚠️ Mão humana ganha do evento. Ver o cabeçalho.
  if found and v_existing.source = 'imported' then
    return 'skipped-imported';
  end if;

  if not found then
    insert into recon.payables (
      tenant_id, source, source_module_id, external_ref,
      due_date, amount_cents, settled_amount_cents, currency,
      supplier_name, supplier_tax_id, description, status
    )
    values (
      p_tenant_id, 'event', p_source_module_id, p_external_ref,
      p_due_date, p_amount_cents, coalesce(p_settled_amount_cents, 0), p_currency,
      p_supplier_name, p_supplier_tax_id, coalesce(p_description, ''), p_status
    );
    return 'created';
  end if;

  -- Existe e é projeção. Só escreve se algo mudou de fato — `update` que não
  -- muda nada ainda assim mexe em `updated_at` e acorda trigger, e a reentrega
  -- é o caso COMUM, não a exceção.
  update recon.payables p
     set source_module_id     = p_source_module_id,
         due_date             = p_due_date,
         amount_cents         = p_amount_cents,
         settled_amount_cents = coalesce(p_settled_amount_cents, 0),
         currency             = p_currency,
         supplier_name        = p_supplier_name,
         supplier_tax_id      = p_supplier_tax_id,
         description          = coalesce(p_description, ''),
         status               = p_status,
         updated_at           = now()
   where p.tenant_id    = p_tenant_id
     and p.external_ref = p_external_ref
     and (p.source_module_id, p.due_date, p.amount_cents, p.settled_amount_cents,
          p.currency, p.supplier_name, p.supplier_tax_id, p.description, p.status)
         is distinct from
         (p_source_module_id, p_due_date, p_amount_cents, coalesce(p_settled_amount_cents, 0),
          p_currency, p_supplier_name, p_supplier_tax_id, coalesce(p_description, ''), p_status);

  get diagnostics v_touched = row_count;
  return case when v_touched > 0 then 'updated' else 'unchanged' end;
end;
$$;

comment on function recon.record_external_payable(uuid, text, text, date, bigint, char, text, bigint, text, text, text) is
  'Projeta no recon um título vindo de OUTRO módulo, pelo payload do evento. Idempotente por (tenant_id, external_ref). Nunca sobrescreve título importado por uma pessoa. Não sabe — e não pode saber — quem é o produtor: a procedência vem por argumento.';

-- =============================================================================
-- 2. FECHAMENTO DE PRIVILÉGIOS
-- -----------------------------------------------------------------------------
-- Quem chama é o CORREIO, com `service_role`, do servidor. `authenticated` não
-- recebe: conceder aqui daria à tela do cliente a caneta para inventar um
-- título "vindo de outro módulo" — origem forjada, e forjada por dentro da RLS.
-- =============================================================================

revoke all on function recon.record_external_payable(uuid, text, text, date, bigint, char, text, bigint, text, text, text)
  from public, anon, authenticated;

-- =============================================================================
-- FIM. Nenhuma coluna nova. Nenhum INSERT. Nenhum objeto fora de `recon`.
-- Nenhuma menção ao nome do módulo que produz o evento.
-- =============================================================================
