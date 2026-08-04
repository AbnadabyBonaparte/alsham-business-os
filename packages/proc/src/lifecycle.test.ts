import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  FORMAL_DECISIONS,
  canTransition,
  nextStatuses,
  isInTransit,
  isDecided,
  canDecide,
  orderedStages,
  nextStage,
  stagesBefore,
  isLastStage,
  permissionToAdvance,
  whyCannotAdvance,
  whyCannotSkip,
  isOverdue,
  buildBoard,
  summarizeProcesses,
} from './proc.ts';
import type { ProcessStatus, WorkflowStage, Process } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0105_proc.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');

const TODOS: readonly ProcessStatus[] = ['open', 'in_progress', 'deferred', 'denied', 'dismissed'];

/** O rito do enunciado: o de um requerimento, com a análise pulável. */
const RITO: readonly WorkflowStage[] = [
  { id: 's0', workflowId: 'w', position: 0, name: 'protocolado', requiresApproval: false, skippable: false },
  { id: 's1', workflowId: 'w', position: 1, name: 'análise', requiresApproval: false, skippable: true },
  { id: 's2', workflowId: 'w', position: 2, name: 'instrução', requiresApproval: false, skippable: false },
  { id: 's3', workflowId: 'w', position: 3, name: 'parecer', requiresApproval: false, skippable: false },
  { id: 's4', workflowId: 'w', position: 4, name: 'decisão', requiresApproval: true, skippable: false },
];

function proc(over: Partial<Process> = {}): Process {
  return {
    id: 'p1',
    tenantId: 't1',
    workflowId: 'w',
    currentStageId: 's2',
    protocolNumber: '2026.0001',
    interestedPartyId: null,
    interestedPartyName: 'Maria da Silva',
    subject: 'Requerimento de alvará',
    description: '',
    assigneeUserId: null,
    dueDate: null,
    status: 'in_progress',
    decisionNote: '',
    ...over,
  };
}

describe('o ciclo de vida do processo administrativo', () => {
  test('ficar parado é sempre permitido — não é transição', () => {
    for (const s of TODOS) assert.equal(canTransition(s, s), false);
  });

  /**
   * ⭐⭐ **A DIVERGÊNCIA CENTRAL DO MÓDULO, e a razão dela.**
   *
   * No `ops`, `done → in_progress` existe: trabalho tem identidade por serviço,
   * e a entrega devolvida é o mesmo trabalho. Aqui, o ATO DE IMPÉRIO tem
   * identidade por decisão: proferido, é DEFINITIVO. Os três desfechos são
   * terminais, e nada sai deles.
   */
  test('⭐⭐ as três decisões formais são TERMINAIS: nada sai delas', () => {
    for (const terminal of FORMAL_DECISIONS) {
      assert.equal(isDecided(terminal), true);
      assert.deepEqual([...nextStatuses(terminal)], [], `${terminal} deveria ser terminal`);
      for (const destino of TODOS) {
        assert.equal(
          canTransition(terminal, destino),
          false,
          `${terminal} → ${destino} não pode existir: o ato de império é definitivo`,
        );
      }
    }
  });

  test('⭐ e NÃO existe done→in_progress — este módulo não reabre (o DIVERGE do ops)', () => {
    // A prova pelo negativo: nenhum terminal do proc reabre para tramitação.
    for (const terminal of FORMAL_DECISIONS) {
      assert.equal(canTransition(terminal, 'in_progress'), false);
    }
  });

  test('o processo pode nascer e ser decidido sem nunca tramitar', () => {
    assert.equal(canTransition('open', 'deferred'), true);
    assert.equal(canTransition('open', 'denied'), true);
    assert.equal(canTransition('open', 'dismissed'), true);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('open')].sort(), ['deferred', 'denied', 'dismissed', 'in_progress']);
    assert.deepEqual([...nextStatuses('in_progress')].sort(), ['deferred', 'denied', 'dismissed']);
    assert.deepEqual([...nextStatuses('deferred')], []);
    assert.deepEqual([...nextStatuses('denied')], []);
    assert.deepEqual([...nextStatuses('dismissed')], []);
  });

  test('isInTransit separa quem tramita de quem foi decidido', () => {
    assert.equal(isInTransit('open'), true);
    assert.equal(isInTransit('in_progress'), true);
    assert.equal(isInTransit('deferred'), false);
    assert.equal(isInTransit('denied'), false);
    assert.equal(isInTransit('dismissed'), false);
  });

  test('canDecide concorda com a tramitação', () => {
    assert.equal(canDecide('open'), true);
    assert.equal(canDecide('in_progress'), true);
    assert.equal(canDecide('deferred'), false);
  });
});

/**
 * ⭐ **O ESPELHO SQL ↔ TypeScript.**
 *
 * Este teste LÊ a migration e compara par a par: mudar um lado só reprova.
 */
describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
    const bloco = corpo.split('$$;')[0] ?? '';
    // ⚠️ Comentários fora ANTES de casar: a razão da divergência está escrita
    // dentro do corpo da função, e uma aspa na prosa casaria como par.
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

  test('proc.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'proc.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 7, 'o SQL declara sete pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ E a comparação com o `ops`, o módulo de quem esta divergência diverge.
   *
   * O teste EXIGE que os dois sejam diferentes num ponto específico: o `ops`
   * REABRE (`done → in_progress`); o `proc` NÃO tem saída de terminal nenhum.
   * Se algum dia alguém "consertar por simetria" — dar reabertura ao proc, ou
   * tirar a do ops —, este teste reprova e obriga a decisão a ser tomada de
   * novo, por escrito.
   */
  test('⭐⭐ o `ops` REABRE o terminal que este módulo torna DEFINITIVO', () => {
    const doOps = paresDoSql(MIGRATION_OPS, 'ops.allowed_transition');
    const doProc = paresDoSql(MIGRATION, 'proc.allowed_transition');

    assert.equal(doOps.has('done→in_progress'), true, 'o `ops` reabre a OS concluída');

    // Nenhum par do proc SAI de um desfecho terminal.
    for (const terminal of ['deferred', 'denied', 'dismissed']) {
      const saidas = [...doProc].filter((p) => p.startsWith(`${terminal}→`));
      assert.deepEqual(saidas, [], `${terminal} não pode ter saída: o ato de império é definitivo`);
    }
  });
});

describe('o rito se lê pela POSIÇÃO, nunca pela ordem de chegada', () => {
  test('orderedStages ordena mesmo que o banco devolva embaralhado', () => {
    const embaralhada = [RITO[3]!, RITO[0]!, RITO[4]!, RITO[1]!];
    assert.deepEqual(
      orderedStages(embaralhada).map((s) => s.name),
      ['protocolado', 'análise', 'parecer', 'decisão'],
    );
  });

  test('nextStage anda uma casa, e devolve null na última', () => {
    assert.equal(nextStage(RITO, 's0')?.name, 'análise');
    assert.equal(nextStage(RITO, 's3')?.name, 'decisão');
    assert.equal(nextStage(RITO, 's4'), null);
  });

  test('nextStage pula buracos na numeração — posição não precisa ser contígua', () => {
    const comBuraco: WorkflowStage[] = [
      { id: 'a', workflowId: 'w', position: 0, name: 'um', requiresApproval: false, skippable: false },
      { id: 'b', workflowId: 'w', position: 40, name: 'dois', requiresApproval: false, skippable: false },
    ];
    assert.equal(nextStage(comBuraco, 'a')?.name, 'dois');
  });

  test('stagesBefore devolve os destinos válidos de uma devolução', () => {
    assert.deepEqual(
      stagesBefore(RITO, 's3').map((s) => s.name),
      ['protocolado', 'análise', 'instrução'],
    );
    assert.deepEqual(stagesBefore(RITO, 's0'), []);
  });

  /**
   * ⭐⭐ O DIVERGE do `ops` na função: no `ops`, a OS concluída (sem etapa
   * atual) podia voltar para QUALQUER etapa. Aqui, processo decidido NÃO se
   * devolve — sem etapa atual, não há destino.
   */
  test('⭐⭐ processo decidido não tem destino de devolução — o oposto do ops', () => {
    assert.deepEqual(stagesBefore(RITO, null), []);
  });

  test('isLastStage sabe onde o rito acaba', () => {
    assert.equal(isLastStage(RITO, 's4'), true);
    assert.equal(isLastStage(RITO, 's3'), false);
    assert.equal(isLastStage(RITO, null), false);
  });
});

describe('⭐ a permissão vem do DESENHO, não do nome da etapa', () => {
  test('a etapa marcada requiresApproval exige decide', () => {
    assert.equal(permissionToAdvance(RITO[4]!), 'proc.process.decide');
  });

  test('as demais bastam manage', () => {
    for (const s of RITO.filter((x) => !x.requiresApproval)) {
      assert.equal(permissionToAdvance(s), 'proc.process.manage');
    }
  });

  /**
   * ⛔ A sabotagem mais provável: alguém "melhorar" isto procurando a palavra
   * "decisão" ou "aprovação" no nome. Este teste desenha uma etapa chamada
   * "decisão" que o tenant NÃO marcou, e uma chamada "conferência" que marcou.
   */
  test('⛔ o NOME da etapa não decide nada — só a coluna decide', () => {
    const chamadaDecisao: WorkflowStage = {
      id: 'x', workflowId: 'w', position: 9, name: 'decisão',
      requiresApproval: false, skippable: false,
    };
    const conferencia: WorkflowStage = {
      id: 'y', workflowId: 'w', position: 10, name: 'conferência',
      requiresApproval: true, skippable: false,
    };
    assert.equal(permissionToAdvance(chamadaDecisao), 'proc.process.manage');
    assert.equal(permissionToAdvance(conferencia), 'proc.process.decide');
  });
});

describe('por que NÃO dá para avançar ou pular', () => {
  test('avançar da última etapa não existe: dali se decide', () => {
    const r = whyCannotAdvance(proc({ currentStageId: 's4' }), RITO);
    assert.match(r ?? '', /última etapa/);
  });

  test('processo decidido não avança', () => {
    assert.match(whyCannotAdvance(proc({ status: 'deferred' }), RITO) ?? '', /já foi decidido/);
  });

  test('na etapa comum, avançar é possível', () => {
    assert.equal(whyCannotAdvance(proc({ currentStageId: 's2' }), RITO), null);
  });

  test('⭐ a etapa que o tenant não marcou como pulável não pula', () => {
    const r = whyCannotSkip(proc({ currentStageId: 's2' }), RITO);
    assert.match(r ?? '', /não foi desenhada como pulável/);
  });

  test('⭐ e a que ele marcou, pula', () => {
    assert.equal(whyCannotSkip(proc({ currentStageId: 's1' }), RITO), null);
  });
});

describe('o quadro é montado com as etapas DO TENANT', () => {
  test('uma coluna por etapa, na ordem do rito', () => {
    const colunas = buildBoard(RITO, []);
    assert.equal(colunas.length, 5);
    assert.deepEqual(colunas.map((c) => c.stage.name), [
      'protocolado', 'análise', 'instrução', 'parecer', 'decisão',
    ]);
  });

  test('cada processo aparece na coluna da etapa dele', () => {
    const colunas = buildBoard(RITO, [
      proc({ id: 'a', currentStageId: 's2' }),
      proc({ id: 'b', currentStageId: 's2' }),
      proc({ id: 'c', currentStageId: 's4' }),
    ]);
    assert.equal(colunas[2]!.processes.length, 2);
    assert.equal(colunas[4]!.processes.length, 1);
    assert.equal(colunas[0]!.processes.length, 0);
  });

  test('⛔ processo decidido não entra em coluna nenhuma', () => {
    const colunas = buildBoard(RITO, [
      proc({ id: 'a', currentStageId: 's4', status: 'deferred' }),
      proc({ id: 'b', currentStageId: 's4', status: 'denied' }),
      proc({ id: 'c', currentStageId: 's4', status: 'in_progress' }),
    ]);
    assert.equal(colunas[4]!.processes.length, 1);
    assert.equal(colunas[4]!.processes[0]!.id, 'c');
  });

  test('rito sem processo devolve as colunas vazias, não uma lista vazia', () => {
    assert.equal(buildBoard(RITO, []).length, 5);
  });
});

describe('vencimento e resumo', () => {
  test('vencido é o que passou do prazo E ainda tramita', () => {
    assert.equal(isOverdue(proc({ dueDate: '2026-07-01' }), '2026-07-28'), true);
    assert.equal(isOverdue(proc({ dueDate: '2026-08-01' }), '2026-07-28'), false);
    assert.equal(isOverdue(proc({ dueDate: null }), '2026-07-28'), false);
  });

  test('⛔ processo decidido não fica vencido para sempre', () => {
    assert.equal(isOverdue(proc({ dueDate: '2026-07-01', status: 'deferred' }), '2026-07-28'), false);
  });

  test('o resumo conta, nunca estima', () => {
    const r = summarizeProcesses(
      [
        proc({ id: '1', status: 'open', dueDate: '2026-01-01' }),
        proc({ id: '2', status: 'in_progress' }),
        proc({ id: '3', status: 'deferred' }),
        proc({ id: '4', status: 'denied' }),
        proc({ id: '5', status: 'dismissed' }),
      ],
      '2026-07-28',
    );
    assert.deepEqual(r, {
      total: 5, inTransit: 2, deferred: 1, denied: 1, dismissed: 1, overdue: 1,
    });
  });
});
