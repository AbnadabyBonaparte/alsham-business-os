# 👥 MÓDULO 24 — COMUNICADOS

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> Leitura obrigatória para quem for mexer no schema `comm` ou no pacote
> `@alsham/comms`.
>
> **Leia junto com [MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)** — a palavra
> dada que congela — e com [MODULO-SPC-SPEC](MODULO-SPC-SPEC.md), a física
> do arquivado que não recebe ato novo.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `comm`.** `comunicado` inteiro não é greppável; `com` é
reservado demais. `comm` é a abreviação consagrada — grep com fronteira de
palavra: zero colisões (o `comment on` do SQL não tem o ponto do prefixo).

**`domain_key` = `hr`.** O mural fala com MEMBROS do tenant — comunicação
interna é ofício de gente, e gente é o 👥 RH. O vertical Condomínios nomeia
o recorte ("Comunicados" na linha dele); a leitura universal vem para o
Domain — o movimento do spc com a "Reserva de áreas comuns". Teste ancora
os dois lados.

**⭐ PUBLICAR CONGELA — a palavra dada.** O rascunho é plano (edita-se);
publicar carimba quem/quando pelo servidor e congela título, corpo e
audiência — comunicado editado depois de lido é duas verdades com a mesma
assinatura. **Publicar exige corpo** (comunicado sem corpo não comunica; o
rascunho pode nascer só com o título). **Corrigir é publicar comunicado
NOVO** referenciando o antigo (`corrects_notice_id` + **título carimbado
pelo SERVIDOR** no ato do insert — o padrão do vis).

**⭐ ARQUIVADO É TERMINAL** (dois pares: `draft→published`,
`published→archived`; o rascunho nunca esteve no mural — não arquiva).
Arquivar tira do mural, não da história; devolver ao mural faria ciências
antigas parecerem novas — o aviso que volta todo ano é comunicado novo.

**⭐ A CIÊNCIA É ATO PRÓPRIO, ÚNICO E ETERNO.** O gatilho FORÇA
`auth.uid()` (não se dá ciência por outro, nem mandando outro `user_id`);
UNIQUE (comunicado, membro); imutável em 3 camadas — o que foi lido foi
lido. **Só o publicado recebe ciência**: rascunho ainda não comunicou;
arquivado saiu do mural (a física do spc) — a COBERTURA conta quem leu
enquanto a palavra esteve de pé.

**⭐ O corpo não passeia no envelope** — o correio entrega o fato (título,
audiência), não o mural inteiro.

---

## 1. AS PEÇAS

- `comm.notices`: o mural — título, corpo, audiência texto livre, carimbo
  de publicação, correção por referência com título carimbado.
- `comm.acks`: as ciências — próprias, únicas, eternas; FK para
  `core.memberships` com restrict (membro com ciências não se apaga).

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `comm.notice.drafted` | nasceu no rascunho |
| `comm.notice.published` | a palavra foi dada — congela |
| `comm.notice.archived` | saiu do mural. Terminal |
| `comm.notice.acked` | um membro deu a própria ciência |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/comunicados`: o mural na ordem de leitura (`orderBoard()`), redigir,
publicar em dois passos (com o aviso do congelamento), dar ciência (uma
vez — o botão some depois), a cobertura contada (`ackCount()`), corrigir
publicando novo, arquivar. Porta própria, mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`manage` (redigir, publicar, arquivar) e `ack` (a PRÓPRIA ciência — a mão
de todo leitor). Quem dá a palavra não é quem a acusa de lida.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Envio por e-mail/WhatsApp/push | **Lei 3** — integração declarada: o módulo registra o ATO de comunicar; o transporte é de fora |
| Agendamento de publicação | cron fingido — quem publica é gente; quando houver relógio, é o correio do Core |
| Segmentação automática de audiência | seria ler `memberships` com régua própria — capacidade futura; hoje a audiência é texto livre e a entrega é de gente |
| Anexos | *Storage & Arquivos* é capacidade do Core, não construída |
| Cobertura × total de membros | o denominador vem do Core — leitura futura no Painel, não coluna aqui |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sexta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `comm` (`0039_comm.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §19) |
| Pacote `@alsham/comms` (ciclo, ciência, cobertura, validação) | ✅ construído, com testes |
| Seed (24º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`29_comm_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/comunicados` (mural, publicar, ciência única) | ✅ CONSTRUÍDO |
| Envio · agendamento · segmentação · anexos | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0039_comm.sql` (depois do `0038`).
2. Reaplicar o seed — o 24º cartão entra.
3. ⚠️ **Expor o schema `comm` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
