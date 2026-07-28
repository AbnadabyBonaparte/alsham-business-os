import type { CatalogEntry, TenantModuleRow } from '@alsham/permissions';

/**
 * A PORTA DE DADOS DA STORE.
 *
 * Porta própria — a Lei do Lego (CLAUDE.md §5.5, regra 8) aplicada ao painel.
 * A Store não é um módulo, é o Core; mas a regra vale igual: não se acrescenta
 * método de um assunto à porta de outro.
 *
 * ⭐ Repare no que ela **não** tem: nenhum `podeInstalar`. Instalar e
 * desinstalar são **uma chamada só** cada, para `core.install_module()` e
 * `core.uninstall_module()` — as funções que decidem. A porta não conhece a
 * regra; ela bate na porta do banco e devolve o que voltou.
 */
export interface StorePort {
  readonly kind: 'mock' | 'supabase';

  /**
   * A vitrine.
   *
   * ⚠️ Devolve só o que está **publicado**, e não porque esta função filtra:
   * a policy `module_registry_select_published` já esconde `draft` e
   * `deprecated`. O filtro é do banco, não da tela — tela que filtra é tela
   * que um dia esquece de filtrar.
   */
  loadCatalog(): Promise<CatalogEntry[]>;

  /** O que este tenant instalou, incluindo o que já desinstalou. */
  loadTenantModules(): Promise<TenantModuleRow[]>;

  /** As permissões `core.*` do usuário — para esconder o botão de quem não pode. */
  listCorePermissions(): Promise<ReadonlySet<string>>;

  /**
   * Os papéis DO TENANT que podem receber as permissões do módulo.
   *
   * Papel de sistema não entra na lista, e a razão é dura: um papel de sistema
   * vale em **todo** tenant, então conceder ali faria as permissões do módulo
   * vazarem para quem não o instalou. `core.install_module()` recusa; esta
   * lista existe para que o operador nem chegue a tentar.
   */
  loadTenantRoles(): Promise<{ key: string; name: string }[]>;

  /** Quantos módulos o plano permite. `null` = ilimitado ou não configurado. */
  loadModuleLimit(): Promise<number | null>;

  install(input: { moduleId: string; roleKey: string }): Promise<void>;
  uninstall(input: { moduleId: string }): Promise<void>;
}
