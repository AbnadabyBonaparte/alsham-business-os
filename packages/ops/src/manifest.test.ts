import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa que o explica. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/** O trecho do seed que registra ESTE módulo — e só ele. Escopo obrigatório. */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'ops',"));
  assert.ok(meu, 'o seed não registra o módulo ops');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo ops contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ **A DECISÃO DE CANON MAIS IMPORTANTE DESTA ETAPA, VERIFICADA.**
   *
   * A etapa se chama "Marketing Ops" e o módulo NÃO é do Domain Marketing.
   * Este teste lê a Taxonomia e confere que *Ordens de serviço* é capacidade
   * de **Operações** — se alguém mover a capacidade lá, o manifesto para de
   * bater aqui em vez de divergir em silêncio.
   */
  test('⭐ o Domain declarado é `operations`, e existe na Taxonomia com este nome', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'operations');
    assert.match(taxonomia, /Operações \(10\)/, 'a seção do Domain sumiu da Taxonomia');
  });

  test('⭐ e NÃO é marketing — o Módulo 2 já ocupa esse prefixo', () => {
    // Dois módulos no mesmo prefixo fariam `marketing.emit_event()` aceitar o
    // fato do vizinho, e a revogação em bloco por prefixo derrubaria permissão
    // de dois módulos ao desinstalar um.
    const dominio: string = MANIFEST.taxonomy.domain;
    assert.notEqual(dominio, 'marketing');
  });

  test('a capacidade declarada é uma das que a Taxonomia lista para o Domain', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    const linha = taxonomia.split('\n').find((l) => l.includes('Ordens de serviço · Checklist'));
    assert.ok(linha, 'a linha de capacidades do Domain sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades do Domain na Taxonomia`,
      );
    }
  });

  test('⚠️ *Checklist* é capacidade da Taxonomia e NÃO é declarada — Lei 7', () => {
    const declaradas: readonly string[] = MANIFEST.capabilities.map((c) => c.canonicalName);
    assert.equal(declaradas.includes('Checklist'), false);
    assert.doesNotMatch(migrationCode, /checklist/i, 'a capacidade não construída virou schema');
  });

  /**
   * ⭐ **O `module_id` é `ops` e não `os`, e os dois motivos se VERIFICAM.**
   *
   * ⚠️ Havia um terceiro, e ele era falso: "`os.` casaria dentro de `dados.` e
   * `tenants.` nas guardas de grep". Este teste foi escrito para demonstrá-lo
   * e **reprovou** — a matriz de guarda usa `\bOUTRO\.`, com fronteira de
   * palavra, e `\bos\.` não casa dentro de nada. O argumento caiu; a decisão
   * ficou de pé nos dois que sobraram. Lei 7 vale para o argumento também.
   */
  test('⭐ o id é `ops`, e os dois motivos se verificam no repositório', () => {
    assert.equal(MANIFEST.id, 'ops');

    // MOTIVO 1 — colisão com a Taxonomia: "OS" é uma CAMADA da hierarquia
    // canônica, não um módulo. Sol Único é a lei contra uma palavra querer
    // dizer duas coisas.
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.match(taxonomia, /OS \(VERTICAIS\)/, '"OS" é camada da hierarquia canônica');
    assert.match(taxonomia, /OS \/ VERTICAIS/, 'e é o título de uma seção inteira dela');

    // MOTIVO 2 — `os` é o artigo definido plural do idioma do repositório.
    // Contado, não estimado: um módulo com esse nome seria impossível de
    // procurar na documentação da própria casa.
    const ocorrencias = (taxonomia.match(/\bos\b/gi) ?? []).length;
    assert.ok(
      ocorrencias > 10,
      `a palavra solta "os" aparece ${ocorrencias} vezes só neste documento`,
    );
    assert.equal((taxonomia.match(/\bops\b/gi) ?? []).length, 0);
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3, 'permissão é <módulo>.<recurso>.<ação>');
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3, 'evento é <módulo>.<agregado>.<fato>');
      assert.equal(e.version, 1);
      // `sent-back` termina em `back`; `advanced`, `skipped`, `opened`,
      // `completed`, `cancelled` e `registered` terminam em `ed`. Os sete são
      // fato consumado — nenhum é pedido.
      assert.match(
        e.type.split('.')[2] as string,
        /(ed|back)$/,
        'evento é fato consumado, não pedido',
      );
    }
  });

  test('os sete fatos encomendados existem todos, com o prefixo corrigido', () => {
    const encomendados = [
      'order.opened',
      'stage.advanced',
      'stage.skipped',
      'order.sent-back',
      'order.completed',
      'order.cancelled',
      'deliverable.registered',
    ];
    // `readonly string[]` de propósito: com o tipo literal do manifesto, o
    // TypeScript recusaria a comparação — e a asserção deixaria de existir
    // exatamente no dia em que alguém RENOMEASSE um dos sete, que é quando ela
    // mais precisa estar de pé. Mesma lição do teste de capacidades do `crm`.
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`ops.${f}`), `o fato ops.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 7);
  });

  test('não declara consumo sem consumidor construído (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(!Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'));
  });

  test('o id do módulo é o prefixo que o cinto de emit_event confere', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(cinto[1], MANIFEST.id);
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${cinto[1]}.`));
    }
  });

  test('as constantes tipadas batem com o manifesto', () => {
    assert.deepEqual(
      Object.values(PERMISSIONS).sort(),
      MANIFEST.permissions.map((p) => p.key).sort(),
    );
    assert.deepEqual(
      Object.values(EVENTS).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('a taxonomia é a mesma nos dois', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.domain}'`));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
    for (const cap of MANIFEST.capabilities) {
      assert.equal(seeded.find((c) => c.key === cap.key)?.canonicalName, cap.canonicalName);
    }
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('ops.pipeline.design') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('ops.order.opened') as { type: string; version: number }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
    for (const ev of MANIFEST.events.emits) {
      assert.equal(seeded.find((e) => e.type === ev.type)?.version, ev.version);
    }
  });

  test('⛔ o seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(ops\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, [], 'o seed concede permissão deste módulo — isso vaza');
  });
});

describe('a migration entrega o que o manifesto promete', () => {
  test('cada permissão declarada é conferida em algum lugar do schema', () => {
    for (const p of MANIFEST.permissions) {
      assert.ok(migrationCode.includes(`'${p.key}'`), `${p.key} é declarada e nunca conferida`);
    }
  });

  test('cada evento declarado é emitido por algum trigger ou função', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(migrationCode.includes(`'${e.type}'`), `${e.type} é declarado e nunca emitido`);
    }
  });

  /**
   * ⭐ **A LEI DAS ETAPAS, VERIFICADA NO SCHEMA.**
   *
   * Nenhum enum de etapa, nem em `create type`, nem em `check`. A etapa é
   * linha de `ops.pipeline_stages` com o nome que o tenant escolheu — e este
   * teste procura pelos nomes do enunciado, que são justamente os que alguém
   * "padronizaria" primeiro.
   */
  test('⭐⭐ NENHUMA etapa virou enum, coluna ou constante', () => {
    assert.doesNotMatch(migrationCode, /create type ops\./i, 'nasceu um enum no módulo');
    for (const etapa of ['briefing', 'criacao', 'criação', 'revisao', 'revisão', 'veiculacao', 'veiculação']) {
      // ⚠️ **Sem `\\b` no FIM, e a diferença foi uma sabotagem.** `\\bbriefing\\b`
      // não casa em `briefing_ok`, porque `_` é caractere de palavra — e uma
      // coluna chamada `briefing_ok` é exatamente a forma mais provável de a
      // etapa de um cliente entrar no schema de todos: ninguém escreveria
      // `create type stage as enum`, mas um `boolean` com o nome do ofício
      // parece inofensivo.
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${etapa}`, 'i'),
        `a etapa "${etapa}" entrou no schema — a esteira de um cliente virou o produto`,
      );
    }
    // E a tabela que sustenta a lei existe.
    assert.match(migrationCode, /create table ops\.pipeline_stages/);
    assert.match(migrationCode, /requires_approval\s+boolean/);
    assert.match(migrationCode, /skippable\s+boolean/);
  });

  /**
   * ⭐ A palavra "aprovação" não pode aparecer em NENHUMA decisão do schema.
   * Quem diz o que é decisão é a coluna `requires_approval`, nunca o nome.
   */
  test('⛔ o SCHEMA não procura a palavra "aprovação" em lugar nenhum', () => {
    // A prosa dos comentários fala de aprovação o tempo todo — por isso a
    // busca é no CÓDIGO, sem comentários.
    assert.doesNotMatch(migrationCode, /name\s*=\s*'aprova/i);
    assert.doesNotMatch(migrationCode, /name\s+like\s+'%aprova/i);
  });

  test('⭐ pular exige razão, e devolver exige instrução — no banco, não só na tela', () => {
    assert.match(migrationCode, /btrim\(coalesce\(p_reason, ''\)\)\) = 0/);
    assert.match(migrationCode, /btrim\(coalesce\(p_instruction, ''\)\)\) = 0/);
  });

  test('⛔ só a etapa tem porta de DELETE — e é decisão declarada', () => {
    // Redesenhar a esteira é tentativa e erro; a trilha sobrevive porque
    // carimba o nome. Nenhuma OUTRA tabela do módulo tem DELETE.
    for (const t of ['pipelines', 'orders', 'order_events', 'deliverables']) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`grant[^;]*delete[^;]*on ops\\.${t}\\b`, 'i'),
        `${t} ganhou porta de DELETE`,
      );
    }
    assert.match(migrationCode, /grant select, insert, update, delete on ops\.pipeline_stages/);
  });

  /**
   * ⭐ **A TRILHA É IMUTÁVEL EM TRÊS CAMADAS**, e tem uma quarta garantia que
   * as outras tabelas do repositório não têm: nem INSERT ela aceita direto.
   */
  test('⛔ a trilha é imutável, e nem se escreve à mão', () => {
    assert.doesNotMatch(migrationCode, /create policy order_events_update/);
    assert.doesNotMatch(migrationCode, /create policy order_events_insert/);
    assert.doesNotMatch(migrationCode, /grant[^;]*(update|insert)[^;]*on ops\.order_events/i);
    assert.match(migrationCode, /create trigger order_events_immutable\s/);
    assert.match(migrationCode, /before update or delete on ops\.order_events/);
    // A porta que existe é só a leitura.
    assert.match(migrationCode, /grant select on ops\.order_events to authenticated/);
  });

  test('⛔ o entregável é imutável: refazer cria versão, nunca edita', () => {
    assert.doesNotMatch(migrationCode, /create policy deliverables_update/);
    assert.doesNotMatch(migrationCode, /grant[^;]*update[^;]*on ops\.deliverables/i);
    // ⚠️ `\\s` no fim, e a diferença foi uma sabotagem: sem ele, renomear o
    // gatilho para `deliverables_immutable_desligado` passaria batido — a
    // busca casaria com o PREFIXO do nome novo.
    assert.match(migrationCode, /create trigger deliverables_immutable\s/);
    assert.match(migrationCode, /deliverables_unique_version unique \(tenant_id, order_id, kind, version\)/);
  });

  test('⛔ NÃO há upload de arquivo — a referência é texto, e a ausência é declarada', () => {
    assert.doesNotMatch(migrationCode, /storage\./i);
    assert.doesNotMatch(migrationCode, /\bbytea\b/i);
    assert.match(migrationCode, /reference\s+text\s+not null/);
    // E a decisão está escrita no arquivo, não só na cabeça de quem escreveu.
    assert.match(migration, /NÃO HÁ UPLOAD DE ARQUIVO/);
  });

  test('a RLS nasce ligada E forçada nas cinco tabelas, e nenhuma policy é aberta', () => {
    for (const t of ['pipelines', 'pipeline_stages', 'orders', 'order_events', 'deliverables']) {
      assert.match(migrationCode, new RegExp(`alter table ops\\.${t} enable row level security`));
      assert.match(migrationCode, new RegExp(`alter table ops\\.${t} force row level security`));
    }
    assert.doesNotMatch(migrationCode, /using\s*\(\s*true\s*\)/i);
  });

  test('⭐ o responsável é membro DO TENANT — isolamento na chave, não na policy', () => {
    assert.match(migrationCode, /references core\.memberships \(tenant_id, user_id\)/);
    // Com a coluna explícita: sem ela, o `set null` tentaria anular `tenant_id`.
    assert.match(migrationCode, /on delete set null \(assignee_user_id\)/);
  });

  test('⛔ nenhum objeto fora do schema deste módulo', () => {
    assert.doesNotMatch(migrationCode, /create table\s+(core|recon|marketing|ap|crm|ar)\./i);
    assert.doesNotMatch(
      migrationCode,
      /create (or replace )?function\s+(core|recon|marketing|ap|crm|ar)\./i,
    );
    assert.doesNotMatch(migrationCode, /create policy[^;]*\son\s+(core|recon|marketing|ap|crm|ar)\./i);
    assert.doesNotMatch(migrationCode, /create trigger[^;]*\son\s+(core|recon|marketing|ap|crm|ar)\./i);
  });

  test('⛔ o ANTI-VIÉS está no schema, não só no comentário', () => {
    for (const proibido of [
      // Organograma e processo de UMA empresa.
      'department', 'departamento', 'sla_days', 'prioridade', 'priority',
      // Ferramenta como enum — a proibição explícita do enunciado.
      'trello', 'jira', 'asana', 'notion',
      // Custo e hora são capacidades próprias, não desta.
      'billable', 'horas_trabalhadas',
    ]) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${proibido}\\b`, 'i'),
        `${proibido} virou schema — o produto passou a vender o processo de um cliente`,
      );
    }
  });

  test('⛔ nem numeração de OS: o formato é convenção de cada casa', () => {
    assert.doesNotMatch(migrationCode, /create sequence/i);
    assert.doesNotMatch(migrationCode, /order_number|numero_os/i);
  });
});

describe('este módulo não conhece nenhum outro', () => {
  test('a única dependência do package.json é o Core', () => {
    const pkg = JSON.parse(readFileSync(resolve(HERE, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@alsham/core']);
  });

  test('nenhum arquivo importa outro módulo', () => {
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (nome.endsWith('.ts')) arquivos.push(caminho);
      }
    };
    varrer(HERE);
    assert.ok(arquivos.length > 3, 'a varredura ficou cega');
    for (const arquivo of arquivos) {
      assert.doesNotMatch(
        readFileSync(arquivo, 'utf8'),
        /from\s+'@alsham\/(finance-reconciliation|marketing|accounts-payable|crm|accounts-receivable)'/,
        `${arquivo} importa outro módulo`,
      );
    }
  });

  test('a migration não lê o schema de nenhum outro módulo', () => {
    assert.doesNotMatch(migrationCode, /\b(recon|marketing|ap|crm|ar)\./);
  });
});
