-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0021_tenant_panel.sql
-- O Painel Executivo — leitura segura, do tenant. Objetos no schema `core`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §14.
--
-- -----------------------------------------------------------------------------
-- ⭐ O PROBLEMA QUE ESTE ARQUIVO RESOLVE, E POR QUE ELE NÃO É "UM GRANT"
-- -----------------------------------------------------------------------------
-- O Painel precisa mostrar a **saúde do correio ao vivo**. A função que a
-- responde já existe desde a Etapa 8 — `core.courier_status()` — e ela está
-- **fechada de propósito**:
--
--     revoke all on core.courier_health          from public, anon, authenticated;
--     revoke all on function core.courier_status() from public, anon, authenticated;
--     -- "Nem a visão nem a função são concedidas. Operação é assunto de quem opera."
--
-- ⛔ **Conceder aquela função ao tenant seria o erro.** Ela conta a fila
-- INTEIRA da plataforma: quantos eventos pendentes existem, de todos os
-- tenants, e há quantos minutos. Isso é volume de negócio dos vizinhos — um
-- cliente saberia, pelo número, quando outro está importando um extrato grande.
--
-- A resposta é uma função NOVA que devolve **o veredito e só os números do
-- próprio tenant**. O tenant sabe se o correio está entregando; não sabe quanto
-- o vizinho produziu.
--
-- ⚠️ **`security definer` com a checagem de vínculo na PRIMEIRA linha.** É a
-- mesma disciplina de `core.install_module()`: função que roda com o privilégio
-- do dono não pode confiar no `p_tenant_id` que recebeu.
-- =============================================================================

create or replace function core.tenant_courier_view(p_tenant_id uuid)
returns table (
  veredito        text,
  detalhe         text,
  meus_pendentes  bigint,
  meus_mortos     bigint,
  meu_atraso_min  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_veredito text;
  v_detalhe  text;
begin
  -- (1) QUEM. Sem vínculo ativo, não há resposta — nem um veredito genérico,
  -- que já seria informação de operação.
  if not core.is_tenant_member(p_tenant_id) then
    raise exception 'sem vínculo com este tenant' using errcode = '42501';
  end if;

  -- (2) O VEREDITO é o da plataforma, porque a fila é uma só e o correio ou
  -- está entregando ou não está. É a única coisa global que sai daqui — e é
  -- **texto**, não número: "OK", "ATRASADO", "PARADO". Não dá para inferir
  -- volume de vizinho a partir de uma palavra.
  select cs.veredito, cs.detalhe into v_veredito, v_detalhe
    from core.courier_status() cs;

  -- (3) OS NÚMEROS são só os DESTE tenant.
  return query
  select
    v_veredito,
    v_detalhe,
    (select count(*) from core.event_outbox
      where tenant_id = p_tenant_id and status in ('pending', 'failed')),
    (select count(*) from core.event_outbox
      where tenant_id = p_tenant_id and status = 'dead'),
    (select coalesce(
       floor(extract(epoch from (now() - min(coalesce(next_attempt_at, occurred_at)))) / 60),
       0)::bigint
       from core.event_outbox
      where tenant_id = p_tenant_id and status in ('pending', 'failed'));
end;
$$;

comment on function core.tenant_courier_view(uuid) is
  'A saúde do correio COMO O TENANT PODE VÊ-LA: o veredito da plataforma (texto) e os números do próprio tenant. Nunca a fila do vizinho.';

-- ⚠️ O `detalhe` da função global cita a contagem GLOBAL de eventos parados.
-- Repassá-lo ao tenant vazaria justamente o número que a decisão acima
-- protege. Esta função devolve o veredito e SUBSTITUI o detalhe por uma frase
-- que não carrega número de ninguém.
create or replace function core.tenant_courier_summary(p_tenant_id uuid)
returns table (veredito text, detalhe text, meus_pendentes bigint, meus_mortos bigint, meu_atraso_min bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.veredito,
    case v.veredito
      when 'OK'       then 'O correio está entregando normalmente.'
      when 'ATRASADO' then 'O correio está entregando com atraso. Os fatos não se perdem — a caixa de saída guarda e reentrega.'
      when 'PARADO'   then 'O correio não está entregando agora. Nada se perde: a caixa de saída guarda tudo e reentrega quando ele voltar.'
      else 'Há evento que esgotou as tentativas. Ele continua gravado, com o erro — precisa de olho humano.'
    end,
    v.meus_pendentes, v.meus_mortos, v.meu_atraso_min
  from core.tenant_courier_view(p_tenant_id) v;
$$;

comment on function core.tenant_courier_summary(uuid) is
  'O que o Painel do tenant mostra. O detalhe é reescrito sem número global — o do vizinho não é assunto dele.';

-- =============================================================================
-- ⭐ O CONSUMO DO PLANO — números CONTADOS, nunca estimados
-- -----------------------------------------------------------------------------
-- Lei 7 na tela: cada número do Painel tem de sair de um `count()` ou de uma
-- linha de `core.plan_limits`. Nenhum é derivado, arredondado ou "de exemplo".
--
-- ⚠️ Devolve uma linha POR MÉTRICA declarada no plano do tenant — inclusive as
-- que ele ainda não consumiu (com zero). Uma métrica que some da lista por
-- estar zerada faria o operador achar que ela não existe.
-- =============================================================================

create or replace function core.tenant_plan_usage(p_tenant_id uuid)
returns table (
  metric      text,
  limit_value bigint,
  used        bigint,
  on_exceed   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.is_tenant_member(p_tenant_id) then
    raise exception 'sem vínculo com este tenant' using errcode = '42501';
  end if;

  return query
  select
    pl.metric,
    pl.limit_value,
    coalesce((
      select sum(u.quantity)
        from core.usage_ledger u
       where u.tenant_id = p_tenant_id
         and u.metric    = pl.metric
         and u.period    = to_char(now(), 'YYYY-MM')
    ), 0)::bigint,
    pl.on_exceed
  from core.plan_limits pl
  join core.tenants t on t.plan_code = pl.plan_code
 where t.id = p_tenant_id
 order by pl.metric;
end;
$$;

comment on function core.tenant_plan_usage(uuid) is
  'O consumo do mês contra o teto do plano, por métrica. Contado, nunca estimado (Lei 7).';

-- =============================================================================
-- FECHAMENTO
-- -----------------------------------------------------------------------------
-- ⛔ `core.courier_status()` e `core.courier_health` CONTINUAM fechados. O que
-- se concede é a leitura ESTREITA, e só ela.
-- =============================================================================

-- ⚠️ **REVOGAR ANTES DE CONCEDER — e isto NÃO é cerimônia.**
--
-- No PostgreSQL, toda função nasce com `EXECUTE` para `PUBLIC`. Quer dizer que
-- as três funções acima já eram chamáveis por `anon` no instante em que o
-- `create` terminou, e que os dois `grant` abaixo, sozinhos, não concedem nada
-- que já não estivesse concedido — eles apenas *parecem* ser a autorização.
--
-- ⛔ A sabotagem que descobriu isto foi apagar o `grant` do consumo do plano e
-- conferir se a guarda de CI reclamava. **Ela não reclamou** — porque o
-- privilégio continuava lá, herdado de `PUBLIC`. Uma autorização que não pode
-- ser retirada não é autorização; é decoração.
--
-- É por isso que `0001_core.sql` faz `revoke all on all functions in schema
-- core` no fim. Estas funções nasceram DEPOIS daquele revoke, então precisam
-- do seu próprio — e é ele que faz o `grant` seguinte significar alguma coisa.
revoke all on function core.tenant_courier_summary(uuid) from public, anon, authenticated;
revoke all on function core.tenant_plan_usage(uuid)      from public, anon, authenticated;

-- ⚠️ E `anon` fica de fora de propósito. As três checam o vínculo e recusariam
-- de qualquer forma — mas quem não está autenticado não tem o que perguntar
-- sobre um tenant, e uma função a menos exposta é uma superfície a menos.
grant execute on function core.tenant_courier_summary(uuid) to authenticated;
grant execute on function core.tenant_plan_usage(uuid)      to authenticated;

-- ⛔ A `tenant_courier_view` é o encanamento da `summary` — ela devolve o
-- `detalhe` GLOBAL, e é justamente esse que não pode sair. Não se concede.
revoke all on function core.tenant_courier_view(uuid) from public, anon, authenticated;

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhuma tabela nova — o Painel LÊ; ele
-- não guarda nada. Um painel com tabela própria é um painel que precisa ser
-- mantido em dia com a verdade, e a verdade já está nas outras.
-- =============================================================================
