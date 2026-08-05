import { NextResponse } from 'next/server';

import { accessibleModules } from '@alsham/permissions';
import {
  buildSystemPrompt,
  buildTools,
  gatedReply,
  pageOf,
  redactFields,
  type EngineerTurn,
  type FormField,
} from '@alsham/engineer';

import { resolveSession } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllPermissions } from '@/lib/data';
import { callForge, type ForgeContentBlock, type ForgeMessage } from '@/lib/engineer/forge';
import { callVerify } from '@/lib/engineer/verify';
import { executeTool, type ExecScope } from '@/lib/engineer/execute';

/**
 * A ROTA DO ENGENHEIRO — a composição do agente (a pele, §5.3).
 *
 * ⭐ Roda no servidor com a SESSÃO do usuário (cookie → RLS). Recebe a pergunta,
 * arma as ferramentas para os módulos DESTE usuário, chama o motor ALSHAM em
 * laço e executa cada ferramenta sob a sessão. A regra de quem-pode-o-quê não
 * está aqui: está na RLS do banco e em `@alsham/engineer`.
 *
 * ⛔ Nenhuma `service_role`. Nenhum tenant vindo do cliente — só da sessão.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Teto de idas ao motor por pergunta — bounda custo e evita laço infinito. */
const MAX_STEPS = 6;

/** Auditoria: todo tool call vira uma linha estruturada no log do servidor. */
function auditar(entry: {
  tenantName: string;
  userEmail: string;
  tool: string;
  argsSummary: string;
}) {
  // Linha única, tag estável — legível no log do provedor (Vercel/Railway).
  // Nunca o prompt inteiro, nunca dado sensível: só quem, o quê e quando.
  console.info(
    `[engineer-audit] ${JSON.stringify({
      ...entry,
      at: new Date().toISOString(),
    })}`,
  );
}

interface EngineerRequestBody {
  readonly messages?: EngineerTurn[];
  readonly currentPath?: string | null;
  /** O snapshot do formulário visível — a consciência de FORMULÁRIO. */
  readonly fields?: FormField[];
}

export async function POST(req: Request) {
  const session = await resolveSession();

  // Anônimo não fala com o Engenheiro. (Demo responde, mas sem dado real.)
  if (session.mode === 'anonymous' || session.mode === 'no-access') {
    return NextResponse.json(
      { error: 'Faça login para falar com o Engenheiro.' },
      { status: 401 },
    );
  }

  let body: EngineerRequestBody;
  try {
    body = (await req.json()) as EngineerRequestBody;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const turns = Array.isArray(body.messages) ? body.messages : [];
  const ultima = turns[turns.length - 1];
  if (!ultima || ultima.role !== 'user' || typeof ultima.text !== 'string' || !ultima.text.trim()) {
    return NextResponse.json({ error: 'Nenhuma pergunta.' }, { status: 400 });
  }

  const demo = session.mode === 'demo';
  const db = demo ? null : await createSupabaseServerClient();

  // Permissões → módulos acessíveis. Em demo (sem banco) não há o que ler.
  const permissoes = db ? await loadAllPermissions() : new Set<string>();
  const modulos = accessibleModules(permissoes);

  const tenantName = session.mode === 'authenticated' ? session.activeTenant.name : 'Demonstração';
  const userEmail =
    (session.mode === 'authenticated' ? session.email : 'demo@alsham') ?? 'usuário';

  // ⭐ Consciência de LOCALIZAÇÃO: o servidor resolve a página do catálogo pela
  // rota — o cliente não escolhe qual é.
  const page = pageOf(body.currentPath ?? null);

  // ⛔ FRONTEIRA DE SIGILO — 2ª camada (servidor). Em tela sigilosa, o servidor
  // suprime o valor DE NOVO, mesmo que o navegador já tenha suprimido: um cliente
  // adulterado não injeta dado clínico no prompt. Ver MODELO-ENGENHEIRO §4.
  const fields = redactFields(
    Array.isArray(body.fields) ? body.fields : undefined,
    page?.sigilosa,
  );

  const system = buildSystemPrompt({
    tenantName,
    userEmail,
    accessibleModules: modulos,
    currentPath: body.currentPath ?? null,
    page,
    fields,
    demo,
  });

  const tools = db ? buildTools(modulos) : [];

  // O histórico curto → mensagens do protocolo (texto puro).
  const messages: ForgeMessage[] = turns
    .filter((t) => typeof t.text === 'string' && t.text.trim().length > 0)
    .map((t) => ({ role: t.role, content: t.text }));

  const scope: ExecScope | null = db
    ? {
        db,
        tenantId: session.mode === 'authenticated' ? session.activeTenant.id : '',
        tenantName,
        userEmail,
        accessibleModules: modulos,
      }
    : null;

  const trace: string[] = [];
  // ⭐ Os FATOS grounded — o texto das leituras das ferramentas, acumulado ao
  // longo do laço. É o que o portão verificador confere contra a resposta: a
  // mesma fonte que a IA teve para responder, e nada além dela.
  const groundedParts: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await callForge({ system, messages, tools });

    if (!r.ok) {
      const msg =
        r.reason === 'unconfigured'
          ? 'O motor ALSHAM ainda não está ligado neste ambiente. A conversa funciona; a inteligência entra quando o motor for configurado.'
          : 'O motor ALSHAM não respondeu agora. Tente de novo em instantes.';
      return NextResponse.json({ answer: msg, trace, engineOffline: true });
    }

    // Guarda a resposta do motor (texto + eventuais pedidos de ferramenta).
    messages.push({ role: 'assistant', content: r.reply.content });

    if (r.reply.stopReason !== 'tool_use') {
      const answer = r.reply.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const bruto = answer || 'Sem resposta.';

      // ⛔ Em demonstração o dado é FABRICADO e o system prompt já o declara: não
      // há fato real a contradizer, e não se queima cota do tenant. Sem sessão
      // (sem `scope`), a resposta sai como está.
      if (!scope) {
        return NextResponse.json({ answer: bruto, trace });
      }

      // ⭐ O PORTÃO VERIFICADOR — a segunda geração, medida. O juiz confere a
      // resposta contra os FATOS grounded (as leituras que a IA teve). `verify`
      // é `null` quando não deu pra verificar (juiz fora do ar, rede, cota) —
      // e `gatedReply(_, null)` NÃO publica: devolve a frase honesta (fail-closed).
      const verify = await callVerify({
        question: ultima.text,
        answer: bruto,
        groundedFacts: groundedParts.join('\n\n'),
        tenantId: scope.tenantId,
        tenantName,
        userId: null,
      });
      const finalAnswer = gatedReply(bruto, verify);
      return NextResponse.json({
        answer: finalAnswer,
        trace,
        // Sinaliza à tela quando a resposta NÃO foi confirmada — sem vazar o porquê.
        ...(finalAnswer === bruto ? {} : { unverified: true }),
      });
    }

    // O motor pediu ferramentas. Executa cada uma sob a sessão do usuário.
    const pedidos = r.reply.content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    );

    const resultados: ForgeContentBlock[] = [];
    for (const p of pedidos) {
      auditar({
        tenantName,
        userEmail,
        tool: p.name,
        argsSummary: JSON.stringify(p.input).slice(0, 200),
      });

      if (!scope) {
        resultados.push({
          type: 'tool_result',
          tool_use_id: p.id,
          content: 'Sem banco neste ambiente de demonstração: não há dado real a consultar.',
          is_error: true,
        });
        continue;
      }

      const out = await executeTool(scope, p.name, p.input);
      trace.push(out.label);
      groundedParts.push(out.text);
      resultados.push({
        type: 'tool_result',
        tool_use_id: p.id,
        content: out.text,
        is_error: out.isError,
      });
    }

    messages.push({ role: 'user', content: resultados });
  }

  // Estourou o teto de passos — responde com o que houver, sem laço eterno.
  return NextResponse.json({
    answer: 'A consulta ficou longa demais. Refaça a pergunta de forma mais específica.',
    trace,
  });
}
