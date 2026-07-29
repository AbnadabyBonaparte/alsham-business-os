'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Item de navegação com estado ativo — a sala em que se está fica marcada
 * por um ponto de ouro sob o rótulo. Hierarquia por peso e espaço, o ouro
 * só como acento (IDENTIDADE-VISUAL §7).
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative rounded-md px-3 py-2 transition-colors duration-200 ${
        active ? 'text-bos-text' : 'text-bos-muted hover:bg-bos-surface hover:text-bos-text'
      }`}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-px block h-px bg-linear-to-r from-transparent via-bos-accent/70 to-transparent"
        />
      ) : null}
    </Link>
  );
}
