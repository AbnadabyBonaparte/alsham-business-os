# 🏭 MÓDULO 16 — OCORRÊNCIAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `occ` ou no pacote
> `@alsham/occurrences`.
>
> **Leia junto com [MODULO-CARE-SPEC](MODULO-CARE-SPEC.md)** — o par de
> físicas que este módulo completa — e com
> [MODULO-INV-SPEC](MODULO-INV-SPEC.md), o livro imutável.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `occ`.** `occurrence` inteiro não é greppável no padrão dos
eventos; `incident` é vocabulário de UMA disciplina (TI/SRE) — a queda no
pátio de uma escola não é um "incident". `occ` foi conferido por grep com
fronteira de palavra: zero colisões.

**`domain_key` = `operations`** — Taxonomia §5, bloco **🏭 Operações (10)**,
capacidade **Ocorrências**. *Segurança*, *Facilities* e *Checklist* são
capacidades vizinhas do mesmo Domain — não entram aqui.

**⭐⭐ DUAS FÍSICAS, DE PROPÓSITO — o DIVERGE consciente do `care`:**

| | `care` (o PEDIDO) | `occ` (o FATO) |
|---|---|---|
| natureza | conversa em andamento | fato consumado |
| edição | editável enquanto vivo | **o registro NASCE imutável** |
| correção | edita-se o caso | **tratativa em linha nova e eterna** |
| volta | reabre de `resolved` | **`closed` não volta NUNCA** |
| fim | fechado; caso novo depois | desfecho ESCRITO obrigatório; ocorrência nova depois |

Editar o relato de um fato depois de registrado é reescrever a história — e
é o que uma apuração não pode permitir. Há teste de pacote que EXIGE o
contraste entre as duas migrations.

**⭐ O ENCERRAMENTO É ATO**: função `occ.close_occurrence()` (security
definer que confere o vínculo POR DENTRO) — permissão própria
(`occ.occurrence.close`), desfecho escrito OBRIGATÓRIO ("arquivar sem apurar
é apagar com outro nome"), carimbo do servidor. Depois de encerrada, NADA se
edita — nem o desfecho, nem pelo dono do banco.

**⭐ A GRAVIDADE É DADO DO TENANT**, com POSIÇÃO (0 = mais grave). A ordem
do livro é decisão do pacote (`orderOccurrences()`).

**⭐ O FUTURO É RECUSADO** (constraint + validação): fato consumado não mora
no futuro. O passado entra — o registro chega depois do fato.

---

## 1. AS PEÇAS

- `occ.occurrences`: o livro. Cliente tem SELECT e INSERT — **nenhuma porta
  de UPDATE/DELETE**; o gatilho recusa reescrita até para o dono do banco e
  só deixa passar o ato de encerrar.
- `occ.treatments`: a cadeia de tratativas — imutável em 3 camadas, INSERT
  direto com `occ.occurrence.treat`, recusada em ocorrência encerrada.
- `occ.severities`: a régua do tenant (nome + posição, `archived → active`).

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `occ.occurrence.registered` | o fato entrou no livro — gravidade pelo NOME |
| `occ.occurrence.treated` | uma tratativa entrou na cadeia |
| `occ.occurrence.closed` | encerrada — com o desfecho. Terminal |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS PERMISSÕES — quatro mãos distintas

`register` (quem viu o fato), `treat` (quem age), `close` (quem escreve o
desfecho) e `setup.manage` (quem desenha a régua). Quem registra não apura;
quem apura não é necessariamente quem encerra.

## 4. AS TELAS

`/ocorrencias`: o livro ordenado pela gravidade do tenant
(`orderOccurrences()` — a tela não ordena nada), registrar o fato (com
`validateNewOccurrence()`, futuro recusado), tratar em linha eterna e
encerrar com desfecho em dois passos. Porta própria, mock honesto, menu por
permissão.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Boletim para autoridade | documento/integração própria — o livro guarda o relato; o boletim é ofício |
| Evidências anexas (foto, vídeo, câmera) | *Storage & Arquivos* é capacidade do Core, NÃO CONSTRUÍDA (a mesma ausência do ops) — `involved`/`description` são texto |
| Plano de ação estruturado (CAPA) | Domain 🧪 Qualidade — capacidade própria |
| Sinistro/seguro | capacidade própria |
| Caso do `care` escalar para ocorrência (e vice-versa) | consumidor E10 completo — declarar exige handler construído |
| Ronda/checklist preventivo | capacidade *Checklist* — vizinha, não construída |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Quadra.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `occ` (`0031_occ.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §17) |
| Pacote `@alsham/occurrences` (livro ordenado, encerramento, validação) | ✅ construído, com testes |
| Seed (16º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`21_occ_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/ocorrencias` (livro, registrar, tratar, encerrar com desfecho) | ✅ CONSTRUÍDO |
| Boletim · anexos · CAPA · sinistro | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0031_occ.sql` (depois do `0030`).
2. Reaplicar o seed — o 16º cartão entra.
3. ⚠️ **Expor o schema `occ` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
