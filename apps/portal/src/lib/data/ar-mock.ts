import { PERMISSIONS, canTransition } from '@alsham/accounts-receivable';
import type { Receivable, ReceivableStatus } from '@alsham/accounts-receivable';

import { DataPortError } from './port';
import type { ArPort, ReceivableRow } from './ar-port';

/**
 * Adapter MOCKADO do Módulo 5 — a tela se prova sem banco no ar.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo.** Os pagadores são
 * "Contraparte Alfa/Beta/Gama", as referências são `DOC-R-*`, as formas de
 * receber são genéricas. Nenhum nome de cliente, nenhum CNPJ, nenhum
 * instrumento de cobrança de país nenhum.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio própria — chama
 * `canTransition()` do pacote, porque um mock que aceita o que o banco recusa
 * faz a demonstração mentir sobre o produto.
 */

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const HOJE = '2026-07-28';

function titulo(over: Partial<ReceivableRow> & { id: string; externalRef: string }): ReceivableRow {
  return {
    dueDate: '2026-08-15',
    amountCents: 100_000,
    receivedAmountCents: 0,
    currency: 'BRL',
    payerName: null,
    counterpartyTaxId: null,
    description: '',
    settlementMethod: null,
    status: 'open',
    createdAt: `${HOJE}T09:00:00.000Z`,
    ...over,
  };
}

const TITULOS: ReceivableRow[] = [
  titulo({
    id: 'r-alfa',
    externalRef: 'DOC-R-2026-0001',
    payerName: 'Contraparte Alfa',
    description: 'Serviço prestado, parcela única.',
    dueDate: '2026-08-05',
    amountCents: 450_000,
  }),
  titulo({
    id: 'r-beta',
    externalRef: 'DOC-R-2026-0002',
    payerName: 'Contraparte Beta',
    description: 'Título com recebimento parcial registrado.',
    dueDate: '2026-08-20',
    amountCents: 1_200_000,
    receivedAmountCents: 400_000,
    status: 'partially_received',
    settlementMethod: 'transferência',
  }),
  titulo({
    id: 'r-gama',
    externalRef: 'DOC-R-2026-0003',
    payerName: 'Contraparte Gama',
    // ⭐ Vencido de propósito: é o estado que a tela precisa saber destacar, e
    // é justamente o que o operador quer cobrar.
    description: 'Título vencido, ainda em aberto.',
    dueDate: '2026-07-10',
    amountCents: 89_900,
  }),
  titulo({
    id: 'r-delta',
    externalRef: 'DOC-R-2026-0004',
    payerName: 'Contraparte Delta',
    // ⭐⭐ RECEBIDO A MAIOR, de propósito: é a divergência do módulo, e a tela
    // precisa saber MOSTRAR o excedente em vez de escondê-lo. Um excedente
    // invisível é um número que não bate e ninguém sabe por quê.
    description: 'Pagador arredondou para cima — entrou mais do que o devido.',
    dueDate: '2026-07-01',
    amountCents: 250_000,
    receivedAmountCents: 253_000,
    status: 'received',
  }),
  titulo({
    id: 'r-epsilon',
    externalRef: 'DOC-R-2026-0005',
    payerName: 'Contraparte Épsilon',
    description: 'Título cancelado — continua na lista, e é o ponto.',
    dueDate: '2026-09-01',
    amountCents: 33_000,
    status: 'cancelled',
  }),
];

export function createArMockPort(): ArPort {
  // Cópia por instância: uma demonstração não contamina a outra.
  const titulos = TITULOS.map((t) => ({ ...t }));
  let proximo = 1;

  return {
    kind: 'mock',

    async listPermissions() {
      // As duas, para a demonstração exercitar a tela inteira. Quem separa
      // registrar de cancelar é o papel do tenant, no banco.
      return new Set(Object.values(PERMISSIONS));
    },

    async loadReceivables() {
      return titulos.map((t) => ({ ...t }));
    },

    async createReceivable(receivable: Receivable) {
      if (titulos.some((t) => t.externalRef === receivable.externalRef)) {
        // O banco tem `unique (tenant_id, external_ref)`. O mock recusa igual:
        // demonstração que aceita o que produção recusa ensina o operador
        // errado.
        throw new DataPortError(`Já existe um título com a referência ${receivable.externalRef}.`);
      }
      const id = `r-novo-${proximo++}`;
      titulos.unshift({ ...receivable, id, createdAt: `${HOJE}T12:00:00.000Z` });
      return { receivableId: id };
    },

    async applyReceipt(input: {
      receivableId: string;
      receivedAmountCents: number;
      status: ReceivableStatus;
      settlementMethod: string | null;
    }) {
      const alvo = titulos.find((t) => t.id === input.receivableId);
      if (!alvo) throw new DataPortError('Título não encontrado.');
      // ⭐ E aqui NÃO há recusa por excedente — é a divergência do módulo, e o
      // mock tem de reproduzi-la para a demonstração ser honesta.
      alvo.receivedAmountCents = input.receivedAmountCents;
      alvo.status = input.status;
      if (input.settlementMethod !== null) alvo.settlementMethod = input.settlementMethod;
    },

    async updateStatus({
      receivableId,
      status,
    }: {
      receivableId: string;
      status: ReceivableStatus;
    }) {
      const alvo = titulos.find((t) => t.id === receivableId);
      if (!alvo) throw new DataPortError('Título não encontrado.');
      if (!canTransition(alvo.status, status)) {
        throw new DataPortError(`Um título ${alvo.status} não pode passar para ${status}.`);
      }
      alvo.status = status;
    },
  };
}
