import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * `proxy.ts` — o que na Next 15 se chamava `middleware.ts`.
 *
 * ⚠️ Se você veio renomear isto para `middleware.ts`: **não**. Na 16 o arquivo
 * é `proxy.ts` e a função é `proxy`. Todo tutorial e toda IA treinada até a 15
 * vão dizer o contrário (CLAUDE.md §5.2).
 *
 * Faz duas coisas, e só duas:
 *
 * 1. **Renova a sessão** a cada requisição. Server Component não pode escrever
 *    cookie; se ninguém renovasse aqui, o usuário cairia sozinho.
 * 2. **Fecha a porta**: sem sessão, as rotas do painel redirecionam para
 *    `/login`.
 *
 * O que ele **não** faz: decidir tenant, ler permissão, filtrar dado. Isso é
 * do servidor de página e, no fim, da RLS. Um proxy que autoriza é um proxy
 * que vira a única defesa — e quando alguém acessar a rota por outro caminho,
 * não haverá defesa nenhuma.
 */

/** Rotas que existem sem sessão. Todo o resto do painel exige login. */
const PUBLICAS = ['/login', '/auth'];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Modo de demonstração: sem banco não há sessão a proteger, e barrar aqui
  // deixaria o painel inacessível justamente para quem só quer vê-lo rodar.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const db = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Valida o token contra o servidor de auth — e, de quebra, renova o cookie.
  const {
    data: { user },
  } = await db.auth.getUser();

  const { pathname } = request.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !publica) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    // Para onde voltar depois de entrar. Só o caminho, nunca URL absoluta:
    // aceitar URL de fora daqui seria um redirecionamento aberto.
    login.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, menos estático e imagem — cada requisição de página renova a sessão.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
