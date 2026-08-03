# Mandato de Beleza · Bloco RH — prova da auditoria (nenhuma tela convertida)

**Frente 2 — Bloco RH.** As 5 telas do RH foram auditadas contra a régua do Mandato
de Beleza (lista solta → tabela · form-por-item → card · terceiro padrão → não forçar).
O resultado é honesto e é o mesmo para as cinco: **nenhuma delas se converte nesta
passada, porque nenhuma exibe registro algum.**

## O que a auditoria encontrou

As 5 páginas (`colaboradores`, `escalas`, `treinamentos`, `avaliacoes`, `politicas`)
são **stubs de "próxima frente"** — cada uma renderiza apenas `PageHero` + `EmptyState`
("A tela detalhada é a próxima frente"). Elas foram criadas assim na Missão Oito, quando
os módulos `hr`/`shift`/`train`/`perf`/`pol` nasceram no banco e no motor de domínio, com
a interface rica declarada, na própria spec de cada módulo (§3), como frente de UI à parte.

Prova estrutural (verificada no disco):

- **Sem porta de dados.** Não existe `hr-port.ts`, `shift-port.ts`, `train-port.ts`,
  `perf-port.ts` nem `pol-port.ts` em `apps/portal/src/lib/data/`. As telas convertidas
  do Financeiro/Comercial, por contraste, carregam porta real (`getContractPort`,
  `getLeadPort`, …) e renderizam um componente de listagem.
- **Sem import de domínio.** As telas não importam `@alsham/hr` etc. — as ocorrências de
  `@alsham/*` nelas são **texto do subtítulo**, não `import`.
- **Zero registro na tela.** Não há lista solta, nem cards de registro, nem form-por-item.
  Não há o que reposicionar em tabela.

## Classificação pela régua

| Tela | Módulo | Estado | Classificação | Ação |
|---|---|---|---|---|
| Colaboradores | `hr` | stub (PageHero+EmptyState) | não se aplica — sem dados | **não convertida** |
| Escalas | `shift` | stub (PageHero+EmptyState) | não se aplica — sem dados | **não convertida** |
| Treinamentos | `train` | stub (PageHero+EmptyState) | não se aplica — sem dados | **não convertida** |
| Avaliações | `perf` | stub (PageHero+EmptyState) | não se aplica — sem dados | **não convertida** |
| Políticas | `pol` | stub (PageHero+EmptyState) | não se aplica — sem dados | **não convertida** |

É o mesmo espírito da prova do Funil (kanban mantido, não forçado): reportar e manter, não
forçar. A diferença é o motivo — o Funil **tem** dados que leem melhor como quadro; estas
telas **não têm dados** ainda.

## Por que não forçar (e por que não inventar)

Converter qualquer uma exigiria uma de duas coisas, ambas fora do lugar:

1. **Fabricar dados** para preencher a tabela — proibido pela Lei 3 (zero mock/fake/lorem
   na tela) e pela Lei 7 (nenhuma promessa vai ao ar sem estar construída e provada). As
   próprias telas prometem, por escrito, "sem dado fabricado até lá".
2. **Construir a frente de UI inteira** (porta de dados `hr`/`shift`/… + adaptadores mock e
   Supabase + componentes de listagem/detalhe), que é justamente a "próxima frente de UI
   própria" que cada tela declara — trabalho de construção de frente, não uma passada de
   beleza sobre apresentação existente. O Mandato de Beleza reposiciona o que já existe;
   aqui não há apresentação a reposicionar.

## Decisão que fica para o dono

A beleza do Bloco RH (o padrão tabela-de-verdade, reusando `components/table.tsx`) só se
aplica **depois** que as 5 telas ganharem sua frente de UI (porta de dados + listagem).
Enquanto forem stubs honestos, não há tabela a fazer. Quando a frente de RH for construída,
as telas nascem já no padrão tabela — e aí a conversão é uma passada de apresentação, como
foi no Financeiro e no Comercial.
