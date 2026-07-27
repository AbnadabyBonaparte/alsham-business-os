# apps/portal · `@alsham/portal`

**O painel do tenant** — onde a empresa cliente opera o próprio sistema.

**Fase do roadmap:** Fase 1 — Core (as telas do Módulo 1 chegam com a Fase 3).

**Status:** ✅ **DUAS TELAS CONSTRUÍDAS** — mesa de conciliação e fila de aprovação. A terceira (importar extrato) depende do parser de OFX/CSV, que está **NÃO CONSTRUÍDO**.

---

## ⭐ Este app é a PELE, não o coração

`CLAUDE.md §5.3` — a regra mais importante do repositório, e a mais fácil de quebrar sem perceber.

**Teste de bolso:** *se eu apagar `apps/` inteiro, perco alguma regra de negócio?*

A resposta é **não**, e dá para conferir:

| O que a tela faz | Onde a decisão mora |
|---|---|
| mostra sugestões de baixa | `suggestMatches()` em `@alsham/finance-reconciliation` |
| mostra as divergências | `unmatchedLines()` no mesmo pacote |
| mostra o `score` e a `strategy` | calculados pelo pacote; a tela só formata |
| esconde botão sem permissão | a policy em `0002_recon.sql` é quem **impede** |
| aplica tolerância e limiar | vêm de `core.tenant_modules.settings`, via porta de dados |

A página de conciliação tem **duas linhas de lógica**, e as duas são chamadas ao pacote:

```ts
const suggestions = suggestMatches(lines, payables, settings);
const divergences = unmatchedLines(lines, suggestions);
```

O CI verifica isso: se alguém redeclarar o motor dentro de `apps/`, ou se a tela parar de chamá-lo, o build falha.

---

## Como rodar

### Modo demonstração — sem banco, sem configuração

```bash
pnpm install
pnpm --filter @alsham/portal dev
# http://localhost:3000
```

Sem `NEXT_PUBLIC_SUPABASE_URL`, o app cai no **adapter mockado**: dado fabricado e anônimo ("Fornecedor Alfa", "Beta", "Gama"), e a tela avisa isso em cima. Nenhuma decisão é gravada — fingir que gravou seria pior do que não gravar.

É o mesmo componente que roda com banco. Troca-se o adapter, não a tela.

### Com o Supabase de verdade

Depois de o dono aplicar as migrations (ver [`docs/runbook/APLICAR.md`](../../docs/runbook/APLICAR.md)):

```bash
cp apps/portal/.env.example apps/portal/.env.local
# preencha URL, chave publicável (anon) e o tenant
pnpm --filter @alsham/portal dev
```

⛔ **A `service_role key` não vai no `.env.local` deste app.** Ela ignora toda a RLS. O painel fala com o banco **como o usuário**, sob RLS — é isso que torna o isolamento real em vez de confiança na tela.

### Build (o que a Vercel roda)

```bash
pnpm build:portal
```

---

## Direção de arte

Toda cor sai de [`docs/canon/IDENTIDADE-VISUAL.md`](../../docs/canon/IDENTIDADE-VISUAL.md). Os 18 tokens `--bos-*` são transcritos **uma vez** em `src/app/globals.css` e expostos como utilidades do Tailwind 4. Nenhum componente tem HEX — o CI barra se aparecer.

**A regra que mais se erra:** o ouro `--bos-imperial-gold` é do **sistema** (logo, acento, foco), nunca do **estado**. Divergência é `--bos-danger`; conferido é `--bos-success`; aguardando visto é `--bos-warning`.

Numerais são **tabulares** em toda coluna de valor — ou a conciliação não se lê.

---

## Estrutura

```
src/
  app/
    layout.tsx              cabeçalho, rodapé, tokens
    page.tsx                módulos instalados (lê o ModuleManifest)
    conciliacao/page.tsx    a mesa — chama o motor do pacote
    aprovacoes/page.tsx     a fila — a mesa do diretor, digital
    actions.ts              Server Actions: coletam o clique, chamam a porta
    globals.css             os tokens do canon (único lugar com HEX)
  components/
    states.tsx              vazio · erro · skeleton · selos
    decide-buttons.tsx      confirmação explícita em dois passos
    reconciliation-table.tsx
    approval-queue.tsx
  lib/
    data/port.ts            a interface: só carrega e grava, nunca decide
    data/mock.ts            adapter de demonstração
    data/supabase.ts        adapter real, sob RLS
    format.ts               dinheiro, data, percentual — apresentação pura
```

**Não existe `middleware.ts`** — na Next 16 ele virou `proxy.ts`, e este app ainda não precisa de nenhum dos dois.

---

## O que ainda não existe

| Peça | Estado |
|---|---|
| Tela de importar extrato | **NÃO CONSTRUÍDA** — depende do parser de OFX/CSV |
| Login (Supabase Auth) | **NÃO CONSTRUÍDO** — o tenant vem de env var por enquanto |
| Seleção de tenant | **NÃO CONSTRUÍDA** — um tenant por vez, via `NEXT_PUBLIC_TENANT_ID` |
| Adapter real exercitado | **NÃO VERIFICADO** contra projeto Supabase — nenhum existe ainda |
