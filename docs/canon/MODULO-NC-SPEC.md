# MODULO-NC-SPEC — Módulo 63: Não Conformidades

**Domain 🧪 Qualidade · capacidade _Não conformidades_ · `module_id = nc` · schema `nc`**
Onda Quatorze (Fase 2). ⭐ **ABRE o Domain Qualidade** — território novo do mapa.
É o PRIMEIRO módulo do domínio. Migration `0078_nc.sql`, pacote
`@alsham/non-conformities`.

---

## 1. O QUE É

Uma não conformidade é um DESVIO CONSTATADO — algo que foi observado fora do
padrão numa auditoria interna, numa reclamação de cliente, numa inspeção de
recebimento. O módulo é o LIVRO desses desvios: cada NC é o registro do que se
constatou, com sua origem, sua descrição e (opcional) sua causa raiz. Uma só
peça: `nc.entries`.

O módulo abre o Domain Qualidade sem reescrever nada do que já existe no
império — ele MINERA a identidade do `occ` (Módulo 16) e declara, peça a peça,
o que fica de fora porque já é de outro módulo (§2).

## 2. A FÍSICA

- ⭐ **A identidade do `occ`, re-perguntada — o registro NASCE IMUTÁVEL.** Como
  a ocorrência, a NC é um FATO CONSTATADO: reescrever o desvio depois de anotado
  é reescrever a apuração, e é o que a Qualidade não pode permitir. O cliente não
  tem NENHUMA porta de UPDATE; o gatilho recusa a reescrita do relato até para o
  dono do banco; não se apaga (o livro é eterno). Corrigir não é editar — é
  registrar outra NC.
- ⭐⭐ **O DIVERGE do `occ`, ASSINADO — a NOTA DE VERIFICAÇÃO.** Copiar sem pensar
  e divergir sem escrever são o mesmo erro (CLAUDE.md); a pergunta foi refeita.
  O `occ` encerra com um DESFECHO livre — o que aconteceu. A NC NÃO fecha com um
  desfecho: fecha com uma **nota de verificação** — QUEM CONFERIU que a causa foi
  corrigida. A Qualidade não fecha uma NC porque "resolveu"; fecha porque ALGUÉM
  VERIFICOU que a correção pegou. Sem a nota, fechar seria arquivar sem conferir
  — o pecado que a norma persegue. A obrigatoriedade vive em três lugares: o
  motor (`validateClosure`), a função `nc.close_entry()` e a constraint
  `nc_entries_closure_coherent`.
- ⭐ **`open → closed`, TERMINAL — a física do `occ`.** O desvio foi constatado
  UMA vez. Não há "reabrir": recorrência é NC NOVA, apontando a antiga por ID
  SOLTO (`previous_entry_id`) se quiser rastrear repetição. `ALLOWED_TRANSITIONS`
  no pacote tem UM par, espelho de `nc.allowed_transition()`.
- ⭐ **Anti-viés: tudo TEXTO LIVRE.** Origem é texto livre (a fonte de um
  laboratório não é a de uma construtora — nunca um enum), descrição obrigatória,
  causa raiz opcional. O detectado aceita PASSADO e recusa FUTURO (fato consumado).
- ⭐ **Vínculo ao `capa` por ID SOLTO.** A ação corretiva (Módulo 65) entra por
  `capa_action_id` sem FK cross-schema. A NC pode existir sem CAPA ainda aberta; a
  CAPA que nasce depois aponta de volta pelo id solto dela.
- ⛔ **DECLARADO FORA — não se duplica o que já existe (Sol Único):**
  - **Indicadores de qualidade** → é o `goal` (meta com categoria "qualidade",
    já publicado). NÃO se refaz.
  - **Documentos / Procedimentos de qualidade** → é o `pol` (documento versionado
    com ciência, já publicado). NÃO se refaz.
  - **Anexo de evidência** → *Storage & Arquivos* é capacidade do **Core**, NÃO
    CONSTRUÍDA. Não se finge um cofre.
  - **5-porquês / Ishikawa / plano de ação estruturado** → método é configuração
    do tenant; o plano de ação é o `capa`.

## 3. AS TELAS

`/nao-conformidades` — placeholder por ora (o módulo vive no banco e no motor;
a tela rica — o livro de desvios e o fechamento com a nota de verificação — é a
PRÓXIMA FRENTE de UI, sem dado fabricado até lá).

## 4. OS EVENTOS

`nc.entry.registered` — a NC foi registrada, imutável desde o instante 1.
`nc.entry.closed` — a NC foi fechada com a nota de verificação; terminal.
Payload autossuficiente (quem escuta não faz join). `consumes` VAZIO (Lei 7 —
sem redeploy do `apps/api`).

## 5. ANTI-VIÉS

> "Outra empresa do mesmo setor usaria isso exatamente como está?"

Sim. Um desvio constatado, sua origem em texto livre, o registro que não se
reescreve e o fechamento que exige alguém verificar a correção servem a um
laboratório, a uma indústria, a uma construtora e a um hospital sem uma linha
diferente. O que seria de UMA empresa — a taxonomia da causa raiz, o formulário
de 5-porquês, o gatilho de indicador — fica de fora ou é configuração do tenant.

## 6. ESTADO DA OBRA

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO na Onda Quatorze |
| Schema `nc` (`0078_nc.sql`) | ✅ CONSTRUÍDO (arquivo; ainda não aplicado — apply do dono, runbook §27) |
| Pacote `@alsham/non-conformities` | ✅ CONSTRUÍDO |
| Portal `/nao-conformidades` | ✅ CONSTRUÍDO (placeholder) |
| Tela rica | ⛔ **NÃO CONSTRUÍDA** (§3 — próxima frente) |
| Indicadores / Documentos / Anexo | ⛔ **NÃO CONSTRUÍDOS** (§2 — são goal / pol / Storage do Core) |

`consumes` VAZIO → sem redeploy do `apps/api`. Expor o schema `nc` na Data API ao aplicar.
