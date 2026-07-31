# MÓDULO 81 — Usinas (e Geração distribuída) (plant)

> Vertical ☀️ **Energia** (`vertical_key='energy'`) · Onda Vinte (Fase 3) ·
> migration `0096_plant.sql` · pacote `@alsham/plant` · teste
> `86_plant_isolation.sql`.
> O **primeiro** cartão do Vertical Energia — **ABRE a Onda Vinte**.
> **ARQUIVO — apply é ato do dono (runbook §33).**

---

## 1. O QUE É

O **cadastro da unidade geradora** de energia: nome, localização em TEXTO LIVRE,
capacidade instalada em kWp (`> 0`) e um TIPO/PORTE em TEXTO LIVRE. É o ativo de
operação do vertical solar — a usina que gera a energia que a `subscription`
aloca, que o `genreading` mede e que o `creditbalance` compensa.

- A usina nasce **ativa**; o autor é carimbado pelo servidor.
- `active ↔ archived`: a usina desativada que volta a operar é a MESMA (a física
  do `catalog`/`vendor`/`mall`). Arquivar/reativar exige `plant.plant.decide`.
- Sem DELETE — usina desativada é história de geração e de assinaturas.

---

## 2. ⭐⭐ A DECISÃO DE CANON — UM MÓDULO, DUAS CAPACIDADES

O Vertical Energia lista *Usinas* e *Geração distribuída* como capacidades
separadas. Investigadas com a régua anti-viés, **na física são o MESMO objeto**:
uma unidade geradora com nome, localização, capacidade (kWp) e um tipo. A
"geração distribuída" é apenas uma usina de porte menor, atrás do medidor do
próprio consumidor — mesmo cadastro, mesma vida (opera, desativa, volta).

Construir dois schemas quase idênticos SÓ para inflar o número seria a
DUPLICAÇÃO que a Lei do Reaproveitamento proíbe (ROTEIRO §2). A resposta é UM
módulo, com o PORTE/TIPO num campo **TEXTO LIVRE** (`plant_type`) — nunca um
enum, porque cada operadora nomeia diferente ("usina centralizada", "geração
distribuída", "telhado", "minigeração", "GD remota"). É dado do tenant, não
vocabulário do produto — a mesma disciplina do `esg` (4 capacidades, 1 módulo) e
do `idea`/`ip`.

---

## 3. ⭐ O CICLO — `active ↔ archived` (a física do `catalog`/`vendor`)

Copiar sem pensar e divergir sem escrever são o mesmo erro. A pergunta foi
refeita: a usina é GENTE (física do `hr`, `terminated` terminal) ou ATIVO DE
OPERAÇÃO que volta (física do `catalog`/`vendor`/`mall`/`dc`)? É ativo: a usina
desativada por manutenção longa, troca de titularidade ou sazonalidade e que
VOLTA a operar é a MESMA — obrigá-la a renascer partiria o histórico de geração
e de assinaturas em dois. Então `archived → active` EXISTE. O contraste
plant×hr fica no teste.

---

## 4. ANTI-VIÉS — o que ENTRA e o que fica FORA

**✅ ENTRA:** nome; localização TEXTO LIVRE (endereço/coordenada/"lote 3");
capacidade instalada em kWp (`> 0` — placa de usina real é positiva); tipo/porte
TEXTO LIVRE (a consolidação de GD); o ciclo `active ↔ archived`.

**❌ FORA:** telemetria/leitura de geração (é o `genreading`, id solto);
**Manutenção de usina** (é o `mnt` genérico, com `asset_id` SOLTO pronto desde a
Onda Quadra — **DECLARADA FORA**); **Contrato de energia** (é o `ctr` genérico
com categoria "energia" — **DECLARADA FORA**, a mesma decisão do `lease` para a
locação); inversores/strings/equipamentos (cadastro de componente, futuro).
`consumes` **VAZIO**.

🔴 Não lê schema alheio — a Lei do Lego.

---

## 5. ESTADO

✅ **CONSTRUÍDO na Onda Vinte (Fase 3 — ABRE o Vertical ☀️ Energia)** — arquivo,
ainda **NÃO APLICADO** (runbook §33). Schema `plant`, RLS por tenant, motor
`@alsham/plant`, teste de isolamento `86`. `consumes` vazio.
