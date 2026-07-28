-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0005_courier_cron.sql
-- LIGAR O CORREIO: o agendador e a visão de saúde da fila.
-- =============================================================================
--
-- NÃO APLICADO. `0001` e `0002` estão CONGELADAS (CLAUDE.md §5.4.1); `0003` e
-- `0004` seguem arquivo. Esta é a próxima da fila. Aplicar é ato do dono —
-- ver docs/runbook/APLICAR.md §6.
--
-- ⚠️ ESTE ARQUIVO SOZINHO NÃO LIGA NADA. Ele cria a visão de saúde (§1), que
-- funciona de imediato, e deixa o agendamento (§2) COMENTADO — porque agendar
-- exige duas coisas que só o dono tem: as extensões habilitadas no painel e a
-- URL/segredo do endpoint. Um `cron.schedule` com URL falsa criaria um job que
-- falha a cada minuto, para sempre, e enche o log de erro.
--
-- -----------------------------------------------------------------------------
-- POR QUE O CRON CHAMA UM ENDPOINT EM VEZ DE ENTREGAR EM SQL
-- -----------------------------------------------------------------------------
-- Seria possível escrever a entrega inteira em PL/pgSQL: os dois consumidores
-- de hoje (trilha e projeção de verba) são gravações no próprio banco.
--
-- **Não foi feito, e a razão é a Lei do Sol Único.** A lógica de entrega —
-- tomar o lote, registrar por consumidor, despachar, calcular backoff, desistir
-- em `dead` — já existe em `@alsham/workflow`, com 19 testes. Reescrevê-la em
-- SQL criaria uma SEGUNDA implementação da mesma garantia, em outra linguagem,
-- que diverge da primeira no dia em que alguém corrigir só um lado.
--
-- Este repositório já pagou para aprender isso: a Etapa 8 descobriu que o
-- correio marcava como entregue um evento cujo handler nunca teve sucesso. A
-- correção foi feita num lugar só. Com duas implementações, teria sido feita
-- em um e esquecida no outro.
--
-- Custo aceito: o agendador precisa de rede (`pg_net`) e o endpoint precisa de
-- segredo. Está tudo em §2 e no runbook.
--
-- =============================================================================

-- =============================================================================
-- 1. A VISÃO DE SAÚDE — funciona assim que este arquivo for aplicado
-- -----------------------------------------------------------------------------
-- É por aqui que o dono vê se o correio está andando, sem abrir código.
--
-- ⚠️ O número que importa NÃO é quantos estão parados: é **há quanto tempo o
-- mais antigo espera**. Um `pending` alto logo depois de um pico é normal; um
-- `pending` VELHO significa que o correio não está rodando. Uma contagem
-- sozinha não distingue as duas coisas.
-- =============================================================================

create or replace view core.courier_health as
select
  status,
  count(*)                                                    as eventos,
  min(coalesce(next_attempt_at, occurred_at))                 as vencimento_mais_antigo,
  floor(
    extract(epoch from (now() - min(coalesce(next_attempt_at, occurred_at)))) / 60
  )::bigint                                                   as espera_minutos,
  max(attempts)                                               as maior_numero_de_tentativas
from core.event_outbox
group by status;

comment on view core.courier_health is
  'Saúde da caixa de saída. pending crescendo e VELHO = o correio não está rodando. dead > 0 = conferência humana.';

-- -----------------------------------------------------------------------------
-- O veredito em uma linha, para quem não quer interpretar a tabela.
--
-- SECURITY INVOKER de propósito: roda sob a RLS de quem chama. Como
-- `core.event_outbox` não tem policy para `authenticated` (negação por
-- ausência), um usuário do painel não lê nada aqui — e é assim que se quer.
-- Quem confere é o dono, com privilégio de serviço.
-- -----------------------------------------------------------------------------

create or replace function core.courier_status()
returns table (veredito text, detalhe text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mortos  bigint;
  v_espera  bigint;
  v_parados bigint;
begin
  select count(*) into v_mortos from core.event_outbox where status = 'dead';

  select count(*),
         coalesce(floor(extract(epoch from (now() - min(coalesce(next_attempt_at, occurred_at)))) / 60), 0)
    into v_parados, v_espera
    from core.event_outbox
   where status in ('pending', 'failed');

  if v_mortos > 0 then
    return query select 'ATENCAO'::text,
      format('%s evento(s) morto(s): esgotaram as tentativas e continuam gravados, com o erro. Pede olho humano.', v_mortos);
    return;
  end if;

  if v_parados = 0 then
    return query select 'OK'::text, 'Nada parado na caixa.'::text;
    return;
  end if;

  -- Os limiares são para um ciclo de 1 minuto. **NÃO VERIFICADOS** contra
  -- operação real (Lei 7) — quem medir, troca.
  if v_espera >= 30 then
    return query select 'PARADO'::text,
      format('O mais antigo espera há %s min. O correio provavelmente não está rodando.', v_espera);
  elsif v_espera >= 10 then
    return query select 'ATRASADO'::text,
      format('O mais antigo espera há %s min — mais que o esperado para um ciclo de 1 min.', v_espera);
  else
    return query select 'OK'::text, format('%s na fila, o mais antigo há %s min.', v_parados, v_espera);
  end if;
end;
$$;

comment on function core.courier_status() is
  'O veredito da fila em uma linha: OK, ATRASADO, PARADO ou ATENCAO.';

-- Nem a visão nem a função são concedidas a `authenticated` ou `anon`.
-- Operação é assunto de quem opera.
revoke all on core.courier_health          from public, anon, authenticated;
revoke all on function core.courier_status() from public, anon, authenticated;

-- =============================================================================
-- 2. O AGENDAMENTO — ⚠️ COMENTADO DE PROPÓSITO
-- =============================================================================
--
-- Descomente **depois** de fazer as três coisas do runbook §6:
--
--   1. habilitar `pg_cron` e `pg_net` no painel (Database → Extensions);
--   2. subir o `apps/api` em algum lugar com HTTPS, com `DATABASE_URL` e
--      `COURIER_SECRET` configurados;
--   3. guardar a URL e o segredo no Vault do Supabase — **nunca** em texto
--      dentro de uma migration, que é arquivo público deste repositório.
--
-- ⛔ O `insert` no Vault NÃO está aqui, e não pode estar: uma migration com
--    segredo dentro é um segredo commitado.
--
-- ```sql
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- -- Uma rodada por minuto. O correio é idempotente por consumidor e a tomada
-- -- tem arrendamento, então uma rodada que pegue a anterior ainda em curso
-- -- não duplica entrega — ela simplesmente não encontra os eventos tomados.
-- select cron.schedule(
--   'correio-do-core',
--   '* * * * *',
--   $job$
--     select net.http_post(
--       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'courier_url'),
--       headers := jsonb_build_object(
--                    'content-type',      'application/json',
--                    'x-correio-secret',  (select decrypted_secret from vault.decrypted_secrets where name = 'courier_secret')
--                  ),
--       body    := '{}'::jsonb,
--       timeout_milliseconds := 25000
--     );
--   $job$
-- );
-- ```
--
-- Para desligar: `select cron.unschedule('correio-do-core');`
-- Para ver as últimas execuções: `select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'correio-do-core')
--   order by start_time desc limit 20;`
--
-- ⚠️ `net.http_post` é **assíncrono**: o `cron` dispara e não espera resposta.
-- Ele não vai acusar erro se o endpoint responder 401 ou 500 — o retorno fica
-- em `net._http_response`. Por isso a conferência de verdade é a §1 acima: se
-- o `pending` não cai, o correio não está entregando, não importa o que o
-- `cron.job_run_details` diga.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum job criado.
-- A visão de saúde está de pé; o agendamento é ato do dono.
-- =============================================================================
