/**
 * `@alsham/permissions` — RBAC do Core.
 *
 * Hoje: a visão de catálogo da Store. Puro, sem I/O.
 *
 * ⚠️ **A decisão de instalar NÃO está aqui.** Ela vive em
 * `core.install_module()`, no banco — permissão, módulo publicado, papel de
 * tenant e teto do plano. Este pacote apresenta; o banco decide.
 */
export { buildShelf, isLive, producerOf, summarizeShelf } from './catalog.ts';
export type { CatalogEntry, ShelfItem, ShelfState, TenantModuleRow } from './catalog.ts';

export { ALL_MENU_ITEMS, accessibleModules, hasModuleAccess, visibleMenu } from './menu.ts';
export type { MenuItem } from './menu.ts';
