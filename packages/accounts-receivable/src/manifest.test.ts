import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0010_ar.sql');
const TAXONOMIA = resolve(HERE, '../../../docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md');
const MATCHING = resolve(HERE, '../../finance-reconciliation/src/matching.ts');

const sql = readFileSync(SEED, 'utf8');
const migration = readFileSync(MIGRATION, 'utf8');

/** A migration sem os comentários — para ler CÓDIGO, não a prosa que o explica. */
const migrationCode = migration.replace(/--[^\n]*/g, '');

/**
 * O trecho do seed que registra ESTE módulo — e só ele.
 *
 * ⚠️ Escopo obrigatório: com cinco módulos no catálogo, `'ar'` aparece dentro de
 * outras strings e a mesma chave de evento aparece nas duas pontas de cada
 * contrato. Quem lê o seed inteiro compara o campo de um com o do outro.
 */
const blocoDoModulo = (() => {
  const inserts = sql.split(/insert into core\.module_registry/i);
  const meu = inserts.find((b) => /['"]ar['"]\s*,/.test(b) && /Contas a Receber/.test(b));
  assert.ok(meu, 'o seed não registra o módulo ar');
  return meu.slice(0, meu.indexOf('on conflict'));
})();

function jsonBlockContaining(needle: string): unknown[] {
  const blocks = blocoDoModulo.replace(/--[^\n]*/g, '').match(/'\[[\s\S]*?\]'::jsonb/g) ?? [];
  const hit = blocks.find((b) => b.includes(needle));
  assert.ok(hit, `nenhum bloco jsonb do módulo ar contém ${needle}`);
  return JSON.parse(hit.slice(1, hit.lastIndexOf("'")));
}

describe('o manifesto obedece ao contrato do Core', () => {
  test('declara o Domain finance da Taxonomia, e ele existe lá', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
    assert.match(taxonomia, /Financeiro \(19\)/, 'a seção do Domain sumiu da Taxonomia');
  });

  test('a capacidade declarada é uma das que a Taxonomia lista para o Domain', () => {
    const taxonomia = readFileSync(TAXONOMIA, 'utf8');
    const linha = taxonomia.split('\n').find((l) => l.includes('Contas a pagar · Contas a receber'));
    assert.ok(linha, 'a linha de capacidades do Domain financeiro sumiu da Taxonomia');
    const listadas = linha.split('·').map((c) => c.trim());
    for (const cap of MANIFEST.capabilities) {
      assert.ok(
        listadas.includes(cap.canonicalName),
        `${cap.canonicalName} não está entre as capacidades do Domain na Taxonomia`,
      );
    }
  });

  test('⚠️ *Cobrança* é capacidade do Domain e NÃO é declarada', () => {
    // Com "contas a receber" construído, listar *Cobrança* junto é a tentação.
    // Cobrar é régua, mensagem, juros e negativação — nada disso existe.
    const declaradas: readonly string[] = MANIFEST.capabilities.map((c) => c.canonicalName);
    assert.equal(declaradas.includes('Cobrança'), false);
    for (const proibido of ['juros', 'multa', 'regua', 'régua', 'negativa']) {
      assert.doesNotMatch(migrationCode, new RegExp(`\\b${proibido}`, 'i'));
    }
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

  /**
   * ⭐⭐ **O CICLO FECHOU.** Handler + porta SQL existem; `consumes` declara
   * `recon.match.decided`. Continua proibido declarar consumo sem handler.
   */
  test('AR declara consumo de recon.match.decided e o handler existe', () => {
    const motor = readFileSync(MATCHING, 'utf8');
    const reconMig = (() => {
      try {
        return readFileSync(
          resolve(HERE, '../../../supabase/migrations/0011_recon_receivables.sql'),
          'utf8',
        );
      } catch {
        return '';
      }
    })();
    const emitMig = (() => {
      try {
        return readFileSync(
          resolve(HERE, '../../../supabase/migrations/0012_recon_match_decided.sql'),
          'utf8',
        );
      } catch {
        return '';
      }
    })();
    const applyMig = (() => {
      try {
        return readFileSync(
          resolve(HERE, '../../../supabase/migrations/0013_ar_apply_recon_match.sql'),
          'utf8',
        );
      } catch {
        return '';
      }
    })();
    const handler = readFileSync(resolve(HERE, './recon-settlement.ts'), 'utf8');

    assert.ok(/scoreReceivablePair/.test(motor), 'motor de crédito ausente');
    assert.ok(/create table recon\.receivables/i.test(reconMig), '0011 ausente');
    assert.ok(/recon\.match\.decided/.test(emitMig), '0012 não emite match.decided');
    assert.ok(/ar\.apply_recon_match/.test(applyMig), '0013 sem porta de liquidação');
    assert.ok(/recon\.match\.decided/.test(handler), 'handler sem o tipo de evento');

    assert.deepEqual(
      MANIFEST.events.consumes.map((c) => c.type),
      ['recon.match.decided'],
    );
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(!Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'));
  });

  test('o id do módulo é o prefixo que o cinto de emit_event confere', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(cinto[1], MANIFEST.id);
    for (const e of MANIFEST.events.emits) assert.ok(e.type.startsWith(`${cinto[1]}.`));
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
    const seeded = jsonBlockContaining('ar.receivable.manage') as { key: string }[];
    assert.deepEqual(seeded.map((p) => p.key).sort(), MANIFEST.permissions.map((p) => p.key).sort());
  });

  test('os eventos emitidos do seed são exatamente os do manifesto', () => {
    const seeded = jsonBlockContaining('ar.receivable.registered') as {
      type: string;
      version: number;
    }[];
    assert.deepEqual(seeded.map((e) => e.type).sort(), MANIFEST.events.emits.map((e) => e.type).sort());
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
    const code = sql.replace(/--[^\n]*/g, '');
    const concedidas = [...code.matchAll(/\('(ar\.[a-z.]+)'\)/g)].map((m) => m[1]);
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

  test('⛔ a tabela não tem porta de DELETE — cancelar é status', () => {
    assert.doesNotMatch(migrationCode, /create policy[\s\S]{0,80}for delete/i);
    assert.doesNotMatch(migrationCode, /grant[^;]*delete[^;]*on ar\./i);
  });

  test('a RLS nasce ligada E forçada, e nenhuma policy é aberta', () => {
    assert.match(migrationCode, /alter table ar\.receivables enable row level security/);
    assert.match(migrationCode, /alter table ar\.receivables force row level security/);
    assert.doesNotMatch(migrationCode, /using\s*\(\s*true\s*\)/i);
  });

  test('⛔ nenhum objeto fora do schema deste módulo', () => {
    assert.doesNotMatch(migrationCode, /create table\s+(core|recon|marketing|ap|crm)\./i);
    assert.doesNotMatch(migrationCode, /create (or replace )?function\s+(core|recon|marketing|ap|crm)\./i);
    assert.doesNotMatch(migrationCode, /create policy[^;]*\son\s+(core|recon|marketing|ap|crm)\./i);
    assert.doesNotMatch(migrationCode, /create trigger[^;]*\son\s+(core|recon|marketing|ap|crm)\./i);
  });

  test('⛔ o ANTI-VIÉS está no schema, não só no comentário', () => {
    // Instrumento de cobrança de um país e de uma década.
    for (const proibido of [
      'boleto', 'pix', 'carne', 'carnê', 'barcode', 'codigo_de_barras',
      'linha_digitavel', 'nfe', 'cfop', 'cnpj', 'cpf',
    ]) {
      assert.doesNotMatch(
        migrationCode,
        new RegExp(`\\b${proibido}\\b`, 'i'),
        `${proibido} virou schema — o produto envelheceu junto com o instrumento`,
      );
    }
    assert.match(migrationCode, /counterparty_tax_id/);
  });
});

describe('este módulo não conhece nenhum outro — nem o que ele espelha', () => {
  test('a única dependência do package.json é o Core', () => {
    const pkg = JSON.parse(readFileSync(resolve(HERE, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@alsham/core']);
  });

  /**
   * ⭐ **Espelhar NÃO é importar.**
   *
   * Se os dois compartilhassem um `lifecycle` comum, mudar a regra de um
   * mudaria a do outro em silêncio — e a divergência de `0010_ar.sql` §2.1
   * seria impossível de expressar. O espelho vive num TESTE que lê os dois
   * arquivos, nunca num import.
   */
  test('nenhum arquivo de produção importa outro módulo — nem o accounts-payable', () => {
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) arquivos.push(caminho);
      }
    };
    varrer(HERE);
    assert.ok(arquivos.length >= 4, 'a varredura ficou cega');
    for (const arquivo of arquivos) {
      assert.doesNotMatch(
        readFileSync(arquivo, 'utf8'),
        /from\s+'@alsham\/(finance-reconciliation|marketing|accounts-payable|crm)'/,
        `${arquivo} importa outro módulo`,
      );
    }
  });

  test('a migration não lê o schema de nenhum outro módulo', () => {
    assert.doesNotMatch(migrationCode, /\b(recon|marketing|ap|crm)\./);
  });
});
