# MÓDULO 83 — Monitoramento de Geração (genreading)

> Vertical ☀️ **Energia** (`vertical_key='energy'`) · Onda Vinte (Fase 3) ·
> migration `0098_genreading.sql` · pacote `@alsham/genreading` · teste
> `88_genreading_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §33).**

---

## 1. O QUE É

O **livro de leituras de geração**: quanta energia (kWh) uma usina gerou num
período. Cada leitura é um FATO CONSUMADO — a usina gerou tanto, num período, e o
registro nasce pronto, para sempre.

- **Imutável em DUAS camadas** desde o instante 1 (a lição da Onda Dez): o
  cliente não tem porta de UPDATE nem DELETE; o gatilho recusa a reescrita até
  para o dono do banco. Corrigir é registrar OUTRA leitura, com nota.
- **Sem status, sem ciclo, sem `allowed_transition`, sem `updated_at`** — a
  medição ACONTECE e vira linha. A ausência é a lei.

---

## 2. ⭐⭐ REAPROVEITA A IDENTIDADE DO `esg` — a leitura periódica imutável

O que é uma leitura de geração? É EXATAMENTE a física da leitura ambiental do
`esg` (Módulo 67), do `pcost` (57) e do `timesheet` (61): quantidade + unidade +
período, num livro imutável.

**O que se MANTÉM do `esg`:** leitura imutável; `generated_kwh >= 0` (zero é
leitura REAL — uma usina gera zero à noite, e recusar isso mentiria sobre o
período; negativo é infísico — não se gera `-3` kWh); unidade TEXTO LIVRE
(kWh/MWh — o tenant escolhe); data de referência obrigatória; carimbo do servidor.

**⭐ O DIVERGE assinado — a usina é OBRIGATÓRIA:** no `esg` a fonte é OPCIONAL
(`source_id` pode ser nulo — uma emissão pode não ter obra de origem); aqui a
USINA é OBRIGATÓRIA (`plant_id NOT NULL`), porque **não existe geração no ar** —
toda geração é DE UMA usina. O vínculo continua por **id solto** (sem FK
cruzada), com o nome carimbado pela tela. O contraste genreading×esg fica no
teste do pacote.

---

## 3. ANTI-VIÉS — o que ENTRA e o que fica FORA

**✅ ENTRA:** a usina (id solto ao `plant`, obrigatória) + nome; `generated_kwh`
(`>= 0`); unidade TEXTO LIVRE; data de referência (obrigatória); nota TEXTO LIVRE
opcional. ⛔ A nota NÃO passeia pelo correio (a cautela do `esg`/`vis`).

**❌ FORA:** cálculo de performance ratio (geração real ÷ esperada — motor de
cálculo, futuro, DECLARADA FORA); alerta de queda de geração (motor futuro);
telemetria em tempo real do inversor (integração de equipamento, futuro).
`consumes` **VAZIO**.

---

## 4. ESTADO

✅ **CONSTRUÍDO na Onda Vinte (Vertical ☀️ Energia)** — arquivo, ainda **NÃO
APLICADO** (runbook §33). Schema `genreading`, RLS por tenant, motor
`@alsham/genreading`, teste de isolamento `88`. `consumes` vazio.
