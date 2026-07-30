# 🏭 MÓDULO 17 — MANUTENÇÃO

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `mnt` ou no pacote
> `@alsham/maintenance`.
>
> **Leia junto com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)** — a física do
> trabalho que aqui é re-perguntada e MANTIDA — e com
> [MODULO-DUN-SPEC](MODULO-DUN-SPEC.md), o molde da fila calculada por
> data sem cron fingido.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `mnt`.** `maintenance` inteiro não é greppável no padrão dos
eventos; `mnt` é a abreviação consagrada do ofício. Conferido por grep com
fronteira de palavra: zero colisões.

**`domain_key` = `operations`** — Taxonomia §5, bloco **🏭 Operações (10)**,
capacidade **Manutenção**. *Facilities* e *Patrimônio* são vizinhas —
Patrimônio é a **Onda 2** da campanha, e o vínculo já nasce SOLTO
(`asset_id` uuid + alvo carimbado em texto) para não fechar aquela porta.

**⭐ `corrective`/`preventive` É CHECK — argumentado, não copiado.** A Lei
das Etapas proíbe congelar vocabulário DE CASA; o tipo da manutenção é
FÍSICA DO DOMÍNIO: toda manutenção do mundo ou responde a uma falha que JÁ
aconteceu ou antecipa uma que ainda NÃO — a oficina, o shopping e a usina
usam as duas palavras com o mesmo sentido, e não há terceiro caso
("preditiva" é preventiva com outro instrumento de decisão). Quem discordar
refuta no arquivo, por escrito.

**⭐ `done → in_progress` EXISTE — o ops re-perguntado e MANTIDO.**
Manutenção é trabalho (identidade por serviço): a vistoria que reprova o
reparo devolve o MESMO serviço à bancada; ordem nova partiria o custo e a
história do mesmo conserto em dois. A volta LIMPA o carimbo (o padrão da
reabertura do care); o fato `completed` anterior fica na trilha.
`cancelled` é terminal — copiar ali também foi decisão. E `open → done`
existe: o pequeno reparo se registra depois de feito. Há teste que ASSINA o
mantido — se o ops mudar, a manutenção re-pergunta em vez de herdar em
silêncio.

**⭐ A RECORRÊNCIA É DESENHO DO TENANT — sem cron fingido.** "A cada N dias
após a conclusão" mora na ordem (só preventiva, constraint). A PRÓXIMA
DEVIDA é view calculada (`mnt.preventive_queue`) e a fila é decisão do
pacote: a identidade da rotina é **(título, alvo)** carimbada — vale a
conclusão mais recente, e rotina com ordem já aberta não cobra em dobro.
**Gerar a ordem automática por relógio é DECLARADO FUTURO** — quem abre a
próxima é gente, com a fila honesta na frente.

**⭐ CONCLUIR EXIGE O RELATO** do que foi feito (carimbo do servidor,
permissão própria): conserto sem relato é conserto que ninguém confere.

---

## 1. AS PEÇAS

- `mnt.orders`: a ordem — alvo texto livre, prioridade do tenant,
  responsável via `core.memberships` (padrão ops), custo registrado
  opcional (valor+moeda juntos). Encerrada (done/cancelled) congela o
  conteúdo.
- `mnt.order_events`: a trilha — escrita pelo GATILHO (o cliente não
  escreve nela), imutável em 3 camadas.
- `mnt.priorities`: a régua de urgência do tenant (posição 0 = mais
  urgente); o quadro é ordenado pelo pacote (`orderBoard()`).
- `mnt.preventive_queue`: view com `security_invoker` — concluída + N
  dias, atraso à vista.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `mnt.order.opened` | a ordem nasceu |
| `mnt.order.updated` | mudou no que é fato (inclui andamento) |
| `mnt.order.completed` | concluída — com o relato carimbado |
| `mnt.order.reopened` | o MESMO serviço voltou à bancada |
| `mnt.order.cancelled` | terminal — a falha nova é ordem nova |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/manutencao`: o quadro ordenado pela prioridade do tenant, a fila da
preventiva devida (`buildPreventiveQueue()` — a tela não calcula data),
abrir ordem (corretiva/preventiva com recorrência), mover, concluir com
relato em dois passos, cancelar. Porta própria, mock honesto, menu por
permissão.

## 4. AS PERMISSÕES

`manage` (abrir, editar, mover), `complete` (concluir com relato e
cancelar — os atos) e `setup.manage` (a régua de urgência). Quem abre não é
quem dá o serviço por conferido.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Gerar a ordem da preventiva por relógio | cron/relógio da plataforma — quando existir, é o correio do Core quem acorda, jamais uma segunda fila |
| Plano de manutenção por equipamento + histórico técnico | vem com **Patrimônio (Onda 2)** — a ponte já existe: `asset_id` solto + alvo carimbado |
| Peças/estoque consumido no serviço | consumo do `inv` exigiria o vínculo linha↔item e fato com delta — integração declarada; sem handler, sem promessa |
| SLA automático / escalonamento | relógio que age sozinho — futuro declarado |
| Horímetro/hodômetro | ofício do vertical de frota pesada |
| Custeio/rateio da manutenção | capacidade própria do Financeiro |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Quadra.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `mnt` (`0032_mnt.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §17) |
| Pacote `@alsham/maintenance` (ciclo, fila da preventiva, quadro, validação) | ✅ construído, com testes |
| Seed (17º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`22_mnt_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/manutencao` (quadro, preventivas devidas, concluir com relato) | ✅ CONSTRUÍDO |
| Ordem automática · patrimônio · peças · SLA | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0032_mnt.sql` (depois do `0031`).
2. Reaplicar o seed — o 17º cartão entra.
3. ⚠️ **Expor o schema `mnt` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
