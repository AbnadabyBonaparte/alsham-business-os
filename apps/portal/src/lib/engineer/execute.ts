import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveConsulta,
  sanitizeLimite,
  pendenciaPlan,
  MODULE_READS,
  buildDocumentPrompt,
} from '@alsham/engineer';

import { callForge } from './forge.ts';

/**
 * O EXECUTOR DE FERRAMENTAS — o único lugar que toca o banco pelo agente.
 *
 * ⛔ **A LINHA VERMELHA mora aqui.** Toda leitura usa `db` — o cliente da SESSÃO
 * do usuário (anon key + cookie), o mesmo que as telas usam. A RLS decide o que
 * volta; `core.has_permission()` decide o que pode. O `tenantId` vem SEMPRE da
 * sessão resolvida no servidor — o modelo NUNCA fornece tenant, e não há
 * parâmetro para isso. Se o modelo pedir um módulo fora do acesso, `resolveConsulta`
 * recusa antes do banco; se driblasse, a RLS devolveria vazio. É por isso que o
 * agente é "completo" sem "pular a cerca".
 *
 * ⚠️ Zero `service_role`. Este arquivo não importa, não lê e não recebe a
 * chave-mãe — ela nem existe no `apps/portal`.
 */

/** O escopo fixo de uma execução — resolvido do servidor, imutável na conversa. */
export interface ExecScope {
  readonly db: SupabaseClient;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly userEmail: string;
  readonly accessibleModules: readonly string[];
}

/** O resultado de uma ferramenta, no formato de bloco `tool_result`. */
export interface ToolOutcome {
  readonly text: string;
  readonly isError: boolean;
  /** Para a trilha da tela: um rótulo humano do que rodou. */
  readonly label: string;
}

/** Lê a tabela primária de um módulo, sob RLS, escopada ao tenant ativo. */
async function lerModulo(
  scope: ExecScope,
  moduleId: string,
  limite: number,
): Promise<{ rows: unknown[]; label: string }> {
  const alvo = MODULE_READS[moduleId]!;
  const { data, error } = await scope.db
    .schema(alvo.schema)
    .from(alvo.table)
    .select('*')
    // O escopo do tenant ATIVO — o mesmo que a tela aplica. A RLS já corta
    // outros tenants; isto fixa a leitura no tenant que o usuário escolheu.
    .eq('tenant_id', scope.tenantId)
    .limit(limite);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], label: alvo.label };
}

/**
 * Executa UMA chamada de ferramenta. `name` e `input` vêm do motor; o escopo, do
 * servidor. Devolve texto para o `tool_result` e um rótulo para a trilha.
 */
export async function executeTool(
  scope: ExecScope,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (name === 'consultar_modulo') {
    const alvo = resolveConsulta(input.moduleId, scope.accessibleModules);
    if (!alvo.ok) {
      return { text: alvo.motivo, isError: true, label: `consulta recusada (${String(input.moduleId)})` };
    }
    const limite = sanitizeLimite(input.limite);
    try {
      const { rows, label } = await lerModulo(scope, String(input.moduleId), limite);
      const corpo =
        rows.length === 0
          ? `Nenhum registro em ${label} para este tenant.`
          : JSON.stringify(rows);
      return {
        text: corpo,
        isError: false,
        label: `consultou ${label} (${rows.length} registro${rows.length === 1 ? '' : 's'})`,
      };
    } catch (err) {
      // Erro de RLS/permissão vira mensagem honesta, nunca stack na tela.
      return {
        text: `Não foi possível ler este módulo com o seu acesso: ${(err as Error).message}`,
        isError: true,
        label: `consulta barrada (${String(input.moduleId)})`,
      };
    }
  }

  if (name === 'resumir_pendencias') {
    const plano = pendenciaPlan(scope.accessibleModules);
    if (plano.length === 0) {
      return {
        text: 'Você não tem acesso a nenhum módulo com prazo (contas, cobrança, manutenção).',
        isError: false,
        label: 'sem módulos de prazo acessíveis',
      };
    }
    const blocos: Record<string, unknown> = {};
    const cobertos: string[] = [];
    for (const m of plano) {
      try {
        const { rows, label } = await lerModulo(scope, m, 25);
        blocos[label] = rows;
        cobertos.push(label);
      } catch {
        // Um módulo que barrou não derruba o resumo — anota a lacuna.
        blocos[m] = { erro: 'sem acesso de leitura' };
      }
    }
    return {
      text: JSON.stringify({ cobertos, dados: blocos }),
      isError: false,
      label: `pendências de ${cobertos.join(', ') || 'nenhum módulo'}`,
    };
  }

  if (name === 'gerar_documento') {
    const instrucoes = typeof input.instrucoes === 'string' ? input.instrucoes : '';
    if (instrucoes.trim().length === 0) {
      return { text: 'Faltou dizer o que o documento deve conter.', isError: true, label: 'documento sem instrução' };
    }
    // Reaproveita o MESMO motor (mesma credencial), agora sem ferramentas.
    const r = await callForge({
      system: buildDocumentPrompt({
        instrucoes,
        tenantName: scope.tenantName,
        tipo: typeof input.tipo === 'string' ? input.tipo : undefined,
        titulo: typeof input.titulo === 'string' ? input.titulo : undefined,
      }),
      messages: [{ role: 'user', content: 'Redija o documento pedido.' }],
      maxTokens: 1200,
    });
    if (!r.ok) {
      return {
        text:
          r.reason === 'unconfigured'
            ? 'O motor ALSHAM não está configurado neste ambiente para gerar documentos.'
            : 'O motor ALSHAM não conseguiu redigir o documento agora.',
        isError: true,
        label: 'geração de documento falhou',
      };
    }
    const texto = r.reply.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { text: texto || '(documento vazio)', isError: false, label: 'documento redigido' };
  }

  return { text: `Ferramenta desconhecida: ${name}.`, isError: true, label: `ferramenta inválida (${name})` };
}
