-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0022_revoke_public_execute.sql
-- Fecha o EXECUTE que o PostgreSQL concede a PUBLIC por padrão.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §15.
--
-- -----------------------------------------------------------------------------
-- ⭐ COMO ISTO APARECEU — e por que é migration nova, não uma edição
-- -----------------------------------------------------------------------------
-- Na Etapa 15, uma sabotagem simples foi executada contra a guarda de CI nova:
-- **apagar o `grant execute` da leitura do plano** e conferir se o CI
-- reclamava que o Painel deixaria de carregar.
--
-- **A guarda não reclamou.** O privilégio continuava lá.
--
-- O motivo é uma regra do PostgreSQL que não perdoa distração: **toda função
-- nasce com `EXECUTE` concedido a `PUBLIC`.** Diferente de tabela, que nasce
-- fechada, a função nasce aberta. Quer dizer que:
--
--   · o `grant execute ... to authenticated` que se escreve depois de um
--     `create function` normalmente **não concede nada** — o privilégio já
--     estava lá, herdado de `PUBLIC`;
--   · e, pior, **`anon` também o herdou** — o papel de quem nem fez login.
--
-- `0001_core.sql` sabia disso e termina com
-- `revoke all on all functions in schema core from public, anon, authenticated`.
-- O mesmo fazem `0002`, `0004`, `0007`, `0009`, `0010`, `0017` e `0018` para os
-- seus schemas. **O que escapa é a função criada DEPOIS daquele revoke** — e o
-- `core` recebeu várias, em migrations posteriores, cada uma fechando o próprio
-- objeto e nenhuma refazendo o bloqueio de bloco.
--
-- Contadas no banco (Postgres 17 limpo, cadeia `0001`→`0021` + seed), as
-- funções que `anon` podia executar eram **oito**:
--
--     core.can_generate            core.emit_event
--     core.install_module          core.tenant_courier_summary
--     core.tenant_plan_usage       core.uninstall_module
--     core.usage_in_period         recon.on_match_decided
--
-- ⚠️ **Nenhuma delas vaza dado hoje**, e isso precisa ser dito com precisão em
-- vez de com alívio: todas checam `core.has_permission()` ou
-- `core.is_tenant_member()`, que passam por `auth.uid()`; para `anon` o uid é
-- nulo, a checagem falha e a função levanta exceção. **A porta está trancada
-- por dentro.** O defeito é que ela não devia estar no corredor.
--
-- É defesa em profundidade, que é exatamente a lição paga P0 do Balanço §5: a
-- RLS aberta do `suna-core` também "não vazava" enquanto o app fosse correto.
--
-- ⛔ **Por que migration nova, e não correção nos arquivos:** `0001`, `0003` e
-- `0006` estão APLICADAS em produção (CLAUDE.md §5.4.1). Arquivo aplicado é
-- história; editá-lo faria o próximo ambiente nascer diferente da produção em
-- silêncio. `0019` e `0021` — que ainda são só arquivo — foram corrigidos no
-- lugar, e este arquivo cobre os dois de qualquer forma, para que a ordem de
-- aplicação não importe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FECHAR EM BLOCO
-- -----------------------------------------------------------------------------
-- ⚠️ `from public, anon` — **não de `authenticated`**. Revogar de `PUBLIC` não
-- toca em concessão explícita; tirar de `authenticated` aqui derrubaria as
-- concessões legítimas que as migrations anteriores fizeram uma a uma, e o
-- portal inteiro pararia. O alvo é a herança, não a autorização.
revoke all privileges on all functions in schema core      from public, anon;
revoke all privileges on all functions in schema recon     from public, anon;
revoke all privileges on all functions in schema marketing from public, anon;
revoke all privileges on all functions in schema ap        from public, anon;
revoke all privileges on all functions in schema crm       from public, anon;
revoke all privileges on all functions in schema ar        from public, anon;
revoke all privileges on all functions in schema po        from public, anon;
revoke all privileges on all functions in schema ops       from public, anon;

-- -----------------------------------------------------------------------------
-- 2. E DEVOLVER, EXPLICITAMENTE, O QUE O PORTAL PRECISA
-- -----------------------------------------------------------------------------
-- ⛔ **Estas duas nunca tiveram concessão explícita.** O clique de instalar na
-- Store funciona hoje **por causa do buraco** que este arquivo fecha: o
-- privilégio vinha de `PUBLIC`. Sem as duas linhas abaixo, o passo 1 quebraria
-- a Store — e quebraria de um jeito que só apareceria no clique, não no apply.
--
-- Que a autorização certa estivesse ausente e o sistema funcionasse assim
-- mesmo é o retrato do problema: **não dava para saber quem podia instalar
-- olhando o código.** Agora dá.
grant execute on function core.install_module(uuid, text, text)   to authenticated;
grant execute on function core.uninstall_module(uuid, text)       to authenticated;

-- ⚠️ E as três da Etapa 15 e da forja, que o `0021`/`0019` já concedem — aqui
-- de novo porque o `revoke ... on all functions` acima passa por cima delas se
-- este arquivo for aplicado depois. Conceder duas vezes é inofensivo; deixar
-- de conceder faz o Painel carregar vazio sem dizer por quê, que é o modo de
-- falha que este repositório já pagou três vezes.
grant execute on function core.tenant_courier_summary(uuid) to authenticated;
grant execute on function core.tenant_plan_usage(uuid)      to authenticated;
grant execute on function core.can_generate(uuid)           to authenticated;

-- -----------------------------------------------------------------------------
-- 3. O QUE CONTINUA FECHADO, E É PARA CONTINUAR
-- -----------------------------------------------------------------------------
-- Nenhuma linha devolve `core.emit_event`, `core.usage_in_period`,
-- `core.courier_status`, `core.tenant_courier_view`,
-- `core.emit_generation_event` ou `recon.on_match_decided`:
--
--   · `emit_event` e `emit_generation_event` são a porta dos módulos, chamadas
--     de dentro de funções `security definer`. Ninguém emite fato à mão.
--   · `usage_in_period` e `courier_status` são operação — assunto de quem opera.
--   · `tenant_courier_view` devolve o `detalhe` GLOBAL; é encanamento da
--     `summary`, e é justamente esse detalhe que não pode sair (`0021`).
--   · `on_match_decided` é função de trigger. Trigger não se chama; se dispara.
--
-- ⚠️ **Função `security definer` chamável por `anon` é uma superfície que não
-- precisa existir.** Quem não fez login não tem o que perguntar sobre tenant
-- nenhum, e a resposta certa a essa pergunta é "erro de permissão", não "erro
-- de negócio".
-- =============================================================================
-- FIM. Nenhum dado tocado. Nenhuma tabela alterada. Nenhuma regra de negócio
-- mudou — só quem tem a chave da porta.
-- =============================================================================
