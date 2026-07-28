import type { NextConfig } from 'next';

/**
 * Next.js 16.2.x — versão-alvo selada em CLAUDE.md §5.2.
 *
 * ⚠️ Se você veio criar um `middleware.ts`: na 16 ele virou `proxy.ts`.
 * Este app ainda não tem nenhum dos dois.
 */
const nextConfig: NextConfig = {
  // Os pacotes do monorepo são publicados como TypeScript cru, de propósito:
  // são fonte, não artefato. O Next os compila junto.
  transpilePackages: [
    '@alsham/config',
    '@alsham/core',
    '@alsham/finance-reconciliation',
    '@alsham/marketing',
    '@alsham/accounts-payable',
    '@alsham/permissions',
  ],

  typedRoutes: true,
};

export default nextConfig;
