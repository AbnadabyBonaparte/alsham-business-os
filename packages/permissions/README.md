# packages/permissions · `@alsham/permissions`

**RBAC do Core.** Hoje: a visão de catálogo da Store.

**Fase do roadmap:** Fase 1 — Core.

**Status:** ✅ **CONSTRUÍDO** — `buildShelf()` cruza o catálogo da plataforma com o que o tenant instalou. 14 testes. Puro, sem I/O.

---

## ⚠️ A decisão de instalar NÃO está aqui

Quem decide é **`core.install_module()`**, no banco: permissão, módulo publicado, papel do tenant e teto do plano. Todas as quatro regras vivem lá, e só lá.

Este pacote **apresenta**. Reimplementar as regras aqui criaria uma segunda fonte que diverge no dia em que alguém corrigir uma só — e há guarda no CI contra a tela passar a comparar a contagem de instalados com o teto.

A diferença aparece na mensagem de recusa: ela nunca é escrita aqui, é a que o banco devolveu.

## Honestidade na vitrine

`listensTo` deduz, do prefixo dos eventos consumidos, **de quem** o módulo escuta. Dizer "consome eventos" sem dizer de quem faria a Store prometer uma reação que depende de um módulo que o cliente talvez não tenha.

Escutar o próprio Core, ou a si mesmo, não conta como depender de outro módulo — e há teste para as duas coisas.

## Um estado que não podia ser colapsado

`previously-installed` existe separado de `available` porque **o dado do módulo continua no banco** depois de desinstalar. Mostrar "disponível" faria o cliente achar que reinstalar começa do zero.

## Testes

```bash
pnpm test    # da raiz
```
