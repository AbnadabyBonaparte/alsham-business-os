# O Engenheiro do Business OS — MVP da Camada de Consciência: decisões

> Onda do Engenheiro (MVP) · a camada de **consciência e conversa** apenas.
> **A camada de AÇÃO (tool use que ESCREVE / Server Actions) fica FORA — próxima onda.**
> **ARQUIVO — NÃO MERGEIE. O merge é do dono.**

## O que já existia (VERTEX antes da obra)

⚠️ Achado decisivo: **o Engenheiro já estava construído e fiado de ponta a ponta**
como agente de **tool-use** — `packages/engineer` (lógica pura: `buildSystemPrompt`,
`buildTools`, `MODULE_READS`), a rota `apps/portal/.../api/engineer/route.ts` (o laço
motor↔ferramenta↔RLS), o executor `execute.ts`, a Presença `engineer-presence.tsx`
e os adaptadores no `apps/api` (a chave do motor isolada lá). A Linha Vermelha do
`MODELO-ENGENHEIRO §4` (nunca `service_role`, sempre sessão×RLS) já era honrada.

O bastão pediu a camada de consciência do PERITUS (catálogo de páginas,
consciência de formulário, sigilo duplo, motor local + Forja) e mandou **adiar o
tool-use**. Decisão do dono (confirmada nesta sessão): **ADITIVO** — manter o motor
tool-use já fiado e ADICIONAR só o que faltava, sem reescrever nada.

## A tabela das três origens (o pedido do rito)

| Peça | Origem | Detalhe |
|---|---|---|
| `engineState`, `canGenerate`, `whyCannotGenerate`, billing (`AI_METRIC`) | **REAPROVEITADO da Forja** | Não tocados. A honestidade de estado e a medição continuam onde estavam (`packages/ai`). |
| `composePrompt()` (Cérebro da Marca no prompt) | **REAPROVEITADO da Forja** | `grounded.ts` o COMPÕE (não reimplementa): `composeGroundedPrompt` alimenta o `workContext` com o texto do motor local + os blocos de consciência. |
| `findViolations()` (rede de segurança da marca) | **REAPROVEITADO da Forja** | `checkBrandSafety` é um wrapper direto — detecta, nunca apaga. |
| O executor sob RLS, `buildTools`, o laço da rota | **REAPROVEITADO do que existia** | Intocados. O tool-use segue como estava (é a camada de ação, adiada, não removida). |
| Catálogo de páginas (`pages.ts`: `EnginePage`, `pageOf`, `sigilosa`) | **IMPORTADO do PERITUS** (`paginas.ts`) | ⭐ DERIVA de `ALL_MENU_ITEMS` (Sol Único) — nunca uma segunda lista de rotas. `descricao`/`comoUsar` nascem vazios (Lei 7); curados só onde há texto real. |
| Consciência de formulário (`FormField`, `formSnapshotBlock`) | **IMPORTADO do PERITUS** (`chat.ts` — `CampoTela`) | Snapshot capturado no navegador (`capturarCampos`). |
| Fronteira de sigilo DUPLA (`redactFields` + `sigilosa`) | **IMPORTADO do PERITUS** | ⛔ `record`/`exam`/`prescription`: o valor é suprimido no navegador (1ª camada) E no servidor (2ª). |
| Motor local determinístico (`local/painel.ts`, `local/agenda.ts`) | **IMPORTADO do PERITUS** (`local.ts`, `global-engine.ts`) | Funções puras: dado real → prosa. Nunca inventam número (Lei 7). |
| `composeGroundedPrompt`, `checkBrandSafety` (a ponte) | **NOVO** (mas só compõe o que já existe) | O único código genuinamente novo é a COLA entre o motor local e a Forja. |
| `page`/`fields` no `EngineerContext` + blocos no `buildSystemPrompt` | **NOVO (aditivo)** | Campos opcionais; o caminho antigo (só `currentPath`) continua funcionando. |

## O MVP provado (1–2 módulos, como o bastão pediu)

- **Painel** (`local/painel.ts`): panorama + prioridades a partir de contagens reais.
- **Agenda** (módulo `appointment`, `local/agenda.ts`): resumo por situação (scheduled/
  attended/no_show/cancelled) — **um módulo de Saúde, sem PHI**, para provar a
  vizinhança do sigilo sem tocar no que a fronteira protege.
- **Fronteira de sigilo** provada cedo: `record`/`exam`/`prescription` marcados
  `sigilosa`; teste garante que o valor clínico (`CID X`) **nunca** entra no prompt,
  nas duas camadas.

## Segurança (Linha Vermelha do `MODELO-ENGENHEIRO §4`)

- ⛔ Nunca `service_role`: a consciência (catálogo, formulário, motor local) é PURA
  e não toca banco; quem lê o dado é o executor já existente, sob a sessão×RLS.
- ⛔ O contexto do Engenheiro só vê o que a sessão já veria: o snapshot de formulário
  é da tela que o próprio usuário tem aberta; o catálogo de páginas é público.
- ⛔ Sigilo em duas camadas para o dado com trilha de leitura auditada (LGPD).

## FORA de escopo (declarado — a próxima onda)

- ⛔ **Tool use que ESCREVE / Server Actions de ação** (criar lançamento, dar baixa,
  gerar-e-salvar). O laço de tool-use de LEITURA que já existe permanece; nada novo
  de escrita entra aqui. (PARE do bastão respeitado.)
- ⛔ Wiring completo do Cérebro da Marca por tenant no fluxo de conversa: `grounded.ts`
  já reusa `composePrompt`/`findViolations`; ligar a marca real de cada tenant na
  geração é passo seguinte, sobre o encanamento de marca que já existe na Forja.
- ⛔ `descricao`/`comoUsar` das ~96 páginas restantes: nascem vazias (Lei 7),
  preenchidas aos poucos — nunca com texto genérico inventado.

## Prova

- `pnpm typecheck` (engineer + ai + permissions + **portal**) — verde.
- `pnpm test` — 3740/3740, inclui a suíte nova `consciousness.test.ts` (catálogo,
  sigilo duplo, motores locais, ponte da Forja, integração do prompt).
- `pnpm build:portal` — compila (a Presença client-side importa `@alsham/engineer`).
- CI (`db-verify`, job "manifesto, tipos e domínio") roda `pnpm test` — cobre a suíte
  nova pelo glob, sem wiring extra.

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
