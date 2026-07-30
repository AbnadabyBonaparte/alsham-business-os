# 🏭 MÓDULO 19 — CHECKLISTS

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `chk` ou no pacote
> `@alsham/checklists`.
>
> **Leia junto com [MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)** — a física do
> documento congelado que aqui é re-perguntada — e com
> [MODULO-OCC-SPEC](MODULO-OCC-SPEC.md), a física do fato consumado que a
> resposta-ato herda.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `chk`.** `checklist` inteiro não é greppável no padrão dos
eventos e `check` é vocabulário de SQL (constraint) e de dinheiro (cheque) —
Sol Único proíbe uma palavra querer dizer duas coisas. Conferido por grep
com fronteira de palavra: zero colisões.

**`domain_key` = `operations`** — Taxonomia §5, bloco **🏭 Operações (10)**,
capacidade **Checklist**.

**⭐ EXECUTAR CONGELA O MODELO — por CÓPIA, pelo gatilho.** O modelo é
desenho do tenant (a Lei das Etapas na inspeção) e edita-se à vontade. A
execução é o quote re-perguntado: o documento congela no ENVIO; a inspeção
congela na ABERTURA — o gatilho carimba o nome do modelo e copia os itens
ativos para `chk.run_items`, **por valor, sem FK para o item de origem**:
o redesenho do modelo (até apagar itens) nunca alcança a história. Há
cenário de teste que edita o modelo depois da abertura e confere que a
execução não mudou — e teste de pacote que assina o contraste quote×chk.

**⭐ A RESPOSTA DADA NÃO SE RASURA** — a física do occ, item a item:
ok / não-ok / não-se-aplica + nota, carimbada quem/quando pelo servidor,
UMA vez. Errou? Abandona com razão e executa de novo — as duas inspeções
ficam no livro.

**⭐ `ok`/`not_ok`/`not_applicable` É CHECK** — física da inspeção, não
vocabulário de casa (o precedente do mnt): toda inspeção do mundo responde
conforme, não conforme ou não se aplica. Quem discordar refuta no arquivo.

**⭐ CONCLUIR EXIGE TUDO RESPONDIDO** (o gatilho conta) e os dois fins são
TERMINAIS — a execução é DOCUMENTO de inspeção: quem volta amanhã abre
execução nova.

---

## 1. AS PEÇAS

- `chk.templates` + `chk.template_items`: o desenho do tenant — nome e
  itens ordenados, texto livre; arquivar é status.
- `chk.runs`: a execução — modelo carimbado pelo NOME, alvo (`subject`)
  texto livre, conclusão carimbada pelo servidor, abandono com razão.
- `chk.run_items`: a prancheta congelada — escrita pelo GATILHO da
  abertura (o cliente não insere); o cliente só responde, uma vez.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `chk.run.started` | a execução abriu, com o modelo congelado |
| `chk.run.completed` | concluída — tudo respondido, contagens no envelope. Terminal |
| `chk.run.abandoned` | abandonada — com a razão. A refeita é outra inspeção |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/checklists`: os modelos do tenant (desenhar com itens ordenados), abrir
execução com alvo, responder item a item (ok/não-ok/n.a. + nota, uma vez),
concluir só com tudo respondido, abandonar com razão. Porta própria, mock
honesto, menu por permissão.

## 4. AS PERMISSÕES

`run.execute` (abrir, responder, concluir, abandonar) e `setup.manage`
(desenhar os modelos). O checklist tem duas mãos: quem desenha a inspeção
não é quem a executa.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Agendamento automático de ronda | cron/relógio da plataforma — sem relógio fingido: quem abre a execução é gente. Quando existir, quem acorda é o correio do Core |
| Foto/anexo de evidência no item | *Storage & Arquivos* é capacidade do Core, NÃO CONSTRUÍDA (o padrão do ops) — a nota é texto |
| Assinatura digital da inspeção | capacidade do Core (*Assinaturas Digitais*), não construída |
| Pontuação/score de inspeção | régua de auditoria é ofício do Domain 🧪 Qualidade |
| Reordenar/renomear itens pela tela | o schema aceita (position deferrable); o formulário de edição é etapa própria — o padrão do ops |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Penta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `chk` (`0034_chk.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §18) |
| Pacote `@alsham/checklists` (ciclo, resposta-ato, progresso, validação) | ✅ construído, com testes |
| Seed (19º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`24_chk_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/checklists` (modelos, execução, resposta-ato) | ✅ CONSTRUÍDO |
| Ronda automática · foto · assinatura · score | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0034_chk.sql` (depois do `0033`).
2. Reaplicar o seed — o 19º cartão entra.
3. ⚠️ **Expor o schema `chk` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
