import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewEvent, validateNewRegistration } from './event.ts';

describe('validar evento novo', () => {
  const bom = { name: 'Feira de inverno', startsAt: '2026-08-10T18:00:00Z' };

  test('nome e início são obrigatórios — sem data é ideia, não evento', () => {
    assert.match(validateNewEvent({ ...bom, name: ' ' }) ?? '', /nome/);
    assert.match(validateNewEvent({ ...bom, startsAt: '' }) ?? '', /quando começa/);
    assert.equal(validateNewEvent(bom), null);
  });

  test('o fim não vem antes do começo', () => {
    assert.match(
      validateNewEvent({ ...bom, endsAt: '2026-08-09T18:00:00Z' }) ?? '',
      /terminar antes/,
    );
    assert.equal(validateNewEvent({ ...bom, endsAt: '2026-08-10T22:00:00Z' }), null);
  });

  test('capacidade é opcional; quando vem, é inteiro positivo', () => {
    assert.equal(validateNewEvent({ ...bom, capacity: null }), null);
    assert.equal(validateNewEvent({ ...bom, capacity: 100 }), null);
    assert.match(validateNewEvent({ ...bom, capacity: 0 }) ?? '', /inteiro positivo/);
    assert.match(validateNewEvent({ ...bom, capacity: 2.5 }) ?? '', /inteiro positivo/);
  });

  test('local é TEXTO LIVRE — "Zoom" e "chácara" passam; em branco não', () => {
    assert.equal(validateNewEvent({ ...bom, location: 'Zoom' }), null);
    assert.equal(validateNewEvent({ ...bom, location: 'chácara do fundador' }), null);
    assert.match(validateNewEvent({ ...bom, location: '  ' }) ?? '', /branco/);
  });
});

describe('validar inscrição nova', () => {
  const boa = { eventId: 'e1', attendeeName: 'Pessoa Um' };

  test('evento e nome são obrigatórios', () => {
    assert.match(validateNewRegistration({ ...boa, eventId: ' ' }) ?? '', /evento/);
    assert.match(validateNewRegistration({ ...boa, attendeeName: ' ' }) ?? '', /nome/);
    assert.equal(validateNewRegistration(boa), null);
  });

  test('⭐ o contato é NEUTRO e opcional — qualquer instrumento serve', () => {
    for (const contact of ['pessoa@exemplo.com', '(62) 99999-0000', '@fulano no instagram', null]) {
      assert.equal(validateNewRegistration({ ...boa, contact }), null);
    }
    assert.match(validateNewRegistration({ ...boa, contact: '  ' }) ?? '', /branco/);
  });
});
