import type { MenuItem } from '@alsham/permissions';

import { DOMAIN_TERRITORIES } from './store-taxonomy';

/**
 * **O MENU DO TOPO, AGRUPADO POR DOMÍNIO.**
 *
 * ⭐ A tela do topo aparece em TODA página, e uma fileira flat de dezenas de
 * itens quebrando em linhas é a bagunça permanente. Esta função cruza os itens
 * já decididos por `visibleMenu()` (pacote) com o mapa de domínios — a **mesma
 * fonte do PR #27** (`store-taxonomy.ts` para o rótulo e a ordem; o
 * `domain_key` de cada módulo vem do catálogo vivo, como a Store lê).
 *
 * ⚠️ **Sol Único (Lei 6).** Nenhum rótulo de domínio nasce aqui: os nomes e a
 * ordem são os de `DOMAIN_TERRITORIES`, que por sua vez são os da Taxonomia.
 * Esta função só AGRUPA — não decide permissão (isso é do pacote), não inventa
 * nome, não reordena o array `MENU`.
 *
 * ⚠️ **Pura, para ser testável.** Recebe os itens visíveis e o mapa
 * `moduleId → domain_key`; devolve os itens de Core e os grupos de domínio na
 * ordem da Taxonomia. Quem lê o catálogo é quem chama.
 */

/** Um domínio com os itens de menu que caem nele. */
export interface MenuDomainGroup {
  readonly key: string;
  readonly name: string;
  readonly items: readonly MenuItem[];
}

export interface GroupedMenu {
  /** Itens do Core (Painel, Store, Ajustes): links diretos, sem categoria. */
  readonly core: readonly MenuItem[];
  /** Os domínios com ≥1 item visível, na ordem da Taxonomia. */
  readonly groups: readonly MenuDomainGroup[];
}

/**
 * Agrupa o menu visível por domínio.
 *
 * @param items os itens já filtrados por permissão (`visibleMenu()`).
 * @param moduleDomain `moduleId → domain_key`, lido do catálogo (a fonte da Store).
 */
export function groupModuleMenu(
  items: readonly MenuItem[],
  moduleDomain: ReadonlyMap<string, string>,
): GroupedMenu {
  // Item de Core (`moduleId === null`) não pertence a domínio nenhum: é a
  // plataforma, não um item de catálogo.
  const core = items.filter((i) => i.moduleId === null);
  const modulos = items.filter((i) => i.moduleId !== null);

  const porDominio = new Map<string, MenuItem[]>();
  for (const item of modulos) {
    // Fallback (requisito 5): módulo sem domínio conhecido no mapa é agrupado
    // pela própria chave crua — nunca some do menu.
    const chave = moduleDomain.get(item.moduleId as string) ?? (item.moduleId as string);
    const lista = porDominio.get(chave);
    if (lista) lista.push(item);
    else porDominio.set(chave, [item]);
  }

  const groups: MenuDomainGroup[] = [];
  const usadas = new Set<string>();

  // Primeiro, os domínios do mapa, na ORDEM da Taxonomia. Domínio sem item
  // visível simplesmente não aparece (o menu já filtra por permissão).
  for (const t of DOMAIN_TERRITORIES) {
    const lista = porDominio.get(t.key);
    if (lista && lista.length > 0) {
      groups.push({ key: t.key, name: t.name, items: lista });
      usadas.add(t.key);
    }
  }

  // Depois, o fallback: qualquer chave que não bateu com o mapa — rotulada com
  // a chave crua e anexada ao fim. Não deveria acontecer; se acontecer, é sinal
  // de que um módulo nasceu com um domain_key fora da Taxonomia, e o conserto é
  // alinhar a chave, nunca esconder o item.
  for (const [chave, lista] of porDominio) {
    if (usadas.has(chave)) continue;
    groups.push({ key: chave, name: chave, items: lista });
  }

  return { core, groups };
}
