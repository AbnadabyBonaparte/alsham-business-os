'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { signInAction, signInWithLinkAction } from '@/app/auth-actions';
import { Panel } from '@/components/states';

/**
 * O formulário de login.
 *
 * Não valida credencial, não guarda senha, não gera token — quem faz isso é o
 * Supabase Auth. Este componente coleta e encaminha.
 *
 * Estados cobertos: carregando (botão ocupado), erro (mensagem), e o aviso de
 * modo de demonstração quando não há banco configurado.
 */
export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [linkEnviado, setLinkEnviado] = useState(false);
  const [pending, startTransition] = useTransition();

  // Só o caminho, e só o interno. Aceitar URL absoluta aqui é
  // redirecionamento aberto — o clássico de phishing.
  const bruto = params.get('next') ?? '/';
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/';

  if (demo) {
    return (
      <Panel className="w-full px-6 py-8 text-center">
        <p className="font-display text-lg text-bos-text">Modo de demonstração</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-bos-muted">
          Este painel está rodando sem banco configurado, com dados fabricados e anônimos. Não há
          login porque não há sessão a criar — e fingir uma tela de login que não autentica nada
          seria pior do que não ter.
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-6 rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60"
        >
          Entrar na demonstração
        </button>
      </Panel>
    );
  }

  function entrar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await signInAction(formData);
      if (r.ok) {
        router.push(destino);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  }

  function enviarLink(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await signInWithLinkAction(formData);
      if (r.ok) setLinkEnviado(true);
      else setError(r.message);
    });
  }

  if (linkEnviado) {
    return (
      <Panel className="w-full px-6 py-8 text-center">
        <p className="font-display text-lg text-bos-text">Link enviado</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-bos-muted">
          Se houver uma conta com esse e-mail, o link de acesso chegou. Ele vale por tempo
          limitado.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="w-full px-6 py-8">
      <form action={entrar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-bos-muted">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted focus:border-bos-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-bos-muted">Senha</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted focus:border-bos-accent focus:outline-none"
          />
        </label>

        {error ? <p className="text-sm text-bos-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md border border-bos-accent/60 px-4 py-2.5 text-sm text-bos-text transition-colors duration-200 hover:bg-bos-accent/10 disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>

        <button
          type="submit"
          formAction={enviarLink}
          disabled={pending}
          className="text-xs text-bos-muted underline-offset-4 transition-colors duration-200 hover:text-bos-text hover:underline disabled:opacity-50"
        >
          Prefiro receber um link por e-mail
        </button>
      </form>
    </Panel>
  );
}
