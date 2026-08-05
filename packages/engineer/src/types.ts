/**
 * Os contratos do Engenheiro — tipos puros, sem I/O.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): a decisão de QUE ferramentas existem, o QUE
 * o agente pode ler e COMO se fala com ele vive aqui, em `packages/`. A rota
 * (`apps/portal/.../api/engineer`) é só a pele: ela executa, fala com o motor e
 * com o banco. Se um dia a pele mudar de framework, este pacote não muda.
 */

import type { EnginePage, FormField } from './pages.ts';

/** O papel de uma mensagem na conversa — o mesmo vocabulário do protocolo. */
export type EngineerRole = 'user' | 'assistant';

/** Uma mensagem de texto simples da conversa (o histórico curto que a tela guarda). */
export interface EngineerTurn {
  readonly role: EngineerRole;
  readonly text: string;
}

/**
 * O contexto que a rota resolve DO SERVIDOR e entrega ao motor — nunca do
 * cliente. Tenant e permissões vêm da sessão cruzada com `core.memberships`.
 */
export interface EngineerContext {
  /** Nome do tenant ativo, para o motor situar de quem é o dado. */
  readonly tenantName: string;
  /** E-mail de quem pergunta — o carimbo de autoria do pedido. */
  readonly userEmail: string;
  /** Os módulos a que ESTE usuário tem acesso (deduzidos das permissões). */
  readonly accessibleModules: readonly string[];
  /** A rota onde o usuário está agora, quando aplicável (ex.: `/conciliacao`). */
  readonly currentPath?: string | null;
  /**
   * A página resolvida do catálogo — a consciência de LOCALIZAÇÃO. A rota a
   * resolve com `pageOf(currentPath)`; se ausente, o prompt não ganha o bloco.
   */
  readonly page?: EnginePage;
  /**
   * O snapshot do formulário visível — a consciência de FORMULÁRIO. Em tela
   * sigilosa os campos chegam SEM `valor` (suprimidos no navegador e no servidor).
   */
  readonly fields?: readonly FormField[];
  /** Modo demonstração: sem banco, o dado é fabricado e o motor deve dizê-lo. */
  readonly demo?: boolean;
  /**
   * ⭐ A data de HOJE no FUSO DO TENANT (`core.tenant_today`, 0119) — `YYYY-MM-DD`.
   * A rota a resolve do servidor; NUNCA se deixa o modelo assumir a data. Sem ela
   * (ex.: demonstração), o prompt não ganha a linha e o Engenheiro não afirma "hoje".
   */
  readonly today?: string | null;
}

/**
 * Uma ferramenta no formato que o motor entende (Anthropic Messages API,
 * `tools`). Puro JSON — a rota manda como está.
 */
export interface EngineerTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: 'object';
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

/** O alvo de leitura de um módulo: schema e tabela primária, sob RLS. */
export interface ModuleRead {
  /** O `schema` do Postgres — sempre igual ao `moduleId` nos módulos. */
  readonly schema: string;
  /** A tabela/visão de leitura rápida daquele módulo. */
  readonly table: string;
  /** Rótulo institucional em PT para a tela e o prompt. */
  readonly label: string;
  /** Uma linha do que aquele módulo guarda — orienta o motor a escolher. */
  readonly summary: string;
}

/**
 * O resultado de resolver um pedido de consulta — ou o alvo, ou a recusa.
 *
 * ⛔ A recusa aqui é DEFESA EM PROFUNDIDADE, não a cerca principal. Quem impede
 * de verdade é a RLS + `core.has_permission()` no banco. Mas negar um módulo
 * fora do acesso do usuário ANTES de tocar o banco é honesto e barato.
 */
export type ConsultaAlvo =
  | { readonly ok: true; readonly read: ModuleRead }
  | { readonly ok: false; readonly motivo: string };

/**
 * O registro de uma execução de ferramenta — quem pediu, o quê, quando.
 *
 * ⚠️ **Auditoria, não telemetria decorativa.** A Linha Vermelha do canon exige
 * que todo tool call seja logado. Este é o formato; a rota o emite no log
 * estruturado do servidor a cada chamada.
 */
export interface ToolCallLog {
  readonly tenantName: string;
  readonly userEmail: string;
  readonly tool: string;
  /** Um resumo dos argumentos — nunca dado sensível, nunca o prompt inteiro. */
  readonly argsSummary: string;
  readonly at: string;
}
