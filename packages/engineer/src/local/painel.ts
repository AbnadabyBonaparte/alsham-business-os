/**
 * **O MOTOR LOCAL DO PAINEL — determinístico, sobre dado REAL.**
 *
 * Importado do PERITUS (`src/lib/ia/global-engine.ts` — `panoramaTexto` /
 * `prioridadesTexto`): uma função pura que recebe os números que a tela já
 * mostra e devolve o resumo em prosa. NUNCA inventa um número: o que não vem no
 * snapshot não aparece no texto (Lei 7).
 *
 * ⭐ **Por que local antes de generativo:** este texto é a ÚNICA fonte que a
 * camada generativa (a Forja) pode refinar — "grounded". Sem ele, o modelo
 * inventaria saldos. Com ele, o pior caso é uma redação sem graça de um número
 * verdadeiro.
 *
 * Módulo PURO: a rota busca os números sob a sessão (RLS) e os entrega aqui.
 * Este arquivo não conhece banco, sessão nem credencial.
 */

/** Uma linha do Painel: um módulo contratado, com seu total e o que vence. */
export interface PainelLinha {
  readonly label: string;
  readonly total: number;
  /** Quantos com prazo vencido/pendência, quando o módulo carrega prazo. */
  readonly vencidos?: number;
}

export interface PainelSnapshot {
  readonly tenantName: string;
  readonly linhas: readonly PainelLinha[];
}

/** O panorama: quanto há em cada frente contratada. */
export function painelResumo(s: PainelSnapshot): string {
  if (s.linhas.length === 0) {
    return `Painel de ${s.tenantName}: nenhum módulo com leitura disponível para este usuário.`;
  }
  const partes = s.linhas.map(
    (l) => `${l.label}: ${l.total}${l.vencidos ? ` (${l.vencidos} em atraso)` : ''}`,
  );
  return `Panorama de ${s.tenantName}. ${partes.join('; ')}.`;
}

/**
 * As prioridades: só o que tem pendência (`vencidos > 0`), na ordem do snapshot.
 * Sem pendência, diz que não há — nunca inventa urgência.
 */
export function painelPrioridades(s: PainelSnapshot): string {
  const comAtraso = s.linhas.filter((l) => (l.vencidos ?? 0) > 0);
  if (comAtraso.length === 0) {
    return `Nenhuma pendência em atraso registrada em ${s.tenantName}.`;
  }
  const itens = comAtraso.map((l) => `• ${l.label}: ${l.vencidos} em atraso de ${l.total}.`);
  return `Prioridades agora em ${s.tenantName}:\n${itens.join('\n')}`;
}
