import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0007_ap.sql');
const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa que o explica. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/**
 * O trecho do seed que registra ESTE módulo — e só ele.
 *
 * ⚠️ Escopo obrigatório, não zelo: `ap.payable.registered` aparece nos EMITE
 * deste módulo **e** nos CONSOME do `recon`. Quem lê o seed inteiro compararia
 * a emissão de um com o consumo do outro sem acusar nada.
 */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/);
  const meu = inserts.find((b) => b.includes("'ap',"));
  assert.ok(meu, 'o seed não registra o módulo ap');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  // Sem os comentários: um `'[]'` citado na prosa faz a busca não-gulosa
  // engatar nele e capturar texto no meio do array. Ver a nota equivalente em
  // `finance-reconciliation/src/manifest.test.ts`.
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo ap contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('declara o Domain finance da Taxonomia', () => {
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(
        p.key.startsWith(`${MANIFEST.id}.`),
        `permissão ${p.key} sem o prefixo do módulo não pode ser revogada em bloco`,
      );
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

  test('declara consumo de recon.match.decided e o handler existe', () => {
    const handler = readFileSync(resolve(HERE, './recon-settlement.ts'), 'utf8');
    const applyMig = (() => {
      try {
        return readFileSync(
          resolve(HERE, '../../../supabase/migrations/0014_ap_apply_recon_match.sql'),
          'utf8',
        );
      } catch {
        return '';
      }
    })();
    assert.ok(/recon\.match\.decided/.test(handler));
    assert.ok(/ap\.apply_recon_match/.test(applyMig));
    assert.deepEqual(
      MANIFEST.events.consumes.map((c) => c.type),
      ['recon.match.decided'],
    );
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'),
      'módulo não depende de módulo — a comunicação passa pelo Core',
    );
  });

  /**
   * ⭐ **A RAZÃO DE O `id` SER `ap` E NÃO `accounts-payable`.**
   *
   * O CORE-SPEC define o tipo de evento como `<moduleId>.<agregado>.<fato>`, e
   * `ap.emit_event()` tem um cinto que confere exatamente esse prefixo. Com
   * outro id, a porta de saída do módulo recusaria os próprios eventos dele —
   * em runtime, no primeiro título registrado, e não aqui.
   *
   * Este teste é o que faz a decisão parar de depender de alguém lembrar dela.
   */
  test('o id do módulo é o prefixo que o cinto de emit_event confere', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(
      cinto[1],
      MANIFEST.id,
      'o cinto do módulo recusaria os próprios eventos declarados no manifesto',
    );
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
  test('o seed registra este módulo, com este id, versão, nome e resumo', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.version}'`));
    assert.ok(blocoDoModulo.includes(MANIFEST.name));
    assert.ok(blocoDoModulo.includes(MANIFEST.summary));
  });

  test('a taxonomia é a mesma nos dois', () => {
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.layer}'`));
    assert.ok(blocoDoModulo.includes(`'${MANIFEST.taxonomy.domain}'`));
  });

  test('as capacidades do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('canonicalName') as { key: string }[];
    assert.deepEqual(
      seeded.map((c) => c.key).sort(),
      MANIFEST.capabilities.map((c) => c.key).sort(),
    );
  });

  test('as permissões do seed são exatamente as do manifesto', () => {
    const seeded = jsonBlockContaining('ap.payable.manage') as { key: string }[];
    assert.deepEqual(
      seeded.map((p) => p.key).sort(),
      MANIFEST.permissions.map((p) => p.key).sort(),
    );
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('ap.payable.registered') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.emits.map((e) => e.type).sort(),
    );
    for (const ev of MANIFEST.events.emits) {
      assert.equal(seeded.find((e) => e.type === ev.type)?.version, ev.version);
    }
  });

  test('os eventos consumidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('recon.match.decided') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(
      seeded.map((e) => e.type).sort(),
      MANIFEST.events.consumes.map((e) => e.type).sort(),
    );
  });

  test('⛔ o seed NÃO concede permissão de módulo — quem concede é o instalador', () => {
    // Papel de sistema vale em TODO tenant: conceder `ap.payable.*` no seed
    // daria o módulo de graça a qualquer tenant novo com um `admin`. É a
    // lição paga na Etapa 9, e ela não se repete por módulo novo.
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(ap\.[a-z.]+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(
      concedidas,
      [],
      'o seed concede permissão deste módulo — isso vaza para todos os tenants',
    );
  });
});

describe('a migration entrega o que o manifesto promete', () => {
  test('cada permissão declarada é conferida em algum lugar do schema', () => {
    for (const p of MANIFEST.permissions) {
      assert.ok(
        migrationCode.includes(`'${p.key}'`),
        `${p.key} está no manifesto e não é conferida por policy nem trigger`,
      );
    }
  });

  test('cada evento declarado é emitido por algum trigger', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(migrationCode.includes(`'${e.type}'`), `${e.type} é declarado e nunca emitido`);
    }
  });

  test('⛔ a tabela não tem porta de DELETE — cancelar é status', () => {
    assert.doesNotMatch(migrationCode, /create policy[\s\S]{0,80}for delete/i);
    assert.doesNotMatch(migrationCode, /grant[^;]*delete[^;]*on ap\./i);
  });

  test('a RLS nasce ligada E forçada, e nenhuma policy é aberta', () => {
    assert.match(migrationCode, /alter table ap\.payables enable row level security/);
    assert.match(migrationCode, /alter table ap\.payables force row level security/);
    assert.doesNotMatch(migrationCode, /using\s*\(\s*true\s*\)/i);
  });

  test('⛔ nenhum objeto fora do schema deste módulo', () => {
    // Um módulo não cria objeto em `core` nem toca no schema de outro (§5.5.1).
    // ⚠️ O NOME DO OBJETO, logo depois da palavra-chave — não "qualquer
    // menção". Este teste nasceu cego: `create table ap.payables (... references
    // core.tenants ...)` casava com uma varredura larga, e referenciar o Core é
    // exatamente o que um módulo DEVE fazer. O proibido é CRIAR lá.
    assert.doesNotMatch(migrationCode, /create table\s+(core|recon|marketing)\./i);
    assert.doesNotMatch(migrationCode, /create (or replace )?function\s+(core|recon|marketing)\./i);
    assert.doesNotMatch(migrationCode, /create policy[^;]*\son\s+(core|recon|marketing)\./i);
    assert.doesNotMatch(migrationCode, /create trigger[^;]*\son\s+(core|recon|marketing)\./i);
  });

  test('⛔ o ANTI-VIÉS está no schema, não só no comentário', () => {
    // Instrumento de pagamento é de um país e de uma década. A forma de pagar
    // é `payment_method`, texto livre.
    for (const proibido of ['boleto', 'pix', 'barcode', 'codigo_de_barras', 'linha_digitavel']) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${proibido}\\b`, 'i'),
        `${proibido} virou coluna — o schema envelheceu e parou de servir o cliente de fora`,
      );
    }
    // E o identificador fiscal é neutro de país.
    assert.doesNotMatch(migrationCode, /\bcnpj\b/i);
    assert.match(migrationCode, /counterparty_tax_id/);
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
      const conteudo = readFileSync(arquivo, 'utf8');
      assert.doesNotMatch(
        conteudo,
        /from\s+'@alsham\/(finance-reconciliation|marketing)'/,
        `${arquivo} importa outro módulo`,
      );
    }
  });

  test('a migration não lê o schema de nenhum outro módulo', () => {
    assert.doesNotMatch(migrationCode, /\b(recon|marketing)\./);
  });
});
