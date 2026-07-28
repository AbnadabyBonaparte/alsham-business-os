import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PECAS, APLICADAS, declaraAusente } from './verificar-estado-docs.mjs';

const peca = (nome) => PECAS.find((p) => p.nome.startsWith(nome)).padrao;

/**
 * As linhas abaixo NÃO são inventadas para o teste passar. São as linhas que
 * estavam no repositório antes desta correção, copiadas do git — a defasagem
 * real que a guarda nasceu para pegar.
 *
 * Guarda validada só contra sabotagem imaginária já falhou três vezes neste
 * projeto. Esta é validada contra o defeito que aconteceu.
 */
const DEFASADAS = [
  ['Parser', '| Parser de OFX/CSV | **NÃO CONSTRUÍDO** |'],
  ['Parser', '| Parser de OFX / CSV / CAMT.053 | **NÃO CONSTRUÍDO** |'],
  ['Parser', 'O parser de OFX/CSV, a persistência e as telas estão **NÃO CONSTRUÍDOS** (Etapa 3).'],
  ['Telas', '| Qualquer tela | **NÃO CONSTRUÍDO** |'],
  ['Telas', '| Qualquer UI | **NÃO CONSTRUÍDO** — Etapa 3 |'],
  ['Telas', '| Qualquer UI | **NÃO CONSTRUÍDO** — zero UI até o Core fechar |'],
  ['Despachante', '| Despachante da caixa de saída (job de entrega) | **NÃO CONSTRUÍDO** |'],
  ['Despachante', '| Job que entrega `core.event_outbox` | **NÃO CONSTRUÍDO** — fechar grava o evento, mas ele fica `pending` na caixa |'],
  ['Despachante', 'o job do Core que entrega `event_outbox` e escreve `audit_log` — hoje **NÃO CONSTRUÍDO**'],
  ['Contabilidade', '| Cobrança (billing) | **NÃO CONSTRUÍDO** — Etapa 6 |'],
];

for (const [nome, linha] of DEFASADAS) {
  test(`morde a linha defasada: ${linha.slice(0, 58)}…`, () => {
    assert.equal(declaraAusente(linha, peca(nome)), true, 'passou batido');
  });
}

/**
 * O outro lado, que é onde uma guarda estraga o repositório: negar coisa que
 * de fato não existe é CORRETO e precisa continuar podendo ser escrito. Foram
 * estas quatro que a primeira versão reprovou por engano.
 */
const LEGITIMAS = [
  ['Parser', '| Leitor de CAMT.053 | **NÃO CONSTRUÍDO** — o parser diz isso em vez de tentar |'],
  ['Parser', '| Parser de CAMT.053 | **NÃO CONSTRUÍDO** — e o parser **diz isso** em vez de adivinhar |'],
  ['Telas', '| Tela de consumo (billing) | **NÃO CONSTRUÍDA** — a contabilidade de uso existe em `@alsham/billing` |'],
  ['Telas', '| Edição de `settings` pela tela | **NÃO CONSTRUÍDA** — hoje é JSON no banco |'],
  ['Telas', '| Convite de usuário pela tela | **NÃO CONSTRUÍDO** — o vínculo é criado no banco |'],
  ['Contabilidade', '| Preço em reais e gateway de pagamento | **NÃO CONSTRUÍDO** — `usage_ledger` conta uso, não dinheiro |'],
  ['Contabilidade', '| Fatura, cobrança, inadimplência | **NÃO CONSTRUÍDO** |'],
  ['Contabilidade', '- ✅ a contabilidade de uso foi feita na Etapa 6; preço e gateway seguem **NÃO CONSTRUÍDOS**'],
  ['Despachante', 'o **despachante da caixa de saída** foi construído na Etapa 6, e o resolvedor de permissão segue **NÃO CONSTRUÍDO**'],
  ['Despachante', '| Job que entrega `core.event_outbox` | lógica ✅ construída, mas **NÃO LIGADA** |'],
];

for (const [nome, linha] of LEGITIMAS) {
  test(`não morde a linha correta: ${linha.slice(0, 58)}…`, () => {
    assert.equal(declaraAusente(linha, peca(nome)), false, 'falso positivo');
  });
}

/** Migration aplicada declarada como pendente — o convite a editá-la. */
const MIGRACOES_DEFASADAS = [
  '| Schema do Core (`0001_core.sql`) | ✅ **arquivo**; **NÃO APLICADO** |',
  '| Schema `recon` (`0002_recon.sql`) | ✅ **arquivo**; **NÃO APLICADO** |',
  '| `supabase/migrations/0002_recon.sql` | schema `recon` — **arquivo, não aplicado** |',
  '`supabase/migrations/0001_core.sql` e `0002_recon.sql` existem como **ARQUIVO, não aplicados**',
];

for (const linha of MIGRACOES_DEFASADAS) {
  test(`morde a migration aplicada dita pendente: ${linha.slice(0, 46)}…`, () => {
    assert.ok(APLICADAS.padrao.test(linha) && APLICADAS.marcador.test(linha), 'passou batido');
  });
}

/**
 * ⚠️ **ESTE TESTE MUDOU DE ALVO NA ETAPA 10, e o motivo é a realidade.**
 *
 * Ele afirmava que `0003_billing.sql` podia continuar sendo declarada
 * pendente — "porque não foi aplicada". Era verdade quando foi escrito, e
 * deixou de ser: o dono informou o apply de `0003` a `0006` em 28/07/2026.
 *
 * A regra nunca foi "0003 é exceção". A regra é **"o que foi aplicado não pode
 * ser declarado pendente, e o que não foi, pode"** — e o alvo da exceção anda
 * junto com a fila. Hoje a exceção são `0007` e `0008`, que são, de fato, só
 * arquivo.
 *
 * O teste existe para provar que a guarda **não é uma varredura cega** que
 * proíbe a palavra "pendente" perto de qualquer número de migration. Se ele
 * quebrar de novo, provavelmente é a lista de `APLICADAS` que envelheceu — e
 * não este teste que está errado.
 */
for (const linha of [
  '| `0009_crm.sql` | **ARQUIVO, ainda não aplicado** — o Módulo 4 |',
]) {
  test(`pode continuar sendo declarada não aplicada, porque não foi: ${linha.slice(0, 34)}…`, () => {
    assert.equal(APLICADAS.padrao.test(linha), false);
  });
}

/** E o inverso: as recém-aplicadas passaram a ser mordidas. */
for (const linha of [
  '| `0003_billing.sql` | **ARQUIVO, ainda não aplicado** |',
  '| `0006_install.sql` | **ARQUIVO, ainda não aplicado** — o instalador |',
  '| `0007_ap.sql` | **ARQUIVO, ainda não aplicado** — o Módulo 3 |',
  '| `0008_recon_ap_projection.sql` | **ARQUIVO, ainda não aplicado** |',
]) {
  test(`morde a recém-aplicada dita pendente: ${linha.slice(0, 34)}…`, () => {
    assert.ok(APLICADAS.padrao.test(linha) && APLICADAS.marcador.test(linha), 'passou batido');
  });
}
