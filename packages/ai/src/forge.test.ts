import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import {
  AI_METRIC,
  canGenerate,
  composePrompt,
  engineLabel,
  engineState,
  findViolations,
  generationEventPayload,
  machineDraftInstruction,
  normalizeForbidden,
  validateRequest,
  whyCannotGenerate,
} from './forge.ts';
import type { BrandContext, GenerationRequest } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');

const MARCA: BrandContext = {
  identity: 'Uma empresa de serviços do interior, fundada por uma família.',
  tone: 'Direto, sem jargão, sem exagero.',
  forbidden: ['revolucionário', 'disruptivo'],
};

function pedido(over: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    kind: 'text',
    instruction: 'uma legenda curta para a peça de setembro',
    workContext: 'Campanha de setembro — três formatos.',
    brand: MARCA,
    ...over,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */

describe('⚖️ A LEI DO MOTOR — o fornecedor nunca chega à tela', () => {
  /**
   * ⭐ **É a lei mais importante deste pacote, e ela é ESTRUTURAL.**
   *
   * O tipo que a tela recebe não tem campo para o nome do fornecedor. Este
   * teste confere o objeto em runtime, porque um `as any` em algum lugar da
   * composição poderia enfiar um campo a mais sem o TypeScript ver.
   */
  test('⭐ o rótulo tem só a ETAPA e o motor da casa', () => {
    for (const kind of ['text', 'image'] as const) {
      const r = engineLabel(kind);
      assert.deepEqual(Object.keys(r).sort(), ['engine', 'step']);
      assert.equal(r.engine, 'motor ALSHAM');
    }
    assert.equal(engineLabel('text').step, 'Texto');
    assert.equal(engineLabel('image').step, 'Arte');
  });

  /**
   * ⛔ **A varredura de nome de fornecedor no pacote inteiro.**
   *
   * Não é paranoia: o caminho natural de o nome vazar é alguém escrevê-lo numa
   * mensagem de erro amigável — *"o Fulano recusou o pedido"* — e essa mensagem
   * chega à tela.
   *
   * ⚠️ Este teste vale para as STRINGS do pacote. As chaves de ambiente
   * (`ANTHROPIC_API_KEY`, `FAL_KEY`) vivem em `apps/api`, onde são permitidas
   * por serem código não-visível — a lei distingue as duas coisas, e a guarda
   * de CI cobre o outro lado.
   */
  test('⛔ nenhum nome de fornecedor aparece em NENHUM arquivo do pacote', () => {
    const proibidos = [
      'anthropic', 'claude', 'openai', 'gpt', 'chatgpt',
      'gemini', 'llama', 'mistral', 'deepseek',
      'ideogram', 'flux', 'imagen', 'fal.ai', 'dall',
      'opus clip', 'buffer',
    ];
    // ⚠️ **Os arquivos de teste ficam de fora, e a razão é boba e real:** este
    // teste PRECISA escrever os nomes que proíbe, e se varresse a si mesmo
    // reprovaria sempre. Ficou assim depois de reprovar exatamente por isso.
    //
    // A exclusão não abre buraco: teste não vai para o bundle, e o que a lei
    // protege é o texto que o CLIENTE lê.
    const arquivos = readdirSync(HERE).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    assert.ok(arquivos.length >= 3, 'a varredura ficou cega');

    for (const f of arquivos) {
      // ⚠️ **`CLAUDE.md` é o arquivo de instruções DESTE repositório**, e o
      // nome dele colide com o de um fornecedor quando tudo vira minúscula.
      // A referência ao canon é legítima e aparece em todo o repositório —
      // então ela sai da varredura, e só ela. Descoberto por este teste
      // reprovando na primeira execução.
      const texto = readFileSync(join(HERE, f), 'utf8')
        .replace(/CLAUDE\.md/g, 'CANON.md')
        .toLowerCase();
      for (const nome of proibidos) {
        assert.equal(
          texto.includes(nome),
          false,
          `"${nome}" aparece em ${f} — o motor é receita interna`,
        );
      }
    }
  });

  test('⛔ e o payload do fato não leva o adaptador', () => {
    const p = generationEventPayload({
      generationId: 'g1',
      kind: 'text',
      status: 'completed',
      promptLength: 120,
      consumed: 1,
      violations: [],
    });
    assert.equal('adapterId' in p, false, 'o nome do motor foi para a caixa de saída');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('⭐ o estado honesto — cada "não" tem o seu motivo', () => {
  const base = { demoMode: false, hasKey: true, runbookSection: '§12.3' };
  const dentro = { allowed: true, reason: 'within-limit' } as const;

  test('com chave, métrica e cota: pronto', () => {
    assert.deepEqual(engineState({ ...base, verdict: dentro }), { status: 'ready' });
  });

  test('⭐ sem chave: NÃO CONFIGURADO, com o ponteiro para o runbook', () => {
    const s = engineState({ ...base, hasKey: false, verdict: dentro });
    assert.equal(s.status, 'unconfigured');
    assert.match(whyCannotGenerate(s) ?? '', /runbook §12\.3/);
    assert.equal(canGenerate(s), false);
  });

  /**
   * ⛔ **A ordem importa, e este teste a fixa.**
   *
   * Num ambiente sem chave, dizer "você estourou a cota" mandaria o operador
   * procurar o problema no lugar errado — e ele nunca acharia, porque a cota
   * não é o problema.
   */
  test('⛔ sem chave vence "estourou": a mensagem certa é a que resolve', () => {
    const s = engineState({
      ...base,
      hasKey: false,
      verdict: { allowed: false, reason: 'blocked', limit: 10, used: 10 },
    });
    assert.equal(s.status, 'unconfigured');
  });

  /**
   * ⭐⭐ **SEM MEDIÇÃO, SEM GERAÇÃO.** É a regra dura da etapa.
   */
  test('⭐⭐ plano sem teto declarado para a métrica: geração DESLIGADA', () => {
    const s = engineState({
      ...base,
      verdict: { allowed: false, reason: 'no-limit-configured' },
    });
    assert.equal(s.status, 'unmetered');
    assert.equal(canGenerate(s), false);
    assert.match(whyCannotGenerate(s) ?? '', /Sem medição/);
    assert.match(whyCannotGenerate(s) ?? '', new RegExp(AI_METRIC));
  });

  test('cota estourada: diz quanto de quanto', () => {
    const s = engineState({
      ...base,
      verdict: { allowed: false, reason: 'blocked', limit: 50, used: 50 },
    });
    assert.equal(s.status, 'exhausted');
    assert.match(whyCannotGenerate(s) ?? '', /50 de 50/);
    assert.equal(canGenerate(s), false);
  });

  test('cota estourada com plano `meter`: PASSA, e conta o excedente', () => {
    // `metered` é `allowed: true` — o plano deixa passar e mede para cobrar
    // depois. Tratar isso como bloqueio cortaria quem contratou o contrário.
    const s = engineState({
      ...base,
      verdict: { allowed: true, reason: 'metered', limit: 50, used: 60, overage: 10 },
    });
    assert.equal(s.status, 'ready');
  });

  test('⭐ modo demonstração vence tudo, e é ROTULADO', () => {
    const s = engineState({
      ...base,
      demoMode: true,
      hasKey: false,
      verdict: { allowed: false, reason: 'no-limit-configured' },
    });
    assert.equal(s.status, 'demo');
    assert.equal(canGenerate(s), true);
    assert.equal(whyCannotGenerate(s), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('⭐ o Cérebro da Marca entra em toda geração', () => {
  test('o prompt carrega identidade, tom, vetos e contexto do trabalho', () => {
    const p = composePrompt(pedido());
    assert.match(p, /Quem somos: Uma empresa de serviços/);
    assert.match(p, /Como falamos: Direto/);
    assert.match(p, /Nunca use.*revolucionário, disruptivo/);
    assert.match(p, /Sobre este trabalho: Campanha de setembro/);
    assert.match(p, /O que é preciso produzir: uma legenda curta/);
  });

  test('marca vazia não deixa seção vazia no prompt', () => {
    const p = composePrompt(
      pedido({ brand: { identity: '  ', tone: '', forbidden: [] }, workContext: '' }),
    );
    assert.doesNotMatch(p, /Quem somos:/);
    assert.doesNotMatch(p, /Nunca use/);
    assert.match(p, /O que é preciso produzir/);
  });

  test('⚠️ a montagem é determinística — mesma entrada, mesma saída', () => {
    // Sem relógio e sem aleatório: é o que faz um resultado ruim ser
    // reproduzível, e o que permite testar o prompt sem chamar motor nenhum.
    assert.equal(composePrompt(pedido()), composePrompt(pedido()));
  });

  test('os vetos são limpos: sem vazio, sem repetição, sem espaço', () => {
    assert.deepEqual(
      normalizeForbidden(['  barato ', 'BARATO', '', '   ', 'grátis']),
      ['barato', 'grátis'],
    );
  });
});

describe('⭐ a rede de segurança DETECTA, nunca redige', () => {
  test('acusa o termo proibido que escapou', () => {
    assert.deepEqual(
      findViolations('uma solução revolucionária e disruptiva', ['disruptiva', 'barato']),
      ['disruptiva'],
    );
  });

  test('a busca é por palavra inteira', () => {
    // "caro" não pode acusar "carona". Um detector que acusa demais é um
    // detector que alguém desliga.
    assert.deepEqual(findViolations('pegou carona até a obra', ['caro']), []);
    assert.deepEqual(findViolations('ficou caro demais', ['caro']), ['caro']);
  });

  test('não diferencia maiúscula', () => {
    assert.deepEqual(findViolations('É DISRUPTIVO', ['disruptivo']), ['disruptivo']);
  });

  test('⛔ e o texto NÃO é alterado — quem decide é a pessoa', () => {
    // A função devolve os achados. Se ela devolvesse o texto "limpo", a peça
    // chegaria ao cliente com um buraco no meio da frase, e ninguém saberia
    // por quê.
    const achados = findViolations('produto revolucionário', ['revolucionário']);
    assert.deepEqual(achados, ['revolucionário']);
    assert.equal(typeof achados[0], 'string');
  });

  test('termo com caractere de regex não quebra a busca', () => {
    assert.deepEqual(findViolations('vale R$ 1.000 (mil)', ['1.000']), ['1.000']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('⛔ o fato não vaza o prompt', () => {
  /**
   * ⭐ O CORE-SPEC §4 é literal: *"a trilha nunca guarda segredo"*. O prompt
   * carrega o Cérebro da Marca do tenant e pode carregar o briefing de um
   * trabalho confidencial — e o envelope é entregue a qualquer consumidor
   * inscrito.
   */
  test('⭐ o payload leva o TAMANHO do prompt, nunca o prompt', () => {
    const p = generationEventPayload({
      generationId: 'g1',
      kind: 'text',
      status: 'requested',
      promptLength: composePrompt(pedido()).length,
    });
    assert.equal(p.promptLength, composePrompt(pedido()).length);
    assert.equal('prompt' in p, false);
    assert.equal('instruction' in p, false);
    assert.equal('brand' in p, false);
    // E nenhum valor do payload contém o texto da marca.
    const serializado = JSON.stringify(p);
    assert.doesNotMatch(serializado, /interior/);
    assert.doesNotMatch(serializado, /jargão/);
  });

  test('⭐ e leva a MÉTRICA e o consumo — é isso que se fatura', () => {
    const p = generationEventPayload({
      generationId: 'g1',
      kind: 'image',
      status: 'completed',
      promptLength: 10,
      consumed: 1,
      violations: ['barato'],
    });
    assert.equal(p.metric, AI_METRIC);
    assert.equal(p.consumed, 1);
    assert.deepEqual(p.violations, ['barato']);
  });

  test('o fato de falha leva a razão, curta', () => {
    const p = generationEventPayload({
      generationId: 'g1',
      kind: 'text',
      status: 'failed',
      promptLength: 10,
      failureReason: 'x'.repeat(500),
    });
    assert.equal((p.failureReason as string).length, 200);
  });

  test('⛔ pedido e falha NÃO levam consumo — só o que completou consumiu', () => {
    for (const status of ['requested', 'failed'] as const) {
      const p = generationEventPayload({ generationId: 'g', kind: 'text', status, promptLength: 1 });
      assert.equal('consumed' in p, false);
    }
  });
});

describe('a validação do pedido', () => {
  test('sem instrução não gera', () => {
    assert.match(validateRequest(pedido({ instruction: '   ' })) ?? '', /o que precisa/i);
  });

  test('instrução gigante é recusada antes de custar dinheiro', () => {
    assert.match(validateRequest(pedido({ instruction: 'x'.repeat(4001) })) ?? '', /longa demais/);
  });

  test('o pedido normal passa', () => {
    assert.equal(validateRequest(pedido()), null);
    assert.equal(validateRequest(pedido({ kind: 'image' })), null);
  });
});

describe('⭐ o rascunho de máquina é MARCADO como tal', () => {
  test('a instrução da versão diz quem a produziu', () => {
    const i = machineDraftInstruction({ instruction: 'legenda de setembro', violations: [] });
    assert.match(i, /Rascunho gerado pelo motor ALSHAM/);
    assert.match(i, /legenda de setembro/);
  });

  test('⭐ e carrega o aviso quando a marca foi violada', () => {
    const i = machineDraftInstruction({ instruction: 'legenda', violations: ['barato'] });
    assert.match(i, /contém termo\(s\) que a marca veta: barato/);
  });

  test('⛔ e nunca cita o fornecedor', () => {
    const i = machineDraftInstruction({ instruction: 'x', violations: [] });
    for (const n of ['anthropic', 'claude', 'gpt', 'ideogram']) {
      assert.equal(i.toLowerCase().includes(n), false);
    }
  });
});

describe('a métrica existe no catálogo de planos', () => {
  /**
   * ⭐ **Sem medição, sem geração** só é verdade se a métrica tiver teto
   * declarado em algum plano. Este teste lê o seed: se alguém remover as
   * linhas, o produto passa a nunca gerar — e é melhor descobrir aqui do que
   * numa demonstração.
   */
  test('⭐ o seed declara teto de geração em todos os planos', () => {
    const seed = readFileSync(SEED, 'utf8');
    const linhas = seed
      .split('\n')
      .filter((l) => l.includes(AI_METRIC) && !l.trimStart().startsWith('--'));
    assert.ok(linhas.length >= 3, `o seed declara ${AI_METRIC} em ${linhas.length} plano(s)`);
    for (const plano of ['free', 'starter', 'pro']) {
      assert.ok(
        linhas.some((l) => l.includes(`'${plano}'`)),
        `o plano ${plano} não declara teto para ${AI_METRIC}`,
      );
    }
  });
});
