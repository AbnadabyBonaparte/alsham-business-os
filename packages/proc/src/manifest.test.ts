import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0105_proc.sql');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const STORE_TAX = resolve(HERE, '../../../apps/portal/src/lib/store-taxonomy.ts');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

/**
 * O trecho do seed que registra ESTE módulo — e só ele. Escopo obrigatório.
 *
 * ⚠️ Lazy de propósito: enquanto o PR pai não fia o cartão do `proc` no seed,
 * estas asserções falham — mas o arquivo inteiro não pode falhar no import só
 * por isso. Por isso a busca vive numa função, chamada dentro de cada teste.
 */
function blocoDoModulo(): string {
  const sql = readFileSync(SEED, 'utf8');
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'proc',"));
  assert.ok(meu, 'o seed não registra o módulo proc (aguardando o PR pai fiar o cartão)');
  return meu.slice(0, meu.indexOf('on conflict'));
}

function jsonBlockContaining(needle: string): unknown[] {
  const bloco = blocoDoModulo();
  const blocks = bloco.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo proc contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('⭐ é VERTICAL `government`, ancorado na linha de Governo', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'vertical');
    assert.equal((MANIFEST.taxonomy as { vertical: string }).vertical, 'government');
    assert.match(taxonomia, /Governo \(8\)/, 'a seção do vertical Governo sumiu da Taxonomia');
    const linha = taxonomia
      .split('\n')
      .find((l) => l.includes('Protocolo') && l.includes('Fiscalização'));
    assert.ok(linha, 'a linha de capacidades de Governo sumiu da Taxonomia');
    const listadas = linha!.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades de Governo na Taxonomia`,
      );
    }
  });

  test('⭐ a capacidade é *Protocolo* — a porta da frente do Estado', () => {
    const keys = MANIFEST.capabilities.map((c) => c.key);
    assert.deepEqual(keys, ['protocol']);
    assert.equal(MANIFEST.capabilities[0]!.canonicalName, 'Protocolo');
  });

  test('⭐ a chave vertical bate com a store-taxonomy (a pill gradua)', () => {
    // ⚠️ Pode falhar até o PR pai fiar a store-taxonomy — noted.
    const store = readFileSync(STORE_TAX, 'utf8');
    assert.ok(
      store.includes("key: 'government'"),
      'store-taxonomy.ts não tem a chave government — a pill não graduaria',
    );
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(p.key.startsWith(`${MANIFEST.id}.`));
      assert.equal(p.key.split('.').length, 3, 'permissão é <módulo>.<recurso>.<ação>');
    }
  });

  test('as três permissões são as do desenho: workflow.manage, process.manage, process.decide', () => {
    assert.deepEqual(
      MANIFEST.permissions.map((p) => p.key).sort(),
      ['proc.process.decide', 'proc.process.manage', 'proc.workflow.manage'],
    );
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3, 'evento é <módulo>.<agregado>.<fato>');
      assert.equal(e.version, 1);
      // `sent-back` termina em `back`; os demais em `ed`. Todos fato consumado.
      assert.match(e.type.split('.')[2] as string, /(ed|back)$/, 'evento é fato consumado, não pedido');
    }
  });

  test('os cinco fatos existem, com o prefixo do módulo', () => {
    const encomendados = [
      'process.registered',
      'stage.advanced',
      'stage.skipped',
      'process.sent-back',
      'process.decided',
    ];
    const emitidos: readonly string[] = MANIFEST.events.emits.map((e) => e.type);
    for (const f of encomendados) {
      assert.ok(emitidos.includes(`proc.${f}`), `o fato proc.${f} não é emitido`);
    }
    assert.equal(emitidos.length, 5);
  });

  test('consumes é VAZIO — sem redeploy do apps/api nesta onda (Lei 7)', () => {
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
    assert.deepEqual(Object.values(PERMISSIONS).sort(), MANIFEST.permissions.map((p) => p.key).sort());
    assert.deepEqual(Object.values(EVENTS).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });
});

describe('o seed transcreve o manifesto fielmente', () => {
  test('o seed registra este módulo, com esta versão, nome e resumo', () => {
    const bloco = blocoDoModulo();
    assert.ok(bloco.includes(`'${MANIFEST.version}'`));
    assert.ok(bloco.includes(MANIFEST.name));
    assert.ok(bloco.includes(MANIFEST.summary));
  });

  test('a taxonomia é a mesma nos dois', () => {
    const bloco = blocoDoModulo();
    assert.ok(bloco.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(bloco.includes(`'${(MANIFEST.taxonomy as { vertical: string }).vertical}'`));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string; canonicalName: string }[];
    assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('proc.process.decide') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('proc.process.registered') as { type: string; version: number }[];
    assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
  });

  test('⛔ o seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    const sql = readFileSync(SEED, 'utf8').replace(/--[^\n]*/g, '');
    const concedidas = [...sql.matchAll(/\('(proc\.[a-z.]+)'\)/g)].map((m) => m[1]);
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
   * ⭐ **A LEI DAS ETAPAS, VERIFICADA NO SCHEMA.** Nenhum enum de etapa, nem em
   * `create type`, nem em `check`. A etapa é linha de `proc.workflow_stages`.
   */
  test('⭐⭐ NENHUMA etapa virou enum, coluna ou constante', () => {
    assert.doesNotMatch(migrationCode, /create type proc\./i, 'nasceu um enum no módulo');
    // ⚠️ "instrução" NÃO entra na lista: é vocabulário do domínio (a instrução
    // do que refazer, no send_back), como no ops — não um nome de etapa.
    for (const etapa of ['protocolado', 'analise', 'análise', 'triagem', 'parecer']) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${etapa}`, 'i'),
        `a etapa "${etapa}" entrou no schema — o rito de um órgão virou o produto`,
      );
    }
    assert.match(migrationCode, /create table proc\.workflow_stages/);
    assert.match(migrationCode, /requires_approval\s+boolean/);
    assert.match(migrationCode, /skippable\s+boolean/);
  });

  test('⛔ o SCHEMA não procura a palavra "aprovação" em lugar nenhum', () => {
    assert.doesNotMatch(migrationCode, /name\s*=\s*'aprova/i);
    assert.doesNotMatch(migrationCode, /name\s+like\s+'%aprova/i);
  });

  /**
   * ⭐ O DIVERGE #1: o número de protocolo existe e é único por tenant — mas o
   * FORMATO é livre (nenhuma sequência no schema, a lição do ops).
   */
  test('⭐ o número de protocolo é único por tenant, e o formato NÃO é imposto', () => {
    assert.match(migrationCode, /processes_protocol_unique unique \(tenant_id, protocol_number\)/);
    assert.match(migrationCode, /protocol_number\s+text\s+not null/);
    // Sem sequência: o formato é convenção de cada órgão (a lição do ops).
    assert.doesNotMatch(migrationCode, /create sequence/i);
  });

  /**
   * ⭐ O DIVERGE #2: o interessado é ID SOLTO — sem FK cross-schema. O vínculo
   * ao cadastro é do crm, e amarrá-lo com FK leria o schema alheio.
   */
  test('⭐ o interessado é id solto + nome carimbado, sem FK cross-schema', () => {
    assert.match(migrationCode, /interested_party_id\s+uuid/);
    assert.match(migrationCode, /interested_party_name\s+text\s+not null/);
    // O único FK que o interessado poderia querer (crm) não existe.
    assert.doesNotMatch(migrationCode, /interested_party_id[^,]*references/i);
  });

  /**
   * ⭐⭐ O DIVERGE #3: a decisão formal é TERMINAL, e exige o despacho. Nenhum
   * dos três desfechos tem transição de SAÍDA em `allowed_transition`.
   */
  test('⭐⭐ a decisão formal é terminal e exige o despacho', () => {
    // Os três desfechos estão no CHECK de status.
    assert.match(migrationCode, /status in \('open', 'in_progress', 'deferred', 'denied', 'dismissed'\)/);
    // O porteiro exige a permissão E o despacho.
    assert.match(migrationCode, /proc\.process\.decide/);
    assert.match(migrationCode, /decision_note/);
    // Nenhuma transição sai de um terminal: o corpo de allowed_transition não
    // tem par ('deferred', ...), ('denied', ...) nem ('dismissed', ...).
    const corpo = migration.split('create or replace function proc.allowed_transition')[1]!.split('$$;')[0]!;
    const semComentario = corpo.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    for (const terminal of ['deferred', 'denied', 'dismissed']) {
      assert.doesNotMatch(
        semComentario,
        new RegExp(`\\(\\s*'${terminal}'\\s*,`),
        `${terminal} tem saída — o ato de império deixou de ser definitivo`,
      );
    }
  });

  test('⭐ pular exige razão, e devolver exige instrução — no banco, não só na tela', () => {
    assert.match(migrationCode, /btrim\(coalesce\(p_reason, ''\)\)\) = 0/);
    assert.match(migrationCode, /btrim\(coalesce\(p_instruction, ''\)\)\) = 0/);
  });

  test('⛔ só a etapa tem porta de DELETE — e é decisão declarada', () => {
    for (const t of ['workflows', 'processes', 'movements']) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`grant[^;]*delete[^;]*on proc\\.${t}\\b`, 'i'),
        `${t} ganhou porta de DELETE`,
      );
    }
    assert.match(migrationCode, /grant select, insert, update, delete on proc\.workflow_stages/);
  });

  /**
   * ⭐ A TRILHA É IMUTÁVEL EM TRÊS CAMADAS, e nem INSERT ela aceita direto.
   */
  test('⛔ a trilha é imutável, e nem se escreve à mão', () => {
    assert.doesNotMatch(migrationCode, /create policy movements_update/);
    assert.doesNotMatch(migrationCode, /create policy movements_insert/);
    assert.doesNotMatch(migrationCode, /grant[^;]*(update|insert)[^;]*on proc\.movements/i);
    assert.match(migrationCode, /create trigger movements_immutable\s/);
    assert.match(migrationCode, /before update or delete on proc\.movements/);
    assert.match(migrationCode, /grant select on proc\.movements to authenticated/);
  });

  test('a RLS nasce ligada E forçada nas quatro tabelas, e nenhuma policy é aberta', () => {
    for (const t of ['workflows', 'workflow_stages', 'processes', 'movements']) {
      assert.match(migrationCode, new RegExp(`alter table proc\\.${t} enable row level security`));
      assert.match(migrationCode, new RegExp(`alter table proc\\.${t} force row level security`));
    }
    assert.doesNotMatch(migrationCode, /using\s*\(\s*true\s*\)/i);
  });

  test('⭐ o responsável é membro DO TENANT — isolamento na chave, não na policy', () => {
    assert.match(migrationCode, /references core\.memberships \(tenant_id, user_id\)/);
    assert.match(migrationCode, /on delete set null \(assignee_user_id\)/);
  });

  test('⛔ o revoke vem DEPOIS das funções, e nem anon nem public recebem execute', () => {
    // O bloco de fechamento existe e revoga em bloco antes de conceder (0022).
    assert.match(migrationCode, /revoke all on all functions in schema proc from public, anon, authenticated/);
    const revokePos = migrationCode.indexOf('revoke all on all functions in schema proc');
    const lastFn = migrationCode.lastIndexOf('create or replace function proc.');
    assert.ok(revokePos > lastFn, 'o revoke precisa vir DEPOIS da última função (lição do 0022)');
  });

  test('⛔ nenhum objeto fora do schema deste módulo, e nenhuma leitura de schema alheio', () => {
    assert.doesNotMatch(migrationCode, /create table\s+(core|recon|marketing|ap|crm|ar|ops|deal)\./i);
    assert.doesNotMatch(
      migrationCode,
      /create (or replace )?function\s+(recon|marketing|ap|crm|ar|ops|deal)\./i,
    );
    // O interessado é id solto: o schema NÃO lê crm nem qualquer outro módulo.
    assert.doesNotMatch(migrationCode, /\b(recon|marketing|crm|ops|deal)\./);
  });

  test('⛔ o ANTI-VIÉS está no schema, não só no comentário', () => {
    for (const proibido of [
      'department', 'departamento', 'secretaria', 'sla_days', 'priority', 'prioridade',
      'sigilo', 'sigiloso', 'order_number', 'numero_processo',
    ]) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${proibido}\\b`, 'i'),
        `${proibido} virou schema — o produto passou a vender o processo de um órgão`,
      );
    }
    assert.doesNotMatch(migrationCode, /create sequence/i);
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
        /from\s+'@alsham\/(?!core)/,
        `${arquivo} importa outro módulo`,
      );
    }
  });
});
