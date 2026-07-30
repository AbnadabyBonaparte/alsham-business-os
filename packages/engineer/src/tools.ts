import { MODULE_READS, PENDENCIA_MODULES } from './modules.ts';
import type { ConsultaAlvo, EngineerTool } from './types.ts';

/**
 * As ferramentas do Engenheiro, montadas PARA ESTE usuário.
 *
 * ⭐ O enum de `moduleId` de `consultar_modulo` é a interseção do mapa de
 * leitura com os módulos que o usuário acessa. O motor **não consegue nem pedir**
 * um módulo que o menu esconde — e, se pedisse, o executor recusaria e a RLS
 * calaria. Três camadas, a mesma resposta.
 *
 * @param accessibleModules os módulos do usuário (de `accessibleModules()` do
 *   pacote de permissões) — a leitura única já feita pela sessão.
 */
export function buildTools(accessibleModules: readonly string[]): EngineerTool[] {
  const acesso = new Set(accessibleModules);
  const consultaveis = Object.keys(MODULE_READS)
    .filter((m) => acesso.has(m))
    .sort();

  const tools: EngineerTool[] = [];

  // `consultar_modulo` só existe se houver ao menos um módulo legível. Oferecer
  // a ferramenta com enum vazio seria prometer uma porta que não abre.
  if (consultaveis.length > 0) {
    const catalogo = consultaveis
      .map((m) => `${m} (${MODULE_READS[m]!.label}: ${MODULE_READS[m]!.summary})`)
      .join('; ');
    tools.push({
      name: 'consultar_modulo',
      description:
        'Lê os registros de um módulo do tenant, sob a sessão do usuário (RLS). ' +
        'Use quando a pergunta for sobre dado real da empresa. ' +
        `Módulos disponíveis para este usuário: ${catalogo}.`,
      input_schema: {
        type: 'object',
        properties: {
          moduleId: {
            type: 'string',
            enum: consultaveis,
            description: 'O módulo a consultar. Só os desta lista existem para este usuário.',
          },
          limite: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            description: 'Quantos registros trazer (padrão 10). Traga o mínimo que responde.',
          },
        },
        required: ['moduleId'],
      },
    });
  }

  const pendencia = PENDENCIA_MODULES.filter((m) => acesso.has(m));
  if (pendencia.length > 0) {
    tools.push({
      name: 'resumir_pendencias',
      description:
        'Cruza os módulos com prazo/vencimento a que o usuário tem acesso ' +
        `(${pendencia.join(', ')}) e devolve os registros para um resumo executivo. ` +
        'Use quando pedirem "o que está pendente", "o que vence", um panorama de prazos.',
      input_schema: { type: 'object', properties: {} },
    });
  }

  // A geração de documento reaproveita o motor ALSHAM — está sempre disponível,
  // não depende de módulo instalado.
  tools.push({
    name: 'gerar_documento',
    description:
      'Redige um texto ou documento (e-mail, comunicado, resumo, minuta) a partir ' +
      'de instruções e do contexto que você já reuniu. Use depois de consultar o ' +
      'dado, quando o pedido for PRODUZIR um texto, não apenas responder.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', description: 'O gênero: e-mail, comunicado, resumo, minuta…' },
        titulo: { type: 'string', description: 'Um título curto para o documento.' },
        instrucoes: {
          type: 'string',
          description: 'O que o documento deve dizer e para quem — inclua o contexto/dados relevantes.',
        },
      },
      required: ['instrucoes'],
    },
  });

  return tools;
}

/**
 * Resolve um pedido de `consultar_modulo` no alvo de leitura — ou na recusa.
 *
 * ⛔ Defesa em profundidade: recusa módulo desconhecido do mapa E módulo fora
 * do acesso do usuário, ANTES de tocar o banco. A cerca real continua sendo a
 * RLS; esta é a que dá uma mensagem honesta em vez de uma consulta vazia.
 */
export function resolveConsulta(
  moduleId: unknown,
  accessibleModules: readonly string[],
): ConsultaAlvo {
  if (typeof moduleId !== 'string' || moduleId.length === 0) {
    return { ok: false, motivo: 'Nenhum módulo foi indicado.' };
  }
  const read = MODULE_READS[moduleId];
  if (!read) {
    return { ok: false, motivo: `O módulo "${moduleId}" não é consultável pelo Engenheiro.` };
  }
  // `accessibleModules` é a lista de módulos do usuário (mesma que o menu usa,
  // de `accessibleModules()` do pacote de permissões). Fora dela, recusa.
  if (!new Set(accessibleModules).has(moduleId)) {
    return {
      ok: false,
      motivo: `Você não tem acesso ao módulo "${moduleId}" neste tenant.`,
    };
  }
  return { ok: true, read };
}

/** Um limite são para a consulta: inteiro em [1, 50], padrão 10. */
export function sanitizeLimite(limite: unknown): number {
  const n = typeof limite === 'number' ? Math.floor(limite) : Number.NaN;
  if (!Number.isFinite(n)) return 10;
  return Math.min(50, Math.max(1, n));
}

/** Os módulos de pendência que ESTE usuário pode ver — para o executor cobrir. */
export function pendenciaPlan(accessibleModules: readonly string[]): readonly string[] {
  const acesso = new Set(accessibleModules);
  return PENDENCIA_MODULES.filter((m) => acesso.has(m));
}
