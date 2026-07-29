import type { BrandContext } from '@alsham/ai';

/**
 * A PORTA DO CÉREBRO DA MARCA — Core, não módulo.
 *
 * `core.ai_brand_context` é tabela do Core, e o contexto da marca serve a
 * qualquer módulo que peça geração. Ler exige ser membro; escrever exige
 * `core.tenant.manage` — quem DEFINE o tom da empresa é quem responde por ela.
 */
export interface BrandPort {
  readonly kind: 'mock' | 'supabase';
  load(): Promise<BrandContext>;
  /** `true` se o usuário pode editar. Cortesia: quem impede é a policy. */
  canEdit(): Promise<boolean>;
  save(input: BrandContext): Promise<void>;
}
