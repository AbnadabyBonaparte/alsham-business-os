'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveSession, TENANT_COOKIE } from '@/lib/session';

/**
 * As ações de sessão: entrar, sair, trocar de tenant.
 *
 * ⭐ **Autenticação é do Supabase Auth, não nossa** (CLAUDE.md §5.2: "NUNCA
 * construir auth próprio"). Não há hash de senha, geração de token nem
 * validação de credencial neste repositório — e é para continuar assim.
 * Estas funções apenas encaminham o que o formulário coletou.
 */

export type AuthResult = { ok: true } | { ok: false; message: string };

/**
 * Mensagem de erro de login — deliberadamente genérica.
 *
 * "E-mail não cadastrado" conta a quem pergunta quais e-mails existem, o que
 * é um oráculo de enumeração de contas. Credencial errada é uma coisa só.
 */
const CREDENCIAL_INVALIDA = 'E-mail ou senha incorretos.';

export async function signInAction(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { ok: false, message: 'Preencha e-mail e senha.' };
  }

  const db = await createSupabaseServerClient();
  if (!db) {
    return {
      ok: false,
      message:
        'Este painel está em modo de demonstração: não há banco configurado, e portanto não há login.',
    };
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: CREDENCIAL_INVALIDA };

  return { ok: true };
}

/** Magic link — alternativa sem senha, também do Supabase Auth. */
export async function signInWithLinkAction(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { ok: false, message: 'Informe o e-mail.' };

  const db = await createSupabaseServerClient();
  if (!db) {
    return { ok: false, message: 'Modo de demonstração: não há banco configurado.' };
  }

  const { error } = await db.auth.signInWithOtp({ email });
  // Sucesso e falha respondem igual, pelo mesmo motivo do erro genérico acima.
  if (error) {
    return { ok: false, message: 'Não foi possível enviar o link agora. Tente novamente.' };
  }
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const db = await createSupabaseServerClient();
  await db?.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect('/login');
}

/**
 * Troca o tenant ativo.
 *
 * ⚠️ O valor recebido é **conferido contra os vínculos do usuário** antes de
 * virar cookie. Um id de tenant que não seja dele é recusado aqui — e, se
 * passasse, a RLS não devolveria uma linha sequer.
 */
export async function switchTenantAction(tenantId: string): Promise<AuthResult> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') {
    return { ok: false, message: 'Sessão expirada. Entre novamente.' };
  }

  const permitido = session.tenants.some((t) => t.id === tenantId);
  if (!permitido) {
    return { ok: false, message: 'Você não tem acesso a essa empresa.' };
  }

  (await cookies()).set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
