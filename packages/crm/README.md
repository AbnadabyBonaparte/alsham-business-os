# `@alsham/crm` — Módulo 4: Relacionamentos (CRM base)

> Especificação completa: [`docs/canon/MODULO-CRM-SPEC.md`](../../docs/canon/MODULO-CRM-SPEC.md)

**Propósito:** Domain Comercial & CRM (Taxonomia §5, 12 capacidades). Este
módulo entrega **uma**: o cadastro de contrapartes e o histórico de contato.
As outras onze — *Pipeline · Propostas · Orçamentos · Follow-up · Visitas ·
Clientes · Leads · WhatsApp · Ligações · Comissão · Metas* — seguem
**NÃO CONSTRUÍDAS**.

**Domínio PURO.** Nem banco, nem rede, nem relógio, nem UI.

| Onde | O quê |
|---|---|
| `src/manifest.ts` | o `ModuleManifest` — como o módulo existe para a plataforma |
| `src/party.ts` | validação, ciclo de vida, etiquetas, busca, resumo |
| `src/types.ts` | os tipos, com nomes **neutros de país** |

Quem grava é o schema `crm` (`supabase/migrations/0009_crm.sql`); quem mostra é
`apps/portal`; quem conta ao mundo é o correio.

---

## ⚖️ Lei do Reaproveitamento — o que se minerou, e a divergência

`accounts` / `contacts` / `deals` / `quotes` da pedreira `alsham-core` (Balanço
Supabase). **Minerou-se o schema, jamais o banco** — banco-mãe compartilhado é a
lição nº 2 a não repetir.

A divergência deliberada: a pedreira separa organização de pessoa em duas
tabelas; **aqui é uma, com `kind`**. Duas tabelas forçam a hierarquia "contato
pertence a conta", que presume um organograma de venda B2B — e partiria o
histórico de contato de quem é os dois ao mesmo tempo.

⚠️ **NÃO VERIFICADO:** este repositório não leu o schema real do `alsham-core`.
A mineração partiu do que o Balanço registra, e o Balanço é documento — não é o
banco.

---

## ⚖️ O anti-viés, em três linhas

- **`kind` tem dois valores: `person` e `org`.** "Cliente", "fornecedor" e
  "lead" são **etiquetas**, escolhidas pelo tenant — e um enum de negócio faria
  quem compra e vende para a mesma contraparte precisar de duas linhas.
- **O canal da interação é texto livre.** A Taxonomia lista *WhatsApp* como
  capacidade porque é assim que o mercado a nomeia; congelar o instrumento numa
  coluna faria o produto envelhecer junto com ele.
- **O identificador fiscal não tem formato.** Nem 11 dígitos, nem 14, nem
  dígito verificador. Há teste com seis formatos de países diferentes.

---

## ⛔ A interação é imutável, e o ciclo de vida difere do Módulo 3

Fato consumado não se edita: corrigir é **registrar outra**. Três camadas no
banco, e a terceira recusa até para o dono do banco.

E `archived → active` **existe** aqui, ao contrário do `cancelled` do Módulo 3:
uma contraparte que volta é a MESMA pessoa. `lifecycle.test.ts` lê o arquivo da
migration e compara a tabela de transições par a par.

---

## ⚠️ Este pacote não importa nenhum outro módulo

E não vai importar. Há guarda no CI ("módulo não conhece módulo") que confere
isso **nos dois sentidos**, para os quatro módulos, com a matriz gerada em vez
de escrita à mão.

---

## Comandos

```bash
pnpm --filter @alsham/crm test       # node --test, sem framework
pnpm --filter @alsham/crm typecheck
```

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
