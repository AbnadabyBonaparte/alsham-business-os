# MODULO-RISK-SPEC — Módulo 60: Riscos do projeto

**Domain 📋 PMO & Projetos · capacidade _Riscos_ · `module_id = risk` · schema `risk`**
Onda Treze (Fase 2 — FECHA o Domain PMO & Projetos, o MAIOR do mapa: com esta
onda o PMO tem as 10 capacidades). Migration `0075_risk.sql`, pacote
`@alsham/risk`, teste `65_risk_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A RÉGUA 1–5 É FÍSICA DO MÉTODO — CHECK argumentado.** Probabilidade e
  impacto são a régua clássica 1–5 da gestão de riscos. Não é vocabulário de
  casa (isso seria texto livre): é a ESCALA do método, e por isso mora numa
  CHECK constraint, como a nota 0–100 do `vperf` e a régua 0–10 do `nps`. Fora
  de 1..5 (ou fracionário) não é "outro jeito de medir" — é dado inválido, e o
  banco recusa. A validação de aplicação (`validateNewRisk`) recusa também
  não-inteiro e string; o banco é a última linha.
- ⭐ **A SEVERIDADE NÃO É COLUNA — é leitura.** Severidade = probabilidade ×
  impacto, e serve só para ORDENAR a fila (`orderRisks()` no pacote). Congelá-la
  numa coluna do banco carregaria uma decisão que é só apresentação; nada no
  domínio DEPENDE dela.
- ⭐⭐ **A FÍSICA NOVA DO CICLO — `mitigated` REABRE, `closed` é TERMINAL.** O
  risco nasce `open`, pode virar `mitigated`, e termina em `closed`. Aqui está o
  estado que nenhum módulo anterior teve: `mitigated` **vai e volta** — um risco
  mitigado REABRE (`mitigated → open`) quando a mitigação para de funcionar,
  porque é o **MESMO risco**, não um novo. Mas `closed` é TERMINAL: um risco que
  passou está encerrado, e um risco que **recorre é registro NOVO**. É o DIVERGE
  assinado do `scrum`/`proj`, cujos estados não-iniciais são **todos** terminais
  — o contraste `risk × proj` é assinado no `lifecycle.test.ts` (lá nenhum fim
  reabre; aqui `mitigated` reabre e só `closed` é terminal) e no cenário 3 do
  `65_risk_isolation.sql`.
- ⭐ **Ao REABRIR, o carimbo de mitigação é LIMPO** (`mitigated_at`/`mitigated_by`
  → null). A mitigação deixou de valer; mentir que ela continua em vigor seria
  pior do que não ter carimbo — a lição do `care`/`scrum`, que limpam o carimbo
  ao reabrir.
- ⭐ **Encerrar NÃO exige razão.** Um risco que passou só se fecha; o foco do
  módulo é a mecânica da REABERTURA, e um `closed_reason` obrigatório roubaria a
  atenção dela. Reabrir é livre (sem razão). Decisão consciente, não esquecimento.
- ⭐ **Descrição em TEXTO LIVRE** (anti-viés — o que é um "risco" é de cada casa).
  Vínculo ao projeto por **ID SOLTO** + `project_name` carimbado (o `proj` **não
  é lido**; sem FK cruzada).
- ⛔ **FORA:** matriz/heatmap de risco (leitura, camada de apresentação);
  pontuação automática / IA; simulação de Monte Carlo; categoria de risco
  congelada em enum.

## 1. AS PEÇAS

- `risk.entries` — o registro: `project_id` (id solto, obrigatório) +
  `project_name` (nome carimbado), `description` (texto livre, obrigatória),
  `probability`/`impact` (int, CHECK `between 1 and 5`), `mitigation_plan`
  (opcional), `status` (`open`/`mitigated`/`closed`), carimbos de mitigação e
  fechamento (servidor).
- `risk.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/risk`.
- Gatilhos: nascimento sempre `open` + autor do servidor; transição gated por
  `risk.entry.manage`, carimbo de mitigação/fechamento pelo servidor, **carimbo
  de mitigação LIMPO na reabertura**; conteúdo congela depois do encerramento;
  emissão de fato.

## 2. OS FATOS

`risk.entry.registered` · `risk.entry.mitigated` · `risk.entry.reopened` ·
`risk.entry.closed`. Payload autossuficiente. `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 3. AS TELAS

`/riscos` — placeholder por ora (o módulo vive no banco e no motor; a tela rica,
com a matriz de leitura por severidade, é frente de UI própria).

## 4. AS PERMISSÕES

- `risk.entry.manage` — registrar/editar, mitigar, reabrir e encerrar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Matriz / heatmap de risco — leitura (camada de apresentação sobre a
  severidade); não há dado novo.
- Pontuação automática / IA — a régua é ato de gente (Lei 3/7).
- Simulação de Monte Carlo — fora do recorte.
- Categoria de risco — seria dado do tenant (texto/tabela) numa frente futura;
  não congela em enum.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `risk` (`0075_risk.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/risk` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `65_risk_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/riscos` | ✅ CONSTRUÍDO (placeholder) |
| Matriz / IA / Monte Carlo | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §26`. Expor o schema `risk` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
