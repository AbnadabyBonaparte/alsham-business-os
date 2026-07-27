import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * O retorno do magic link.
 *
 * O Supabase manda o usuário para cá com um `code`; aqui ele vira sessão.
 * Trocar o código por sessão é do SDK — não há criptografia nossa envolvida.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  // Só caminho interno. URL absoluta vinda de fora seria redirecionamento
  // aberto — o vetor clássico de phishing em fluxo de login.
  const bruto = searchParams.get('next') ?? '/';
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link-invalido`);
  }

  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.redirect(`${origin}/login`);

  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link-expirado`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
