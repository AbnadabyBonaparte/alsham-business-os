# CLAUDE.md — ALSHAM BUSINESS OS™

**Instruções permanentes para qualquer agente que abrir este repositório.**
Leia este arquivo inteiro antes de qualquer alteração. Se algo aqui contradisser `docs/canon/`, **os documentos de `docs/canon/` vencem.**

---

## 1. VERTEX — a planta antes da obra (inegociável)

Nenhuma linha de código, schema, configuração ou documento nasce aqui sem antes ler, nesta ordem:

1. `docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md` — o mapa canônico. É a ÚNICA taxonomia (Sol Único).
2. `docs/canon/ROADMAP-TECNICO-V1.md` — a ordem de engenharia. Core primeiro, sempre.
3. `README.md` — as 6 Leis do Projeto.

Antes de decidir de onde minerar uma peça, leia também:

4. `docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md` — o que o império já tem, com estado **PROVADO · DOSSIÊ · NÃO TEMOS**.
5. `docs/balancos/BALANCO-SUPABASE.md` — o que cada banco doa; o que é pedreira de schema e o que nunca se reutiliza.

`docs/historico/` é memória, não canon. Em divergência, o canon vence.

**Se a planta não foi lida, a obra não começa.**

---

## 2. AS 6 LEIS DO PROJETO (resumo — texto integral no README.md)

1. **Lei 7 (fonte):** nenhum número ou promessa vai ao ar sem estar construído e provado.
2. **Lei anti-viés:** o cliente inaugural decide a ORDEM da fila de módulos, nunca o CONTEÚDO.
3. **Construir × INTEGRAR:** folha (eSocial), fiscal (NF/SPED/SAT) e PDV integram-se por padrão; construir só com decisão de dono explícita.
4. **Lei do Reaproveitamento:** nenhum Domain começa do zero se já existe peça no império. Consulte o Balanço de Tecnologia antes de escrever qualquer coisa nova.
5. **Propriedade:** IP 100% ALSHAM Global. O cliente usa; nunca detém o motor nem as chaves-mãe.
6. **Sol Único:** uma taxonomia, uma fonte de verdade. Dado canônico não se duplica — referencia-se a fonte.

---

## 3. PROIBIÇÕES

- ❌ **Nome de cliente** — nenhum nome, razão social, marca, CNPJ, endereço, contato ou apelido de cliente em nenhum arquivo, commit, branch, comentário ou nome de pasta. Escreva sempre "cliente inaugural" ou "o tenant".
- ❌ **Número sem fonte** — todo número precisa de origem verificável. O que não foi verificado se escreve, literalmente, **NÃO VERIFICADO**. Nunca estime, nunca arredonde para cima, nunca herde um número de um documento antigo sem reconferir.
- ❌ **Segredo em código** — nenhuma chave, token, secret, connection string ou `.env` com valor real. Só `.env.example` com placeholders.
- ❌ **Merge sem o dono** — você trabalha em branch e abre PR. **Você não mergeia.** O merge é do dono.
- ❌ **Taxonomia paralela** — não crie uma segunda organização de capacidades. Referencie a Taxonomia.
- ❌ **Módulo antes do Core** — nada da Fase 2 em diante nasce antes do Core da Fase 1 estar pronto.
- ❌ **Dependência direta entre módulos** — toda comunicação passa pelo Core.
- ❌ **Banco compartilhado entre sistemas** — lição paga (Balanço §5). Cada tenant com isolamento claro.
- ❌ **RLS aberta** — lição paga P0 (Balanço §5). Todo banco nasce com RLS ligada e policies reais, padrão Peritus/Forensic.

---

## 4. O TESTE ANTI-VIÉS (aplique a TODO requisito)

Antes de aceitar qualquer requisito, pergunte:

> **"Outra empresa do mesmo setor usaria isso exatamente como está?"**

- **Sim** → é produto. Constrói no Domain ou no OS/Vertical, como peça reutilizável.
- **Não** → **não entra no módulo.** Vira configuração do tenant, ou serviço cobrado à parte.

Corolário do roadmap: *cada linha de código escrita para um cliente deve aumentar o valor da plataforma para todos os clientes futuros.*

---

## 5. ESTADO ATUAL — ETAPA 0 (FUNDAÇÃO)

Este repositório contém **a planta e o esqueleto**. Nenhum código de produto foi escrito.

- `apps/` e `packages/` contêm **apenas `README.md`**. Sem `package.json` por pacote — isso é da Fase 1.
- **Nenhuma migration, nenhum client de banco, nenhuma dependência de DB.**
- A escolha de banco (**Linha A** — TypeScript + Next.js + Supabase/Postgres + Vercel — recomendada no Balanço de Tecnologia §4) está **PENDENTE DE SELO DO DONO**.

**Não crie banco, não toque em Supabase, não adicione segredo enquanto o selo não sair.**

---

## 6. ESTRUTURA (não invente pastas)

```
docs/canon/       taxonomia + roadmap       — leitura obrigatória
docs/balancos/    tecnologia + supabase     — de onde minerar
docs/historico/   catálogo anterior         — memória, não canon
apps/             admin · portal · store · api
packages/         core auth organizations permissions workflow billing
                  notifications documents ai crm finance marketing
                  legal hr analytics integrations ui sdk config
```

Pasta ou conceito novo **exige aprovação do dono**. Simplifique antes de expandir. Reduza antes de criar.

---

## 7. FORMATO DE COMMIT

```
<type>: <description>
- bullet 1
- bullet 2
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
