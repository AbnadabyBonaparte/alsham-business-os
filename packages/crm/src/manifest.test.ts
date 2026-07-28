import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa que o explica. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/** O trecho do seed que registra ESTE módulo — e só ele. Escopo obrigatório. */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'crm',"));
  assert.ok(meu, 'o seed não registra o módulo crm');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  // Sem os comentários: um `'[]'` citado na prosa faz a busca não-gulosa
  // engatar nele e capturar texto no meio do array.
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo crm contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  /**
   * ⭐ **A DECISÃO DE CANON, VERIFICADA CONTRA A TAXONOMIA.**
   *
   * O `domain_key` não é escolha de gosto: ele referencia a Taxonomia (Sol
   * Único). Este teste lê o documento canônico e confere que a seção que
   * justifica a escolha existe de verdade — se alguém renomear o Domain lá, o
   * manifesto para de bater aqui em vez de divergir em silêncio.
   */
  test('o Domain declarado existe na Taxonomia, com este nome', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'crm');
    assert.match(taxonomia, /Comercial & CRM \(12\)/, 'a seção do Domain sumiu da Taxonomia');
  });

  test('a capacidade declarada é uma das que a Taxonomia lista para o Domain', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    const linha = taxonomia.split('\n').find((l) => l.includes('Pipeline · Propostas'));
    assert.ok(linha, 'a linha de capacidades do Domain sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades do Domain na Taxonomia`,
      );
    }
  });

  test('⚠️ uma capacidade da Taxonomia NÃO é declarada, e é decisão: WhatsApp', () => {
    // A Taxonomia nomeia as capacidades como o mercado as nomeia. Declarar
    // "WhatsApp" obrigaria o schema a conhecer o instrumento — e ele é de um
    // país e de uma década. O canal é texto livre.
    // `readonly string[]` de propósito: com o tipo literal do manifesto, o
    // TypeScript recusaria a comparação — e a asserção deixaria de existir
    // justamente no dia em que alguém acrescentasse "WhatsApp" à lista.
    const declaradas: readonly string[] = MANIFEST.capabilities.map((c) => c.canonicalName);
    assert.equal(declaradas.includes('WhatsApp'), false);
    assert.doesNotMatch(migrationCode, /whatsapp/i, 'o instrumento virou schema');
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
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
      assert.match(e.type.split('.')[2] as string, /ed$/, 'evento é fato consumado, não pedido');
    }
  });

  test('não declara consumo sem consumidor construído (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(!Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'));
  });

  /** ⭐ O id tem de ser o prefixo que o cinto confere. Padrão desde o Módulo 3. */
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
    assert.deepEqual(seeded.map((c) => c.key).sort(), MANIFEST.capabilities.map((c) => c.key).sort());
    for (const cap of MANIFEST.capabilities) {
      assert.equal(seeded.find((c) => c.key === cap.key)?.canonicalName, cap.canonicalName);
    }
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('crm.party.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('crm.party.registered') as { type: string; version: number }[];
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
    const concedidas = [...code.matchAll(/\('(crm\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(concedidas, [], 'o seed concede permissão deste módulo — isso vaza');
  });
});

describe('a migration entrega o que o manifesto promete', () => {
  test('cada permissão declarada é conferida em algum lugar do schema', () => {
    for (const p of MANIFEST.permissions) {
      assert.ok(migrationCode.includes(`'${p.key}'`), `${p.key} é declarada e nunca conferida`);
    }
  });

  test('cada evento declarado é emitido por algum trigger', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(migrationCode.includes(`'${e.type}'`), `${e.type} é declarado e nunca emitido`);
    }
  });

  test('⛔ nenhuma tabela tem porta de DELETE — arquivar é status', () => {
    assert.doesNotMatch(migrationCode, /create policy[\s\S]{0,80}for delete/i);
    assert.doesNotMatch(migrationCode, /grant[^;]*delete[^;]*on crm\./i);
  });

  /**
   * ⭐ **A IMUTABILIDADE DA INTERAÇÃO, EM TRÊS CAMADAS.**
   *
   * Fato consumado não se edita. Se o registro saiu errado, a correção é outra
   * interação — como um livro-caixa se corrige com estorno, nunca com borracha.
   */
  test('⛔ a interação é imutável nas três camadas', () => {
    // 1. sem policy de UPDATE (a RLS nega por ausência)
    assert.doesNotMatch(migrationCode, /create policy interactions_update/);
    // 2. sem GRANT de UPDATE (a porta não existe)
    assert.doesNotMatch(migrationCode, /grant[^;]*update[^;]*on crm\.interactions/i);
    // 3. e um trigger que levanta erro, para quem roda como dono do banco
    assert.match(migrationCode, /create trigger interactions_immutable/);
    assert.match(migrationCode, /before update or delete on crm\.interactions/);
  });

  test('a RLS nasce ligada E forçada nas duas tabelas, e nenhuma policy é aberta', () => {
    for (const t of ['parties', 'interactions']) {
      assert.match(migrationCode, new RegExp(`alter table crm\\.${t} enable row level security`));
      assert.match(migrationCode, new RegExp(`alter table crm\\.${t} force row level security`));
    }
    assert.doesNotMatch(migrationCode, /using\s*\(\s*true\s*\)/i);
  });

  test('⛔ nenhum objeto fora do schema deste módulo', () => {
    assert.doesNotMatch(migrationCode, /create table\s+(core|recon|marketing|ap)\./i);
    assert.doesNotMatch(migrationCode, /create (or replace )?function\s+(core|recon|marketing|ap)\./i);
    assert.doesNotMatch(migrationCode, /create policy[^;]*\son\s+(core|recon|marketing|ap)\./i);
    assert.doesNotMatch(migrationCode, /create trigger[^;]*\son\s+(core|recon|marketing|ap)\./i);
  });

  test('⛔ o ANTI-VIÉS está no schema, não só no comentário', () => {
    // Instrumento de contato, funil de venda e formato fiscal de um país.
    for (const proibido of [
      'whatsapp', 'instagram', 'telegram',
      'pipeline', 'funil', 'estagio', 'lead_score',
      'cpf', 'cnpj',
    ]) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${proibido}\\b`, 'i'),
        `${proibido} virou schema — o produto passou a vender o processo de um cliente`,
      );
    }
    // E o identificador é neutro.
    assert.match(migrationCode, /tax_id/);
  });

  test('⛔ `kind` tem exatamente dois valores — cliente/fornecedor são etiquetas', () => {
    const check = migrationCode.match(/check \(kind in \(([^)]*)\)\)/);
    assert.ok(check, 'o check de kind sumiu');
    const valores = [...(check[1] as string).matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(valores.sort(), ['org', 'person']);
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
        /from\s+'@alsham\/(finance-reconciliation|marketing|accounts-payable)'/,
        `${arquivo} importa outro módulo`,
      );
    }
  });

  test('a migration não lê o schema de nenhum outro módulo', () => {
    assert.doesNotMatch(migrationCode, /\b(recon|marketing|ap)\./);
  });
});
