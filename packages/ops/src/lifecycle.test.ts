import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  isOnTheLine,
  canCancel,
  canComplete,
  orderedStages,
  nextStage,
  stagesBefore,
  isLastStage,
  permissionToAdvance,
  whyCannotAdvance,
  whyCannotSkip,
  isOverdue,
  buildBoard,
  summarizeOrders,
} from './order.ts';
import type { OrderStatus, PipelineStage, WorkOrder } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');
const MIGRATION_AP = resolve(HERE, '../../../supabase/migrations/0007_ap.sql');

const TODOS: readonly OrderStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

/** A esteira do enunciado: a de uma agência, com briefing pulável. */
const ESTEIRA: readonly PipelineStage[] = [
  { id: 's0', pipelineId: 'p', position: 0, name: 'abertura', requiresApproval: false, skippable: false },
  { id: 's1', pipelineId: 'p', position: 1, name: 'briefing', requiresApproval: false, skippable: true },
  { id: 's2', pipelineId: 'p', position: 2, name: 'criação', requiresApproval: false, skippable: false },
  { id: 's3', pipelineId: 'p', position: 3, name: 'revisão', requiresApproval: false, skippable: false },
  { id: 's4', pipelineId: 'p', position: 4, name: 'aprovação', requiresApproval: true, skippable: false },
  { id: 's5', pipelineId: 'p', position: 5, name: 'veiculação', requiresApproval: false, skippable: false },
];

function os(over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'o1',
    tenantId: 't1',
    pipelineId: 'p',
    currentStageId: 's2',
    title: 'Campanha de setembro',
    description: '',
    assigneeUserId: null,
    dueDate: null,
    status: 'in_progress',
    ...over,
  };
}

describe('o ciclo de vida da ordem de serviço', () => {
  test('ficar parado é sempre permitido — não é transição', () => {
    for (const s of TODOS) assert.equal(canTransition(s, s), false);
    // ⚠️ Diferente do `ar`: lá `canTransition(s, s)` é `true` porque a função
    // atende à pergunta "posso salvar sem mudar o estado?". Aqui a tabela é
    // literal — o que não está nela não passa —, e "ficar parado" nunca chega
    // a ser perguntado, porque o gatilho do banco devolve antes
    // (`if new.status = old.status then return new`). Duas respostas
    // diferentes para duas perguntas diferentes, e é por isso que este teste
    // existe: para a diferença ser deliberada e não descoberta.
  });

  test('cancelado é terminal: não sai de lá para lugar nenhum', () => {
    for (const destino of TODOS.filter((s) => s !== 'cancelled')) {
      assert.equal(canTransition('cancelled', destino), false);
    }
  });

  /**
   * ⭐⭐ **A DIVERGÊNCIA DO MÓDULO, e a razão dela.**
   *
   * No `ap`, `settled` é terminal: dinheiro tem identidade por documento, e um
   * título que volta a ser devido é documento novo. Aqui, trabalho tem
   * identidade por SERVIÇO: a entrega devolvida é o mesmo trabalho, e obrigar
   * uma segunda OS partiria em duas a história de um serviço só — que é
   * exatamente o que este módulo existe para manter inteira.
   */
  test('⭐ concluída VOLTA a andar: devolver reabre a OS', () => {
    assert.equal(canTransition('done', 'in_progress'), true);
  });

  test('⛔ mas concluída não vai direto para cancelada', () => {
    // Cancelar uma OS entregue apagaria a fronteira entre "não fizemos" e
    // "fizemos e entregamos". Se o trabalho tem de ser desfeito, devolve-se
    // primeiro — e aí o cancelamento é sobre o trabalho que voltou.
    assert.equal(canTransition('done', 'cancelled'), false);
  });

  test('a OS pode nascer e morrer sem nunca andar', () => {
    assert.equal(canTransition('open', 'done'), true);
    assert.equal(canTransition('open', 'cancelled'), true);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('open')].sort(), ['cancelled', 'done', 'in_progress']);
    assert.deepEqual([...nextStatuses('in_progress')].sort(), ['cancelled', 'done']);
    assert.deepEqual([...nextStatuses('done')], ['in_progress']);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('isOnTheLine separa quem está na esteira de quem saiu', () => {
    assert.equal(isOnTheLine('open'), true);
    assert.equal(isOnTheLine('in_progress'), true);
    assert.equal(isOnTheLine('done'), false);
    assert.equal(isOnTheLine('cancelled'), false);
  });

  test('canCancel e canComplete concordam com a tabela', () => {
    assert.equal(canCancel('in_progress'), true);
    assert.equal(canCancel('done'), false);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canComplete('open'), true);
    assert.equal(canComplete('cancelled'), false);
  });
});

/**
 * ⭐ **O ESPELHO SQL ↔ TypeScript.**
 *
 * Duas tabelas de transição para a mesma regra é uma a mais do que se pode
 * manter à mão. Este teste LÊ a migration e compara par a par: mudar um lado
 * só reprova, nos dois sentidos.
 */
describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
    const bloco = corpo.split('$$;')[0] ?? '';
    // ⚠️ Comentários fora ANTES de casar: a razão da divergência está escrita
    // dentro do corpo da função, com aspas simples no meio ("não é erro"), e
    // uma delas casaria como par se a prosa entrasse na busca. É a quarta vez
    // que este repositório aprende que comentário casa com regex de código.
    const semComentario = bloco
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const pares = new Set<string>();
    for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
      pares.add(`${m[1]}→${m[2]}`);
    }
    return pares;
  }

  test('ops.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'ops.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 6, 'o SQL declara seis pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ E a comparação com o `ap`, que é o módulo de quem esta divergência
   * diverge. Traduzido: `settled` ali é `done` aqui.
   *
   * O teste EXIGE que os dois sejam diferentes num ponto específico. Se algum
   * dia alguém "consertar por simetria" — tornando `done` terminal aqui, ou
   * `settled` reversível lá —, este teste reprova e obriga a decisão a ser
   * tomada de novo, por escrito.
   */
  test('⭐ o `ap` continua com o terminal que este módulo NÃO tem', () => {
    const doAp = paresDoSql(MIGRATION_AP, 'ap.allowed_transition');
    const doOps = paresDoSql(MIGRATION, 'ops.allowed_transition');

    assert.equal(
      doAp.has('settled→partially_settled') || doAp.has('settled→open'),
      true,
      'o `ap` estorna — ele reverte pagamento, o que é outra coisa',
    );
    assert.equal(
      doOps.has('done→in_progress'),
      true,
      'e o `ops` REABRE, que é o que o `ap` não faz',
    );
    assert.equal(
      doAp.has('settled→in_progress') || doAp.has('open→in_progress'),
      false,
      'o `ap` não tem estado de "andando": os dois ciclos não são o mesmo ciclo traduzido',
    );
  });
});

describe('a esteira se lê pela POSIÇÃO, nunca pela ordem de chegada', () => {
  test('orderedStages ordena mesmo que o banco devolva embaralhado', () => {
    const embaralhada = [ESTEIRA[3]!, ESTEIRA[0]!, ESTEIRA[5]!, ESTEIRA[1]!];
    assert.deepEqual(
      orderedStages(embaralhada).map((s) => s.name),
      ['abertura', 'briefing', 'revisão', 'veiculação'],
    );
  });

  test('nextStage anda uma casa, e devolve null na última', () => {
    assert.equal(nextStage(ESTEIRA, 's0')?.name, 'briefing');
    assert.equal(nextStage(ESTEIRA, 's4')?.name, 'veiculação');
    assert.equal(nextStage(ESTEIRA, 's5'), null);
  });

  test('nextStage pula buracos na numeração — posição não precisa ser contígua', () => {
    const comBuraco: PipelineStage[] = [
      { id: 'a', pipelineId: 'p', position: 0, name: 'um', requiresApproval: false, skippable: false },
      { id: 'b', pipelineId: 'p', position: 40, name: 'dois', requiresApproval: false, skippable: false },
    ];
    // Importa porque reordenar uma esteira à mão deixa buracos, e uma regra
    // que exigisse `position + 1` quebraria em silêncio no dia seguinte.
    assert.equal(nextStage(comBuraco, 'a')?.name, 'dois');
  });

  test('stagesBefore devolve os destinos válidos de uma devolução', () => {
    assert.deepEqual(
      stagesBefore(ESTEIRA, 's3').map((s) => s.name),
      ['abertura', 'briefing', 'criação'],
    );
    assert.deepEqual(stagesBefore(ESTEIRA, 's0'), []);
  });

  test('⭐ OS concluída pode voltar para QUALQUER etapa — ela não está em nenhuma', () => {
    assert.equal(stagesBefore(ESTEIRA, null).length, 6);
  });

  test('isLastStage sabe onde a esteira acaba', () => {
    assert.equal(isLastStage(ESTEIRA, 's5'), true);
    assert.equal(isLastStage(ESTEIRA, 's4'), false);
    assert.equal(isLastStage(ESTEIRA, null), false);
  });
});

describe('⭐ a permissão vem do DESENHO, não do nome da etapa', () => {
  test('a etapa marcada requiresApproval exige decide', () => {
    assert.equal(permissionToAdvance(ESTEIRA[4]!), 'ops.order.decide');
  });

  test('as demais bastam manage', () => {
    for (const s of ESTEIRA.filter((x) => !x.requiresApproval)) {
      assert.equal(permissionToAdvance(s), 'ops.order.manage');
    }
  });

  /**
   * ⛔ A sabotagem mais provável: alguém "melhorar" isto procurando a palavra
   * "aprovação" no nome. Este teste desenha uma etapa chamada "aprovação" que
   * o tenant NÃO marcou, e uma chamada "ok do cliente" que ele marcou.
   */
  test('⛔ o NOME da etapa não decide nada — só a coluna decide', () => {
    const chamadaAprovacao: PipelineStage = {
      id: 'x', pipelineId: 'p', position: 9, name: 'aprovação',
      requiresApproval: false, skippable: false,
    };
    const okDoCliente: PipelineStage = {
      id: 'y', pipelineId: 'p', position: 10, name: 'ok do cliente',
      requiresApproval: true, skippable: false,
    };
    assert.equal(permissionToAdvance(chamadaAprovacao), 'ops.order.manage');
    assert.equal(permissionToAdvance(okDoCliente), 'ops.order.decide');
  });
});

describe('por que NÃO dá para avançar ou pular', () => {
  test('avançar da última etapa não existe: dali se conclui', () => {
    const r = whyCannotAdvance(os({ currentStageId: 's5' }), ESTEIRA);
    assert.match(r ?? '', /última etapa/);
  });

  test('OS fora da esteira não avança', () => {
    assert.match(whyCannotAdvance(os({ status: 'done' }), ESTEIRA) ?? '', /não está mais/);
  });

  test('na etapa comum, avançar é possível', () => {
    assert.equal(whyCannotAdvance(os({ currentStageId: 's2' }), ESTEIRA), null);
  });

  test('⭐ a etapa que o tenant não marcou como pulável não pula', () => {
    const r = whyCannotSkip(os({ currentStageId: 's2' }), ESTEIRA);
    assert.match(r ?? '', /não foi desenhada como pulável/);
  });

  test('⭐ e a que ele marcou, pula', () => {
    assert.equal(whyCannotSkip(os({ currentStageId: 's1' }), ESTEIRA), null);
  });
});

describe('o quadro é montado com as etapas DO TENANT', () => {
  test('uma coluna por etapa, na ordem da esteira', () => {
    const colunas = buildBoard(ESTEIRA, []);
    assert.equal(colunas.length, 6);
    assert.deepEqual(colunas.map((c) => c.stage.name), [
      'abertura', 'briefing', 'criação', 'revisão', 'aprovação', 'veiculação',
    ]);
  });

  test('cada OS aparece na coluna da etapa dela', () => {
    const colunas = buildBoard(ESTEIRA, [
      os({ id: 'a', currentStageId: 's2' }),
      os({ id: 'b', currentStageId: 's2' }),
      os({ id: 'c', currentStageId: 's4' }),
    ]);
    assert.equal(colunas[2]!.orders.length, 2);
    assert.equal(colunas[4]!.orders.length, 1);
    assert.equal(colunas[0]!.orders.length, 0);
  });

  /**
   * ⛔ O erro que o quadro convida a cometer: pendurar a OS concluída na
   * última coluna, "porque foi onde ela parou". Ela não está lá — está fora da
   * esteira —, e mostrá-la ali faria a coluna "veiculação" acumular para
   * sempre tudo o que já foi entregue.
   */
  test('⛔ OS concluída e cancelada não entram em coluna nenhuma', () => {
    const colunas = buildBoard(ESTEIRA, [
      os({ id: 'a', currentStageId: 's5', status: 'done' }),
      os({ id: 'b', currentStageId: 's5', status: 'cancelled' }),
      os({ id: 'c', currentStageId: 's5', status: 'in_progress' }),
    ]);
    assert.equal(colunas[5]!.orders.length, 1);
    assert.equal(colunas[5]!.orders[0]!.id, 'c');
  });

  test('esteira sem OS devolve as colunas vazias, não uma lista vazia', () => {
    // A tela precisa desenhar a esteira mesmo sem trabalho nenhum: um quadro
    // vazio que não mostra as colunas parece um quadro quebrado.
    assert.equal(buildBoard(ESTEIRA, []).length, 6);
  });
});

describe('vencimento e resumo', () => {
  test('vencida é a que passou do prazo E ainda está na esteira', () => {
    assert.equal(isOverdue(os({ dueDate: '2026-07-01' }), '2026-07-28'), true);
    assert.equal(isOverdue(os({ dueDate: '2026-08-01' }), '2026-07-28'), false);
    assert.equal(isOverdue(os({ dueDate: null }), '2026-07-28'), false);
  });

  test('⛔ OS concluída não fica vencida para sempre', () => {
    // Marcar como vencido um trabalho já entregue transformaria o painel num
    // cemitério de alertas que ninguém pode resolver.
    assert.equal(isOverdue(os({ dueDate: '2026-07-01', status: 'done' }), '2026-07-28'), false);
  });

  test('o resumo conta, nunca estima', () => {
    const r = summarizeOrders(
      [
        os({ id: '1', status: 'open', dueDate: '2026-01-01' }),
        os({ id: '2', status: 'in_progress' }),
        os({ id: '3', status: 'done' }),
        os({ id: '4', status: 'cancelled' }),
      ],
      '2026-07-28',
    );
    assert.deepEqual(r, { total: 4, onTheLine: 2, done: 1, cancelled: 1, overdue: 1 });
  });
});
