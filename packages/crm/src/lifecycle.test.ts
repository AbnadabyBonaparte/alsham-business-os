import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canRestore,
  normalizeTags,
  normalizeText,
  matchesQuery,
  summarizeParties,
} from './party.ts';
import type { Party, PartyStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');

const TODOS: readonly PartyStatus[] = ['active', 'archived'];

describe('o ciclo de vida da contraparte', () => {
  test('ficar parada é sempre permitido — não é transição', () => {
    for (const s of TODOS) {
      assert.equal(canTransition(s, s), true);
    }
  });

  /**
   * ⭐ **A DIFERENÇA DELIBERADA PARA O MÓDULO 3, e é ela que este teste guarda.**
   *
   * Lá, `cancelled` é terminal: um título que volta a ser devido é documento
   * NOVO, porque dinheiro tem identidade por documento.
   *
   * Aqui, a contraparte que volta é a MESMA pessoa. Obrigá-la a nascer de novo
   * partiria o histórico de contato em dois — que é exatamente o que este
   * módulo existe para manter inteiro.
   *
   * Se alguém "uniformizar" os dois ciclos por consistência, quebra aqui.
   */
  test('arquivada volta — ao contrário do título cancelado do Módulo 3', () => {
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), false);
  });

  test('arquivar só a partir de ativa', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), false);
  });
});

/**
 * ⭐ **O TESTE QUE FAZ DA DUPLICAÇÃO UMA ARQUITETURA.**
 *
 * A tabela de transições existe aqui e em `crm.allowed_transition()`, no
 * `0009_crm.sql`. Este teste LÊ o arquivo da migration, extrai os pares
 * literais e compara conjunto a conjunto — mesmo padrão do Módulo 3.
 */
describe('o schema e o domínio contam a mesma história', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  const paresDoSql = (() => {
    const inicio = sql.indexOf('create or replace function crm.allowed_transition');
    assert.notEqual(inicio, -1, 'a migration não declara crm.allowed_transition');
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

  test('e são exatamente as mesmas, sem repetição de nenhum lado', () => {
    assert.deepEqual([...paresDoSql].sort(), [...paresDoDominio].sort());
    assert.equal(new Set(paresDoSql).size, paresDoSql.length);
  });
});

describe('as etiquetas', () => {
  test('apara, descarta vazias, remove repetidas e ordena', () => {
    assert.deepEqual(normalizeTags(['  b ', 'a', 'b', '', '   ']), ['a', 'b']);
  });

  test('o que não é lista vira lista vazia', () => {
    assert.deepEqual(normalizeTags(undefined), []);
    assert.deepEqual(normalizeTags('cliente'), []);
  });

  test('⚠️ não existe lista de etiquetas válidas, e é decisão', () => {
    // Cada empresa recorta a carteira dela do jeito dela. Uma lista fechada
    // aqui seria o vocabulário de UM cliente virando obrigação de todos.
    const quaisquer = ['fornecedor', 'parceiro', 'ex-cliente', 'קונה', '取引先'];
    assert.deepEqual(normalizeTags(quaisquer), [...quaisquer].sort());
  });

  test('a ordenação é o que impede o evento de disparar por causa de ordem', () => {
    assert.deepEqual(normalizeTags(['b', 'a']), normalizeTags(['a', 'b']));
  });
});

const CONTRAPARTE: Party = {
  kind: 'org',
  displayName: 'Contraparte Alfa',
  taxId: 'A-99-XYZ',
  email: 'contato@alfa.invalid',
  phone: null,
  tags: ['fornecedor'],
  note: '',
  status: 'active',
};

describe('a busca da lista', () => {
  test('acha por nome, sem acento e sem caixa', () => {
    const p = { ...CONTRAPARTE, displayName: 'Construções Ártica' };
    assert.equal(matchesQuery(p, 'artica'), true);
    assert.equal(matchesQuery(p, 'CONSTRUCOES'), true);
  });

  test('acha por identificador, e-mail e etiqueta', () => {
    assert.equal(matchesQuery(CONTRAPARTE, 'a-99'), true);
    assert.equal(matchesQuery(CONTRAPARTE, 'alfa.invalid'), true);
    assert.equal(matchesQuery(CONTRAPARTE, 'fornecedor'), true);
  });

  test('busca vazia não filtra nada', () => {
    assert.equal(matchesQuery(CONTRAPARTE, ''), true);
    assert.equal(matchesQuery(CONTRAPARTE, '   '), true);
  });

  test('o que não bate, não bate', () => {
    assert.equal(matchesQuery(CONTRAPARTE, 'beta'), false);
  });

  test('contraparte sem contato não quebra a busca', () => {
    const p: Party = { ...CONTRAPARTE, taxId: null, email: null, tags: [] };
    assert.equal(matchesQuery(p, 'alfa'), true);
    assert.equal(matchesQuery(p, 'zzz'), false);
  });
});

describe('normalizeText', () => {
  test('tira acento, caixa e espaço repetido', () => {
    assert.equal(normalizeText('  ÁGUA   Viva '), 'agua viva');
  });
});

describe('o resumo da carteira', () => {
  test('conta o que existe, sem inventar número', () => {
    const carteira: Party[] = [
      CONTRAPARTE,
      { ...CONTRAPARTE, kind: 'person', status: 'archived' },
      { ...CONTRAPARTE, kind: 'person' },
    ];
    assert.deepEqual(summarizeParties(carteira), {
      total: 3,
      active: 2,
      archived: 1,
      people: 2,
      orgs: 1,
    });
  });

  test('carteira vazia é zero em tudo, não é erro', () => {
    assert.deepEqual(summarizeParties([]), {
      total: 0,
      active: 0,
      archived: 0,
      people: 0,
      orgs: 0,
    });
  });
});
