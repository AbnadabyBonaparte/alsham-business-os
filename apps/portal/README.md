# apps/portal · `@alsham/portal`

**O painel do tenant** — onde a empresa cliente opera o próprio sistema.

**Status:** ✅ **QUATRO TELAS + LOGIN.** Importar extrato · mesa de conciliação · fila de aprovação · fechar período. Autenticação por Supabase Auth, dado real sob RLS.

---

## ⭐ Este app é a PELE, não o coração

`CLAUDE.md §5.3`. **Teste de bolso:** *se eu apagar `apps/` inteiro, perco alguma regra de negócio?* **Não** — e dá para conferir:

| A tela mostra | Quem decide |
|---|---|
| sugestões de baixa | `suggestMatches()` no pacote |
| divergências | `unmatchedLines()` no pacote |
| resumo do período | `summarizeStatement()` no pacote |
| lançamentos de um arquivo OFX/CSV | `parseStatement()` no pacote |
| a impressão digital do arquivo | `contentHash()` no pacote |
| botão escondido sem permissão | a **policy** no banco é quem impede |

**Ler extrato é regra de negócio** — decide sinal, arredondamento, fuso e o que é duplicata. Por isso o parser vive em `packages/finance-reconciliation/src/parsing/`, com 35 testes, e não aqui. Se morasse na tela, trocar o framework em 2028 levaria junto a interpretação do extrato.

O CI verifica: se alguém redeclarar o motor ou o parser dentro de `apps/`, ou se uma tela parar de chamá-los, o build falha.

---

## Segurança

**O `tenant_id` nunca vem do cliente.** Vem da sessão cruzada com `core.memberships`, resolvida no servidor (`src/lib/session.ts`). Existe um cookie de tenant ativo, mas ele é **preferência, não autoridade**: o valor é conferido contra os vínculos antes de ser aceito. E mesmo que passasse, a RLS não devolveria uma linha.

**Não existe `NEXT_PUBLIC_TENANT_ID`**, e há guarda no CI para que não volte a existir.

⛔ **A `service_role key` não entra neste app.** Ela ignora toda a RLS. O painel fala com o banco **como o usuário**, com a chave publicável. Uma guarda no CI inspeciona o bundle de cliente compilado e falha se a string aparecer lá.

**Autenticação é do Supabase Auth** — não há hash de senha, geração de token nem validação de credencial neste repositório (CLAUDE.md §5.2: *nunca construir auth próprio*).

---

## Como rodar

### Modo demonstração — sem banco, sem login

```bash
pnpm install
pnpm --filter @alsham/portal dev     # http://localhost:3000
```

Sem `NEXT_PUBLIC_SUPABASE_URL`, o app usa o **adapter mockado**: dado fabricado e anônimo, e um aviso na tela. As leituras funcionam inteiras; **a escrita recusa com mensagem** em vez de responder "ok" — fingir que gravou seria pior do que não gravar.

### Com o banco real

Depois de o dono aplicar as migrations ([`docs/runbook/APLICAR.md`](../../docs/runbook/APLICAR.md)):

```bash
cp apps/portal/.env.example apps/portal/.env.local
# preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm --filter @alsham/portal dev
```

O usuário precisa de:
1. conta no Supabase Auth do projeto;
2. linha em `core.memberships` com `status = 'active'` para algum tenant;
3. permissões `recon.*` no papel dele.

Sem (2), o painel mostra **"sem acesso"** — que é honesto: a conta existe, o convite não chegou.

### Build (o que a Vercel roda)

```bash
pnpm build:portal
```

---

## Configuração do tenant (anti-viés)

Duas coisas vêm de `core.tenant_modules.settings`, nunca do código:

```jsonc
{
  "matching": {                    // a política de conciliação
    "amountToleranceCents": 100,
    "dateToleranceDays": 5,
    "minScore": 0.6
  },
  "import": {
    "csvMapping": {                // o layout do CSV DESTA empresa
      "delimiter": ";",
      "hasHeader": true,
      "decimalSeparator": ",",
      "dateOrder": "DMY",
      "columns": {
        "postedAt": "Data",
        "description": "Historico",
        "amount": "Valor"
      }
    }
  }
}
```

Cada empresa usa o banco que usa, e cada banco exporta o CSV que quer. Uma lista de bancos homologados no código seria o sistema de **um** cliente. Sem `csvMapping`, a tela diz o que falta configurar em vez de adivinhar — e adivinhar separador decimal é como se perdem três casas em silêncio.

---

## Estrutura

```
src/
  proxy.ts                  o "middleware" da Next 16 — renova sessão e fecha a porta
  app/
    login/page.tsx          Obsidian + Sol Único
    auth/callback/route.ts  retorno do magic link
    auth-actions.ts         entrar, sair, trocar de tenant
    importar/page.tsx       ler → conferir → confirmar
    conciliacao/page.tsx    chama suggestMatches()
    aprovacoes/page.tsx     a mesa do diretor, com idade e trilha
    fechamento/page.tsx     chama summarizeStatement(); fechar emite o evento
    actions.ts              Server Actions — chamam o pacote e a porta
    globals.css             os tokens do canon (único lugar com HEX)
  components/               estados, confirmação em dois passos, tabelas
  lib/
    session.ts              ⭐ resolve tenant por sessão + memberships
    supabase/               cliente de servidor e leitura de ambiente
    data/port.ts            a interface: só carrega e grava, nunca decide
    data/mock.ts            demonstração
    data/supabase.ts        real, sob RLS
    format.ts               apresentação pura
```

**Não existe `middleware.ts`** — na Next 16 é `proxy.ts`.

---

## O que ainda não existe

| Peça | Estado |
|---|---|
| Job que entrega `core.event_outbox` | **NÃO CONSTRUÍDO** — fechar grava o evento, mas ele fica `pending` na caixa |
| Convite de usuário pela tela | **NÃO CONSTRUÍDO** — o vínculo é criado no banco |
| Edição de `settings` pela tela | **NÃO CONSTRUÍDA** — hoje é JSON no banco |
| Leitor de CAMT.053 | **NÃO CONSTRUÍDO** — o parser diz isso em vez de tentar |
| TanStack Query v5 | **não usado** — as telas são server components; entra quando houver estado de cliente que justifique |
| Cobrança (billing) | **NÃO CONSTRUÍDO** — Etapa 6 |
