/**
 * **O MOTOR LOCAL DA AGENDA (módulo `appointment`) — determinístico, sem PHI.**
 *
 * Importado do PERITUS (`src/lib/ia/local.ts` — o `resumo` por processo): uma
 * função pura que resume o que a tela da agenda mostra, a partir de dado REAL já
 * lido sob a sessão (RLS). NUNCA inventa um horário, um nome ou uma contagem.
 *
 * ⛔ **Zero dado clínico.** A agenda é write-trail, não read-trail: ela carrega
 * horário, situação, serviço e o nome do paciente/profissional — nunca
 * prontuário, exame ou receita. O motor local prova a consciência de Saúde SEM
 * tocar no que a fronteira de sigilo protege (essa é a Agenda, não o Prontuário).
 *
 * Módulo PURO: a rota lê os agendamentos sob a sessão e os entrega aqui.
 */

/** Uma linha da agenda — os campos NÃO-sigilosos de um agendamento. */
export interface AgendaLinha {
  readonly status: 'scheduled' | 'attended' | 'no_show' | 'cancelled';
  /** O horário legível (ex.: '14/08 09:30') — já formatado pela pele. */
  readonly quando: string;
  /** O serviço em texto livre (ex.: 'consulta de retorno'). */
  readonly servico: string;
}

export interface AgendaSnapshot {
  readonly tenantName: string;
  readonly agendamentos: readonly AgendaLinha[];
}

const SITUACAO: Readonly<Record<AgendaLinha['status'], string>> = {
  scheduled: 'agendado(s)',
  attended: 'com comparecimento',
  no_show: 'com falta (no-show)',
  cancelled: 'cancelado(s)',
};

/** O resumo da agenda por situação, com os próximos agendados. */
export function agendaResumo(s: AgendaSnapshot): string {
  if (s.agendamentos.length === 0) {
    return `Agenda de ${s.tenantName}: nenhum agendamento registrado.`;
  }
  const conta = (st: AgendaLinha['status']) =>
    s.agendamentos.filter((a) => a.status === st).length;
  const linhas = (['scheduled', 'attended', 'no_show', 'cancelled'] as const)
    .map((st) => ({ st, n: conta(st) }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${SITUACAO[x.st]}`);

  const proximos = s.agendamentos
    .filter((a) => a.status === 'scheduled')
    .slice(0, 3)
    .map((a) => `${a.quando} — ${a.servico}`);

  const cabeca = `Agenda de ${s.tenantName}: ${s.agendamentos.length} agendamento(s) — ${linhas.join(', ')}.`;
  const cauda = proximos.length ? ` Próximos agendados: ${proximos.join('; ')}.` : '';
  return cabeca + cauda;
}
