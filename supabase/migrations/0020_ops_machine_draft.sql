-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0020_ops_machine_draft.sql
-- O entregável passa a saber QUEM o produziu. Objeto no schema `ops`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §12.
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE ESTE ARQUIVO EXISTE SEPARADO DO `0019_forge.sql`
-- -----------------------------------------------------------------------------
-- A forja é do **Core**; esta coluna é do **módulo da esteira**. Pôr as duas
-- coisas no mesmo arquivo faria uma migration do Core escrever no schema de um
-- módulo — e a guarda "módulo não conhece módulo" precisaria aprender uma
-- exceção.
--
-- É exatamente a decisão da Etapa 10, e ela está escrita na guarda de CI:
-- *"`0008_recon_ap_projection.sql` NÃO entra nesta lista, e não é exceção: ela
-- é uma migration do `recon`, e o que ela cria é objeto `recon.*`. Por isso ela
-- existe separada da `0007` — se a porta de projeção morasse dentro do arquivo
-- do módulo de Contas a Pagar, esta guarda precisaria aprender a ignorar um
-- caso."*
--
-- Mesma forma, terceira vez: **arquivo separado, dono claro, guarda sem
-- exceção.**
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE A COLUNA NÃO NASCEU NO `0018_ops.sql`
-- -----------------------------------------------------------------------------
-- Porque, na Etapa 13, a geração por máquina **não existia**. Uma coluna criada
-- para uma funcionalidade não construída é promessa em schema — e a Lei 7 vale
-- para o schema tanto quanto para a tela. A Etapa 13 registrou a pendência
-- (`MODULO-OPS-SPEC §7`) e a Etapa 14 a cumpre com `alter table`, que é como o
-- kraken-v2 fez as dele (`0018_image_redo_count.sql`, `0021_version_instruction.sql`).
-- =============================================================================

-- ⭐ A MARCA DO RASCUNHO DE MÁQUINA.
--
-- Sem ela, ninguém distingue o que a máquina propôs do que uma pessoa
-- entregou — e a revisão humana vira fé. A marca é o que dá sentido ao ciclo
-- inteiro: o operador pede, a máquina propõe, e **a pessoa decide**.
--
-- `default 'human'` para que as linhas que já existirem no dia do apply
-- continuem verdadeiras: elas foram registradas por pessoas, e marcar tudo
-- como máquina retroativamente seria escrever uma história que não aconteceu.
alter table ops.deliverables
  add column if not exists origin text not null default 'human'
    check (origin in ('human', 'machine'));

comment on column ops.deliverables.origin is
  'Quem produziu esta versão: uma pessoa ou o motor. Rascunho de máquina é marcado como tal — sem a marca, a revisão humana vira fé.';

-- ⭐ A LIGAÇÃO COM O REGISTRO DA FORJA, e por que ela é SOLTA.
--
-- `generation_id` aponta para `core.ai_generations`, **sem chave estrangeira**.
-- Não é descuido, é a mesma regra que rege a trilha (§4 do `0018_ops.sql`) e a
-- `core.audit_log` (CORE-SPEC §4): **o registro sobrevive ao dado**.
--
-- Com FK, uma política de retenção que limpasse gerações antigas — que é
-- decisão legítima do dono, porque prompt ocupa espaço e pode conter dado
-- sensível — arrastaria ou travaria os entregáveis. Sem FK, a limpeza acontece
-- e o entregável continua dizendo "isto veio da máquina".
alter table ops.deliverables
  add column if not exists generation_id uuid;

comment on column ops.deliverables.generation_id is
  'O pedido à forja que gerou esta versão. SOLTO, sem chave estrangeira: limpar gerações antigas não pode apagar nem travar o entregável.';

create index if not exists deliverables_machine_idx
  on ops.deliverables (tenant_id, order_id)
  where origin = 'machine';

-- =============================================================================
-- ⛔ O QUE **NÃO** MUDA, E É O PONTO
-- -----------------------------------------------------------------------------
-- Nenhuma policy. Nenhum GRANT. Nenhum gatilho.
--
-- O entregável de máquina entra pela MESMA porta do entregável humano — o
-- `insert` que exige `ops.order.manage` — e é imutável pelas MESMAS três
-- camadas. Refazer uma geração cria versão nova, exatamente como refazer uma
-- arte feita à mão.
--
-- ⭐ E o gatilho de §6.4 do `0011` continua escrevendo a linha na trilha sem
-- saber que a máquina existe: ele lê `kind`, `version` e `instruction`, e a
-- instrução do rascunho de máquina já vem dizendo quem a produziu. **Nenhuma
-- linha do `0018_ops.sql` mudou para esta etapa** — pela mesma razão que
-- nenhuma linha do `0002_recon.sql` mudou para o triângulo da Etapa 10: o
-- desenho previa que houvesse mais de uma origem, sem precisar saber quais.
-- =============================================================================

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum segredo. Nenhum objeto fora do schema `ops`.
-- =============================================================================
