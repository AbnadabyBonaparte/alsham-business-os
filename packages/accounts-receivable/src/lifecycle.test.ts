import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canCancel,
  statusForReceipt,
  outstandingCents,
  overpaidCents,
  isOverdue,
  summarizeReceivables,
} from './receivable.ts';
import type { Receivable, ReceivableStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0010_ar.sql');
const MIGRATION_AP = resolve(HERE, '../../../supabase/migrations/0007_ap.sql');

const TODOS: readonly ReceivableStatus[] = [
  'open',
  'partially_received',
  'received',
  'cancelled',
];

describe('o ciclo de vida do título a receber', () => {
  test('ficar parado é sempre permitido — não é transição', () => {
    for (const s of TODOS) assert.equal(canTransition(s, s), true);
  });

  test('cancelado é terminal: não sai de lá para lugar nenhum', () => {
    for (const destino of TODOS.filter((s) => s !== 'cancelled')) {
      assert.equal(canTransition('cancelled', destino), false);
    }
  });

  /**
   * ⛔ **A pergunta mais fácil de errar do espelho, e ela foi feita de novo.**
   *
   * No `ap`, cancelar um título pago apagaria a fronteira entre "não devíamos
   * isso" e "pagamos isso". Aqui apagaria a fronteira entre "não tínhamos a
   * receber" e **"recebemos o dinheiro"** — e o segundo é mais grave, porque o
   * dinheiro entrou na conta.
   */
  test('⛔ recebido NÃO se cancela — estorna primeiro, cancela depois', () => {
    assert.equal(canTransition('received', 'cancelled'), false);
    assert.equal(canTransition('received', 'open'), true);
    assert.equal(canTransition('open', 'cancelled'), true);
  });

  test('o estorno existe nos dois sentidos — dinheiro volta na vida real', () => {
    // Devolução, chargeback, cheque devolvido, estorno de cartão.
    assert.equal(canTransition('received', 'partially_received'), true);
    assert.equal(canTransition('partially_received', 'open'), true);
  });

  test('canCancel responde só pelo ciclo de vida, e não mente sobre isso', () => {
    assert.equal(canCancel('open'), true);
    assert.equal(canCancel('partially_received'), true);
    assert.equal(canCancel('received'), false);
    assert.equal(canCancel('cancelled'), false);
  });

  test('nextStatuses devolve o que a tela pode oferecer, em ordem estável', () => {
    assert.deepEqual(nextStatuses('open'), ['partially_received', 'received', 'cancelled']);
    assert.deepEqual(nextStatuses('cancelled'), []);
  });
});

/**
 * ⭐ **O TESTE QUE FAZ DA DUPLICAÇÃO UMA ARQUITETURA.**
 *
 * A tabela de transições existe aqui e em `ar.allowed_transition()`, no
 * `0010_ar.sql`. Este teste LÊ o arquivo da migration e compara par a par —
 * mesmo padrão dos Módulos 3 e 4. Mudar uma transição de um lado só reprova.
 */
describe('o schema e o domínio contam a mesma história', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  const paresDoSql = (() => {
    const inicio = sql.indexOf('create or replace function ar.allowed_transition');
    assert.notEqual(inicio, -1, 'a migration não declara ar.allowed_transition');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    // Só as linhas de código: a prosa acima da função também tem setas e nomes
    // de estado, e ela não é a lista.
    const semComentario = corpo.replace(/--[^\n]*/g, '');
    return [...semComentario.matchAll(/\(\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g)].map(
      ([, de, para]) => `${de}→${para}`,
    );
  })();

  const paresDoDominio = ALLOWED_TRANSITIONS.map(([de, para]) => `${de}→${para}`);

  test('a migration declara a tabela de transições de forma legível', () => {
    assert.ok(paresDoSql.length > 0, 'nenhum par extraído do SQL — o teste ficou cego');
  });

  test('cada transição do domínio existe no schema', () => {
    for (const par of paresDoDominio) {
      assert.ok(paresDoSql.includes(par), `${par} está no TypeScript e não está no SQL`);
    }
  });

  test('cada transição do schema existe no domínio', () => {
    for (const par of paresDoSql) {
      assert.ok(paresDoDominio.includes(par), `${par} está no SQL e não está no TypeScript`);
    }
  });

  test('e são exatamente as mesmas, sem repetição de nenhum lado', () => {
    assert.deepEqual([...paresDoSql].sort(), [...paresDoDominio].sort());
    assert.equal(new Set(paresDoSql).size, paresDoSql.length);
  });
});

/**
 * ⭐⭐ **O TESTE DO ESPELHO — e ele é o que impede "copiar sem pensar".**
 *
 * Este módulo é o espelho declarado do Módulo 3. O teste lê a migration do
 * `ap`, extrai a tabela de transições DELE, e confere que as duas contam a
 * mesma história **estrutural** com os nomes trocados.
 *
 * Se alguém mexer no ciclo de vida de um dos dois sem mexer no outro — ou sem
 * declarar a divergência —, quebra aqui. É o único lugar do repositório que
 * olha os dois módulos ao mesmo tempo, e ele é um TESTE, não código de
 * produção: nenhum dos dois pacotes importa o outro.
 */
describe('⭐ o espelho do Módulo 3 é estrutural, não coincidência', () => {
  const paresDe = (arquivo: string, fn: string) => {
    const sql = readFileSync(arquivo, 'utf8');
    const inicio = sql.indexOf(`create or replace function ${fn}`);
    assert.notEqual(inicio, -1, `${fn} não existe`);
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio)).replace(/--[^\n]*/g, '');
    return [...corpo.matchAll(/\(\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g)].map(
      ([, de, para]) => `${de}→${para}`,
    );
  };

  /** `settled` (pagar) ↔ `partially_received`/`received` (receber). */
  const TRADUZ: Readonly<Record<string, string>> = {
    open: 'open',
    partially_settled: 'partially_received',
    settled: 'received',
    cancelled: 'cancelled',
  };

  test('a tabela do ap, traduzida, é exatamente a do ar', () => {
    const doAp = paresDe(MIGRATION_AP, 'ap.allowed_transition');
    assert.ok(doAp.length > 0, 'nada extraído do ap — o teste ficou cego');

    const traduzido = doAp.map((par) => {
      const [de, para] = par.split('→') as [string, string];
      const dt = TRADUZ[de];
      const pt = TRADUZ[para];
      assert.ok(dt && pt, `estado ${par} do ap não tem tradução — o espelho tem um buraco`);
      return `${dt}→${pt}`;
    });

    const doAr = ALLOWED_TRANSITIONS.map(([de, para]) => `${de}→${para}`);

    assert.deepEqual(
      [...traduzido].sort(),
      [...doAr].sort(),
      'os dois ciclos de vida divergiram sem que a divergência fosse declarada aqui',
    );
  });

  /**
   * ⭐ **E A DIVERGÊNCIA QUE EXISTE, provada nos dois arquivos.**
   *
   * O `ap` recusa pagar a mais (`payables_no_overpay`). O `ar` **não tem essa
   * constraint**, e a ausência é a decisão mais importante do módulo. Se
   * alguém "consertar" o `ar` acrescentando a constraint por simetria, este
   * teste quebra e a razão está no `0010_ar.sql` §2.1.
   */
  test('⛔ a divergência é real e está nos dois arquivos', () => {
    const ap = readFileSync(MIGRATION_AP, 'utf8').replace(/--[^\n]*/g, '');
    const ar = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    assert.match(
      ap,
      /payables_no_overpay/,
      'o ap perdeu a constraint de não pagar a mais — o espelho perdeu o contraste',
    );
    assert.doesNotMatch(
      ar,
      /no_overpay|received_amount_cents <= amount_cents/,
      'o ar ganhou a constraint de não receber a mais — ver 0010_ar.sql §2.1',
    );
    // E o `check` de coerência aceita `>=`, que é onde a decisão vive.
    assert.match(ar, /status = 'received'\s+and received_amount_cents >= amount_cents/);
  });
});

describe('⭐ o estado que o valor recebido implica — e a divergência', () => {
  test('nada recebido é aberto; tudo recebido é recebido; no meio é parcial', () => {
    assert.equal(statusForReceipt(10_000, 0), 'open');
    assert.equal(statusForReceipt(10_000, 10_000), 'received');
    assert.equal(statusForReceipt(10_000, 4_000), 'partially_received');
  });

  test('⭐ receber a MAIOR continua sendo "recebido" — não é erro', () => {
    // Pagador arredondou, incluiu juros que este módulo não modela, ou quitou
    // dois documentos numa transferência só. O dinheiro está na conta.
    assert.equal(statusForReceipt(10_000, 12_000), 'received');
  });

  test('cancelamento é ato de gente, não consequência de aritmética', () => {
    assert.equal(statusForReceipt(10_000, 0, 'cancelled'), 'cancelled');
    assert.equal(statusForReceipt(10_000, 10_000, 'cancelled'), 'cancelled');
  });
});

const TITULO: Receivable = {
  externalRef: 'DOC-R-1',
  dueDate: '2026-09-10',
  amountCents: 150_000,
  receivedAmountCents: 0,
  currency: 'BRL',
  payerName: 'Contraparte Alfa',
  counterpartyTaxId: null,
  description: 'serviço prestado',
  settlementMethod: null,
  status: 'open',
};

describe('saldo, excedente e atraso', () => {
  test('o saldo a receber é o que falta', () => {
    assert.equal(
      outstandingCents({ ...TITULO, receivedAmountCents: 50_000, status: 'partially_received' }),
      100_000,
    );
  });

  test('⭐ recebido a maior NÃO devolve saldo negativo — devolve zero', () => {
    // Devolver negativo faria a tela somar um valor sem sentido no total em
    // aberto. O excedente é crédito do pagador, e tratá-lo é *Cobrança*.
    const t: Receivable = { ...TITULO, receivedAmountCents: 200_000, status: 'received' };
    assert.equal(outstandingCents(t), 0);
    assert.equal(overpaidCents(t), 50_000);
  });

  test('sem excedente, overpaidCents é zero', () => {
    assert.equal(overpaidCents(TITULO), 0);
    assert.equal(overpaidCents({ ...TITULO, receivedAmountCents: 150_000, status: 'received' }), 0);
  });

  test('título cancelado não tem saldo nem excedente', () => {
    assert.equal(outstandingCents({ ...TITULO, status: 'cancelled' }), 0);
    assert.equal(
      overpaidCents({ ...TITULO, receivedAmountCents: 999_000, status: 'cancelled' }),
      0,
    );
  });

  test('o relógio vem de fora: a função é pura e o teste não envelhece', () => {
    assert.equal(isOverdue(TITULO, '2026-09-11'), true);
    assert.equal(isOverdue(TITULO, '2026-09-10'), false, 'vencer hoje não é estar vencido');
    assert.equal(isOverdue(TITULO, '2026-01-01'), false);
  });

  test('recebido e cancelado não atrasam', () => {
    assert.equal(isOverdue({ ...TITULO, status: 'received' }, '2030-01-01'), false);
    assert.equal(isOverdue({ ...TITULO, status: 'cancelled' }, '2030-01-01'), false);
  });
});

describe('o resumo da carteira', () => {
  test('soma POR MOEDA, e nunca no total', () => {
    // Somar BRL com USD daria um número que não existe.
    const carteira: Receivable[] = [
      TITULO,
      { ...TITULO, externalRef: 'b', currency: 'USD', amountCents: 20_000 },
    ];
    const r = summarizeReceivables(carteira, '2026-01-01');
    assert.deepEqual(r.outstandingByCurrency, { BRL: 150_000, USD: 20_000 });
    assert.equal(r.open, 2);
  });

  test('conta os vencidos contra a data recebida', () => {
    const r = summarizeReceivables([TITULO], '2026-12-01');
    assert.equal(r.overdue, 1);
  });

  test('o excedente aparece separado, para a tela poder mostrá-lo', () => {
    const r = summarizeReceivables(
      [{ ...TITULO, receivedAmountCents: 200_000, status: 'received' }],
      '2026-01-01',
    );
    assert.deepEqual(r.overpaidByCurrency, { BRL: 50_000 });
    // E ele NÃO entra no saldo em aberto.
    assert.deepEqual(r.outstandingByCurrency, {});
  });

  test('carteira vazia é zero em tudo, não é erro', () => {
    assert.deepEqual(summarizeReceivables([], '2026-01-01'), {
      open: 0,
      overdue: 0,
      outstandingByCurrency: {},
      overpaidByCurrency: {},
    });
  });
});
