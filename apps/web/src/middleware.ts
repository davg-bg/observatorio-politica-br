import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Middleware do Next.js:
 *   • Refresh de sessão Supabase em TODA request (cookies).
 *   • Proteção de rotas /me/* (redireciona para /login).
 *
 * Se o Supabase não estiver configurado via env, deixa passar — o app
 * ainda funciona em modo somente-leitura.
 */

const PROTECTED_PATHS = /^\/me(\/|$)/;

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const requiresAuth = PROTECTED_PATHS.test(url.pathname);

  const url_env = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key_env = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url_env || !key_env) {
    if (requiresAuth) {
      return redirectToLogin(request);
    }
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(url_env, key_env, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Força refresh do token se expirou
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (requiresAuth && !user) {
    return redirectToLogin(request);
  }

  return response;
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Executar em todas as rotas exceto estáticos e api/status (público)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'],
};
