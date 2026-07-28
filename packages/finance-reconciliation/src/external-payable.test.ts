import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import type { EventEnvelope } from '@alsham/core';

import {
  CONSUMED_EVENT_TYPES,
  CONSUMED_EVENT_PATTERN,
  CONSUMER_ID,
  toExternalPayable,
  handleExternalPayable,
  type ExternalPayable,
  type ExternalPayablePort,
} from './external-payable.ts';
import { MANIFEST } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Um envelope como o correio o entrega, com o payload que `0007_ap.sql` monta. */
function envelope(over: Partial<EventEnvelope> = {}, payload: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventType: 'ap.payable.registered',
    eventVersion: 1,
    producedBy: 'ap',
    occurredAt: '2026-07-28T10:00:00.000Z',
    correlationId: null,
    payload: {
      externalRef: 'DOC-2026-0001',
      dueDate: '2026-09-10',
      amountCents: 150_000,
      settledAmountCents: 0,
      currency: 'BRL',
      supplierName: 'Fornecedor Alfa',
      counterpartyTaxId: null,
      description: 'serviço prestado',
      status: 'open',
      ...payload,
    },
    ...over,
  } as EventEnvelope;
}

describe('a tradução do envelope', () => {
  test('o caso bom vira um título projetável', () => {
    const r = toExternalPayable(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.payable.externalRef, 'DOC-2026-0001');
    assert.equal(r.payable.amountCents, 150_000);
    assert.equal(r.payable.status, 'open');
    assert.equal(r.payable.tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  test('⭐ a origem vem do ENVELOPE, nunca de constante', () => {
    // Um segundo produtor — outro módulo, uma integração de ERP — emitindo o
    // mesmo formato é atendido sem uma linha a mais, e grava a origem CERTA.
    // Se alguém chumbar `'ap'` no tradutor, este teste é o que morde.
    const r = toExternalPayable(envelope({ producedBy: 'erp-bridge' }));
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.payable.sourceModuleId, 'erp-bridge');
  });

  test('envelope sem produtor não projeta — a linha violaria a coerência de origem', () => {
    const r = toExternalPayable(envelope({ producedBy: '' } as Partial<EventEnvelope>));
    assert.equal(r.kind, 'ignore');
  });

  test('a tradução acontece na fronteira: counterpartyTaxId vira supplierTaxId', () => {
    const r = toExternalPayable(envelope({}, { counterpartyTaxId: 'A-99-XYZ' }));
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.payable.supplierTaxId, 'A-99-XYZ');
  });

  test('os três tipos são traduzidos pelo mesmo caminho', () => {
    for (const tipo of CONSUMED_EVENT_TYPES) {
      const estado = tipo === 'ap.payable.cancelled' ? 'cancelled' : 'open';
      const r = toExternalPayable(envelope({ eventType: tipo }, { status: estado }));
      assert.equal(r.kind, 'apply', `${tipo} devia traduzir`);
    }
  });

  test('o cancelamento projeta o ESTADO, e não some com o título', () => {
    const r = toExternalPayable(
      envelope({ eventType: 'ap.payable.cancelled' }, { status: 'cancelled' }),
    );
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.payable.status, 'cancelled');
    // Continua trazendo valor e vencimento: cancelado não é apagado.
    assert.equal(r.payable.amountCents, 150_000);
  });

  test('tipo que não é deste módulo é ignorado, não é erro', () => {
    const r = toExternalPayable(envelope({ eventType: 'marketing.campaign.published' }));
    assert.equal(r.kind, 'ignore');
  });

  test('payload que não dá para projetar é ignorado — nunca lançado', () => {
    // Lançar faria o correio insistir e terminar em `dead` um evento que nunca
    // vai melhorar.
    const ruins: Record<string, unknown>[] = [
      { externalRef: '   ' },
      { dueDate: '10/09/2026' },
      { amountCents: 0 },
      { amountCents: -5 },
      { amountCents: 1500.5 },
      { currency: 'brl' },
      { status: 'pago' },
      { amountCents: 1000, settledAmountCents: 2000 },
    ];
    for (const p of ruins) {
      const r = toExternalPayable(envelope({}, p));
      assert.equal(r.kind, 'ignore', `${JSON.stringify(p)} devia ser ignorado`);
    }
  });

  test('campo novo no payload do produtor não quebra o consumidor', () => {
    // Evento publicado é contrato: campo não some, mas campo novo aparece.
    const r = toExternalPayable(envelope({}, { paymentMethod: 'transferência', foo: 42 }));
    assert.equal(r.kind, 'apply');
  });

  test('liquidação parcial atravessa inteira', () => {
    const r = toExternalPayable(
      envelope({}, { settledAmountCents: 50_000, status: 'partially_settled' }),
    );
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.payable.settledAmountCents, 50_000);
    assert.equal(r.payable.status, 'partially_settled');
  });
});

describe('o handler', () => {
  function porta(resposta: Awaited<ReturnType<ExternalPayablePort['recordExternalPayable']>>) {
    const chamadas: ExternalPayable[] = [];
    const port: ExternalPayablePort = {
      async recordExternalPayable(p) {
        chamadas.push(p);
        return resposta;
      },
    };
    return { port, chamadas };
  }

  test('projeta e conta o efeito', async () => {
    const { port, chamadas } = porta('created');
    const r = await handleExternalPayable(port)(envelope());
    assert.deepEqual(r, { kind: 'projected', effect: 'created' });
    assert.equal(chamadas.length, 1);
  });

  test('reentrega devolve `unchanged` — o caso comum, e é silencioso', async () => {
    const { port } = porta('unchanged');
    const r = await handleExternalPayable(port)(envelope());
    assert.deepEqual(r, { kind: 'projected', effect: 'unchanged' });
  });

  test('⚠️ mão humana ganha do evento, e o handler diz isso em voz alta', async () => {
    const { port } = porta('skipped-imported');
    const r = await handleExternalPayable(port)(envelope());
    assert.deepEqual(r, { kind: 'kept-local', externalRef: 'DOC-2026-0001' });
  });

  test('evento ignorado não encosta na porta', async () => {
    const { port, chamadas } = porta('created');
    const r = await handleExternalPayable(port)(envelope({ eventType: 'x.y.z' }));
    assert.equal(r.kind, 'ignored');
    assert.equal(chamadas.length, 0);
  });
});

/**
 * ⭐ **A PROVA DE QUE CONSUMIR NÃO É DEPENDER.**
 *
 * A guarda de CI ("módulo não conhece módulo") confere isto no repositório
 * inteiro. Este teste confere no pacote, e existe por uma razão: quem quebrar a
 * regra descobre aqui, ao rodar o teste do próprio módulo, e não no CI depois
 * do push.
 */
describe('este módulo não conhece o módulo que produz o que ele escuta', () => {
  const PKG = resolve(HERE, '../package.json');
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as Record<string, Record<string, string>>;

  test('o package.json não declara o produtor como dependência', () => {
    const todas = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const nome of Object.keys(todas)) {
      assert.notEqual(nome, '@alsham/accounts-payable');
    }
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@alsham/core']);
  });

  test('nenhum arquivo deste pacote importa o produtor', () => {
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (nome.endsWith('.ts')) arquivos.push(caminho);
      }
    };
    varrer(HERE);
    assert.ok(arquivos.length > 5, 'a varredura ficou cega');
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf8');
      assert.equal(
        /from\s+'@alsham\/accounts-payable'/.test(conteudo),
        false,
        `${arquivo} importa o produtor`,
      );
    }
  });

  test('a migration deste módulo não lê o schema do produtor', () => {
    const sql = readFileSync(resolve(HERE, '../../../supabase/migrations/0002_recon.sql'), 'utf8');
    const codigo = sql.replace(/--[^\n]*/g, '');
    assert.equal(/\bap\./.test(codigo), false, '0002_recon.sql toca o schema ap');
  });
});

describe('o manifesto e o consumidor contam a mesma história', () => {
  test('cada tipo declarado em `consumes` tem tradução construída (Lei 7)', () => {
    const declarados = MANIFEST.events.consumes.map((c) => c.type);
    assert.deepEqual([...declarados].sort(), [...CONSUMED_EVENT_TYPES].sort());
  });

  test('o padrão inscrito no correio cobre todos os tipos declarados', () => {
    const prefixo = CONSUMED_EVENT_PATTERN.replace(/\*$/, '');
    for (const tipo of CONSUMED_EVENT_TYPES) {
      assert.ok(tipo.startsWith(prefixo), `${tipo} não é coberto por ${CONSUMED_EVENT_PATTERN}`);
    }
  });

  test('o consumidor tem identidade própria — metade da chave de idempotência', () => {
    assert.ok(CONSUMER_ID.length > 0);
    // Não pode colidir com o id do módulo: o correio guarda
    // `(event_id, consumer)`, e dois consumidores com o mesmo nome se comeriam.
    assert.notEqual(CONSUMER_ID, MANIFEST.id);
  });
});
