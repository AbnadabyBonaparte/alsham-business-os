# 🏭 MÓDULO 18 — PATRIMÔNIO

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `pat` ou no pacote
> `@alsham/assets`.
>
> **Leia junto com [MODULO-CTR-SPEC](MODULO-CTR-SPEC.md)** — o "vigente
> calculado dos atos" que aqui é re-perguntado para o LUGAR — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), cujo ciclo de vida este módulo
> DIVERGE de propósito.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `pat`.** `assets` colide com o vocabulário de build (a pasta
`assets/` de qualquer app) e `patrimonio` inteiro não é greppável; `pat` é a
abreviação consagrada do ofício ("nº de pat.", "patrimoniar"). Conferido por
grep com fronteira de palavra: zero colisões.

**`domain_key` = `operations`** — Taxonomia §5, bloco **🏭 Operações (10)**,
capacidade **Patrimônio**. *Manutenção* é a vizinha — a ponte
(`mnt.orders.asset_id`) nasceu SOLTA na Quadra e **continua solta**: o pat
não lê o mnt, o mnt não ganha FK, e nenhuma linha do `0032` mudou.

**⭐ A LOCALIZAÇÃO VIGENTE NÃO É COLUNA.** O cadastro congela a localização
ORIGINAL; mudar de lugar é ATO em livro imutável (`pat.transfers`) com o
"de onde" carimbado pelo SERVIDOR — digitado, mentiria sem dar erro. A
vigente é calculada (`pat.asset_locations`, view com `security_invoker`;
`currentLocation()` no pacote). É o termo vigente do ctr, re-perguntado
para o lugar: coluna editável seria história editável.

**⭐ A BAIXA É TERMINAL — o crm re-perguntado, e a resposta DIVERGE.**
`active → written_off` é o único par. A contraparte do crm volta
(`archived → active`) porque é a MESMA pessoa; o bem baixado que "volta" é
AQUISIÇÃO NOVA — outro ato, outro custo, outra data. Reativar a linha
antiga esconderia a baixa que aconteceu. A baixa exige RAZÃO escrita
(lição do deal.lost), carimba quem/quando pelo servidor e congela o
registro inteiro. Há teste que ASSINA o contraste crm×pat nos dois lados.

**⭐ A ETIQUETA É ÚNICA POR TENANT — inclusive dos baixados.** A etiqueta é
do BEM, não do status: reusá-la depois da baixa confundiria o alvo
carimbado das ordens do mnt e o próprio livro.

**Aquisição é fato consumado** — a data recusa o futuro (a física do
occ/cash), na constraint e no pacote.

---

## 1. AS PEÇAS

- `pat.assets`: o bem — nome, etiqueta única, categoria do tenant,
  localização ORIGINAL congelada, valor+moeda juntos (opcional), data de
  aquisição sem futuro. Baixado congela inteiro.
- `pat.transfers`: o livro do lugar — o cliente diz só PARA ONDE; o
  gatilho carimba de onde saiu (a vigente no instante), quem e quando.
  Imutável em 3 camadas.
- `pat.categories`: o vocabulário de bens do tenant (nome livre, nunca
  enum; arquivar é status).
- `pat.asset_locations`: view com `security_invoker` — a vigente
  calculada: último ato, ou a original.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `pat.asset.registered` | o bem entrou no livro |
| `pat.asset.updated` | mudou no que é fato (nome, etiqueta, categoria, valor) |
| `pat.asset.transferred` | mudou de lugar — de onde/para onde carimbados |
| `pat.asset.retired` | baixado — terminal, com a razão escrita |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/patrimonio`: o livro ordenado pelo pacote (`orderAssets()`), cadastrar
bem, transferir com destino (o "de onde" ninguém digita), baixar em dois
passos com razão, categorias do tenant. Porta própria, mock honesto, menu
por permissão.

## 4. AS PERMISSÕES

`manage` (cadastrar, editar, transferir), `decide` (baixar — o ato
terminal) e `setup.manage` (as categorias). Quem cadastra não é quem dá o
bem por perdido.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Depreciação / vida útil contábil | **Lei 3**: cálculo contábil é ofício do contador ou integração — nunca conta própria do produto |
| Plano de manutenção por equipamento | é do **mnt** — a ponte (`asset_id` solto) já existe dos dois lados |
| QR / etiqueta física / leitor | integração declarada — o código aqui é texto |
| Inventário físico com contagem | capacidade vizinha (Taxonomia: *Inventário*), do ofício do inv |
| Responsável/custódia por bem | capacidade futura — exigiria vínculo com memberships e trilha própria |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Penta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `pat` (`0033_pat.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §18) |
| Pacote `@alsham/assets` (ciclo, lugar vigente, validação) | ✅ construído, com testes |
| Seed (18º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`23_pat_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/patrimonio` (livro, transferir, baixar com razão) | ✅ CONSTRUÍDO |
| Depreciação · plano por equipamento · QR · custódia | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0033_pat.sql` (depois do `0032`).
2. Reaplicar o seed — o 18º cartão entra.
3. ⚠️ **Expor o schema `pat` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
