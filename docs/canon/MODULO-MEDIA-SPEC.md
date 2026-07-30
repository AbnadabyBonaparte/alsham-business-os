# 📢 MÓDULO 26 — BIBLIOTECA DE MÍDIA

## ALSHAM Business OS™ · Especificação do módulo · Domain `marketing`

> Leitura obrigatória para quem for mexer no schema `media` ou no pacote
> `@alsham/media`.
>
> **Leia junto com [MODULO-PAT-SPEC](MODULO-PAT-SPEC.md)** — a baixa
> terminal que aqui é re-perguntada e DIVERGIDA — e com
> [MODULO-CRM-SPEC](MODULO-CRM-SPEC.md), o argumento da volta do arquivo.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `media`.** A capacidade *Mídia* da Taxonomia, greppável
com fronteira (`media.`), zero colisões na frota.

**`domain_key` = `marketing`.** A Taxonomia §5 põe *Mídia* na linha do
📢 Marketing — terceira peça minerada da MESMA linha (evt, edcal, media):
cada capacidade é um módulo, como manda o Lego.

**⭐ HONESTIDADE ESTRUTURAL — CATÁLOGO, não cofre.** *Storage & Arquivos*
é capacidade do CORE e está NÃO CONSTRUÍDA. O módulo não guarda arquivo:
o ativo é REGISTRO — título, descrição, tipo TEXTO LIVRE (vazio é
permitido e honesto, o precedente da categoria do cash) e **ONDE VIVE**
(`location`, texto livre obrigatório: URL, "HD da sala 2", o drive).
⭐ **E a coluna já serve o futuro sem migration corretiva:** quando o
Storage existir, o endereço canônico continua TEXTO (a URL que o Storage
der) — nada muda de tipo, nada se renomeia.

**⭐ O ACERVO VOLTA DO ARQUIVO — o DIVERGE do pat, assinado.** O pat
re-perguntou o crm e decidiu que a baixa do BEM é terminal (identidade
fiscal). Aqui a MESMA pergunta tem a OUTRA resposta: `archived → active`
EXISTE — o logo que sai de linha e volta na campanha retrô é a MESMA
obra, e renascer partiria o histórico de uso em dois (o argumento do
crm). Patrimônio tem identidade fiscal; mídia tem identidade de OBRA. Há
teste de contraste pat×crm×media que assina os três lados.
⚠️ **Fora do acervo não se usa**: arquivado recusa USO novo (a física do
spc/comm) — devolva ao ativo para usar.

**⭐ O USO É LIVRO** — ato imutável em 3 camadas, carimbado pelo servidor
(quem/quando), ordenado pela SEQUÊNCIA (a lição do pat), com o "em quê"
em TEXTO LIVRE e vínculo SOLTO opcional (`reference_id`, sem FK — a
guarda da matriz reprovaria). Uso registrado errado se corrige
registrando outro, com nota.

**⭐ Etiquetas são TABELA DO TENANT, N:N** — e etiqueta/vínculo têm as
ÚNICAS portas de DELETE do schema: classificar é metadado VIVO do
catálogo, não fato — desfazer uma etiqueta não apaga história nenhuma.

---

## 1. AS PEÇAS

- `media.assets`: o catálogo — título, descrição, tipo livre, o
  onde-vive, o acervo (active ↔ archived).
- `media.tags` + `media.asset_tags`: as etiquetas do tenant, N:N.
- `media.usages`: o livro de uso — imutável, carimbado, com vínculo solto.

## 2. OS FATOS

| Fato | Quando |
|---|---|
| `media.asset.cataloged` | a obra entrou no acervo |
| `media.asset.archived` | saiu do acervo vivo — o livro fica |
| `media.asset.restored` | voltou — a MESMA obra (o DIVERGE do pat) |
| `media.usage.recorded` | um uso entrou no livro |

`consumes` **VAZIO** por decisão de canon (Lei 7) — ver §5.

## 3. AS TELAS

`/midia`: a prateleira na ordem de leitura (`orderShelf()`), catalogar,
etiquetar, arquivar/devolver, registrar uso (com a contagem
`usageCount()` visível por obra) e o livro de cada ativo. Porta própria,
mock honesto, menu por permissão.

## 4. AS PERMISSÕES

`manage` (o catálogo: catalogar, editar, etiquetar, arquivar, devolver) e
`record` (o livro de uso). Quem organiza o acervo não é necessariamente
quem registra o consumo dele.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Upload / hospedagem do arquivo | *Storage & Arquivos* é capacidade do CORE, não construída — este módulo cataloga e aponta; fingir cofre seria a Lei 7 quebrada |
| Miniatura / preview | depende do arquivo que o módulo não guarda (Storage) |
| Gestão de direitos autorais | Domain jurídico — contrato é assunto do `ctr`; aqui não entra licença nem royalty |
| Busca dentro do conteúdo | exigiria ler o arquivo que o módulo não guarda; a busca de hoje é pelo REGISTRO (título, tipo, etiqueta) |
| Uso automático por evento de outro módulo | `consumes` vazio (Lei 7): o vínculo solto pela TELA conta a história sem acoplamento; handler viria com decisão de canon |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Sexta.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `media` (`0041_media.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §19) |
| Pacote `@alsham/media` (acervo, livro de uso, validação) | ✅ construído, com testes |
| Seed (26º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`31_media_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/midia` (prateleira, etiquetas, livro de uso) | ✅ CONSTRUÍDO |
| Upload · miniatura · direitos · busca de conteúdo | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0041_media.sql` (depois do `0040`).
2. Reaplicar o seed — o 26º cartão entra.
3. ⚠️ **Expor o schema `media` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
