import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildShelf, isLive, producerOf, summarizeShelf } from './catalog.ts';
import type { CatalogEntry, TenantModuleRow } from './catalog.ts';

const entrada = (over: Partial<CatalogEntry> & { moduleId: string }): CatalogEntry => ({
  name: 'Módulo',
  version: '0.1.0',
  summary: 'Resumo.',
  layer: 'domain',
  domainKey: 'finance',
  verticalKey: null,
  capabilities: [],
  permissions: [],
  emits: [],
  consumes: [],
  ...over,
});

const instalado = (moduleId: string, status: TenantModuleRow['status'], version = '0.1.0'): TenantModuleRow => ({
  moduleId,
  status,
  version,
  installedAt: '2026-07-28T00:00:00.000Z',
});

describe('o estado de cada item da prateleira', () => {
  test('sem linha no tenant, o módulo está disponível', () => {
    const [item] = buildShelf([entrada({ moduleId: 'recon' })], []);
    assert.equal(item?.state, 'available');
  });

  test('ativo é instalado', () => {
    const [item] = buildShelf([entrada({ moduleId: 'recon' })], [instalado('recon', 'active')]);
    assert.equal(item?.state, 'installed');
  });

  test('⭐ desinstalado NÃO volta a "disponível" — é "já instalado antes"', () => {
    // A distinção existe porque o DADO do módulo continua no banco. Mostrar
    // "disponível" faria o cliente achar que reinstalar começa do zero.
    const [item] = buildShelf(
      [entrada({ moduleId: 'marketing' })],
      [instalado('marketing', 'uninstalled')],
    );
    assert.equal(item?.state, 'previously-installed');
  });

  test('suspenso é estado próprio — desligado, não removido', () => {
    const [item] = buildShelf([entrada({ moduleId: 'recon' })], [instalado('recon', 'suspended')]);
    assert.equal(item?.state, 'suspended');
  });

  test('a versão instalada só aparece quando difere da publicada', () => {
    const iguais = buildShelf([entrada({ moduleId: 'a', version: '1.0.0' })], [instalado('a', 'active', '1.0.0')]);
    const difere = buildShelf([entrada({ moduleId: 'a', version: '2.0.0' })], [instalado('a', 'active', '1.0.0')]);
    assert.equal(iguais[0]?.installedVersion, null);
    assert.equal(difere[0]?.installedVersion, '1.0.0');
  });
});

describe('⭐ honestidade na vitrine: de quem o módulo escuta', () => {
  test('o prefixo do evento é quem o emite', () => {
    assert.equal(producerOf('recon.approval.decided'), 'recon');
    assert.equal(producerOf('marketing.campaign.published'), 'marketing');
  });

  test('um módulo que consome evento diz DE QUEM', () => {
    const [item] = buildShelf(
      [
        entrada({
          moduleId: 'marketing',
          consumes: [{ type: 'recon.approval.decided', description: '' }],
        }),
      ],
      [],
    );
    assert.deepEqual(item?.listensTo, ['recon']);
  });

  test('escutar o próprio Core não conta como depender de módulo', () => {
    const [item] = buildShelf(
      [entrada({ moduleId: 'x', consumes: [{ type: 'core.module.installed', description: '' }] })],
      [],
    );
    assert.deepEqual(item?.listensTo, []);
  });

  test('e escutar a si mesmo também não', () => {
    const [item] = buildShelf(
      [entrada({ moduleId: 'x', consumes: [{ type: 'x.algo.aconteceu', description: '' }] })],
      [],
    );
    assert.deepEqual(item?.listensTo, []);
  });

  test('dois eventos do mesmo emissor aparecem uma vez só', () => {
    const [item] = buildShelf(
      [
        entrada({
          moduleId: 'm',
          consumes: [
            { type: 'recon.approval.decided', description: '' },
            { type: 'recon.statement.discarded', description: '' },
          ],
        }),
      ],
      [],
    );
    assert.deepEqual(item?.listensTo, ['recon']);
  });

  test('módulo sem consumo não escuta ninguém', () => {
    const [item] = buildShelf([entrada({ moduleId: 'recon' })], []);
    assert.deepEqual(item?.listensTo, []);
  });
});

describe('o resumo do cabeçalho', () => {
  test('desinstalado NÃO ocupa vaga no plano', () => {
    // Tem de bater com o critério de `core.install_module()`, que conta
    // active + installing + suspended.
    const r = summarizeShelf(
      buildShelf(
        [entrada({ moduleId: 'a' }), entrada({ moduleId: 'b' }), entrada({ moduleId: 'c' })],
        [instalado('a', 'active'), instalado('b', 'uninstalled')],
      ),
    );
    assert.equal(r.total, 3);
    assert.equal(r.installed, 1);
    assert.equal(r.available, 2);
  });

  test('suspenso ocupa vaga — está instalado, só desligado', () => {
    const r = summarizeShelf(
      buildShelf([entrada({ moduleId: 'a' })], [instalado('a', 'suspended')]),
    );
    assert.equal(r.installed, 1);
  });
});

test('isLive separa o que está em uso do que não está', () => {
  assert.equal(isLive('installed'), true);
  assert.equal(isLive('installing'), true);
  assert.equal(isLive('suspended'), false);
  assert.equal(isLive('previously-installed'), false);
  assert.equal(isLive('available'), false);
});
