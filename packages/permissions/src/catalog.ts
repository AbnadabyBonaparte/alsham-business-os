/**
 * **A VISÃO DE CATÁLOGO** — o que a Store mostra, e em que estado.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): isto vive em `packages/` porque é
 * DECISÃO de apresentação de domínio — cruzar o catálogo da plataforma com o
 * que este tenant instalou. A tela recebe a lista pronta e desenha.
 *
 * ⚠️ **O que este arquivo deliberadamente NÃO faz: decidir se pode instalar.**
 *
 * Quem decide é `core.install_module()`, no banco — permissão, módulo
 * publicado, papel de tenant e teto do plano, tudo lá. Reimplementar essas
 * regras aqui criaria uma segunda fonte que diverge no dia em que alguém
 * corrigir uma só. O que existe aqui é **cortesia de interface**: esconder o
 * botão de quem visivelmente não pode. Quem impede é o banco.
 *
 * A diferença aparece no `blockedReason`: ele nunca vem daqui, vem da
 * mensagem que a função devolveu.
 */

/** O que a plataforma publica — espelha `core.module_registry`. */
export interface CatalogEntry {
  readonly moduleId: string;
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  readonly layer: 'domain' | 'vertical';
  readonly domainKey: string | null;
  readonly verticalKey: string | null;
  readonly capabilities: readonly { key: string; canonicalName: string }[];
  readonly permissions: readonly { key: string; description: string }[];
  readonly emits: readonly { type: string; description: string }[];
  readonly consumes: readonly { type: string; description: string }[];
}

/** O que este tenant tem — espelha `core.tenant_modules`. */
export interface TenantModuleRow {
  readonly moduleId: string;
  readonly status: 'installing' | 'active' | 'suspended' | 'uninstalled';
  readonly version: string;
  readonly installedAt: string;
}

export type ShelfState =
  /** Nunca instalado neste tenant. */
  | 'available'
  | 'installing'
  /** Em uso. */
  | 'installed'
  /** Instalado porém desligado — dado preservado, acesso cortado. */
  | 'suspended'
  /** Já foi instalado e saiu. **O dado dele continua no banco.** */
  | 'previously-installed';

export interface ShelfItem {
  readonly entry: CatalogEntry;
  readonly state: ShelfState;
  /** A versão que ESTE tenant tem, quando diferente da publicada. */
  readonly installedVersion: string | null;
  /**
   * De quem este módulo escuta fato, deduzido do prefixo dos tipos que ele
   * consome.
   *
   * ⚠️ **Honestidade na vitrine.** Um módulo que consome
   * `recon.approval.decided` só reage de verdade se o outro estiver instalado
   * e emitindo. Dizer "consome eventos" sem dizer **de quem** faria a Store
   * prometer uma integração que depende de algo que o cliente talvez não tenha.
   */
  readonly listensTo: readonly string[];
}

/** O prefixo de um tipo de evento é o módulo que o emite. Contrato do CORE-SPEC. */
export function producerOf(eventType: string): string {
  const ponto = eventType.indexOf('.');
  return ponto > 0 ? eventType.slice(0, ponto) : eventType;
}

/**
 * Cruza o catálogo com o que o tenant tem.
 *
 * Pura: recebe as duas listas, devolve a prateleira. Quem lê o banco é quem
 * chama.
 */
export function buildShelf(
  catalog: readonly CatalogEntry[],
  installed: readonly TenantModuleRow[],
): ShelfItem[] {
  const porModulo = new Map(installed.map((i) => [i.moduleId, i]));

  return catalog.map((entry) => {
    const meu = porModulo.get(entry.moduleId);
    const state: ShelfState = !meu
      ? 'available'
      : meu.status === 'active'
        ? 'installed'
        : meu.status === 'installing'
          ? 'installing'
          : meu.status === 'suspended'
            ? 'suspended'
            : 'previously-installed';

    const listensTo = [
      ...new Set(
        entry.consumes
          .map((c) => producerOf(c.type))
          // Um módulo pode escutar o próprio Core; isso não é dependência de
          // outro módulo e não deve aparecer como tal na vitrine.
          .filter((p) => p !== 'core' && p !== entry.moduleId),
      ),
    ].sort();

    return {
      entry,
      state,
      installedVersion: meu && meu.version !== entry.version ? meu.version : null,
      listensTo,
    };
  });
}

/** Um item da prateleira está em uso agora? */
export function isLive(state: ShelfState): boolean {
  return state === 'installed' || state === 'installing';
}

/**
 * Resumo para o cabeçalho da Store.
 *
 * `installed` conta o que ocupa vaga no plano — que é o mesmo critério do
 * `core.install_module()`: ativo, instalando ou suspenso. Desinstalado não
 * ocupa.
 */
export function summarizeShelf(items: readonly ShelfItem[]): {
  readonly total: number;
  readonly installed: number;
  readonly available: number;
} {
  const emUso = items.filter(
    (i) => i.state === 'installed' || i.state === 'installing' || i.state === 'suspended',
  ).length;
  return {
    total: items.length,
    installed: emUso,
    available: items.length - emUso,
  };
}
