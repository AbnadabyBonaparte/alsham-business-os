import type { IsoDateTime, ModuleId, TenantId, UserId, Uuid } from './primitives';

/**
 * Quem agiu.
 *
 * União discriminada porque nem todo ator é humano — e tratar agente ou
 * cron como "usuário do sistema" é justamente como se perde a trilha.
 *
 * **Minerado de:** `audit_log` + `timeline` do peritus — 11 tabelas limpas
 * com dados reais (Balanço Supabase §1: **PROVADO**, a régua de auditoria
 * do império).
 */
export type AuditActor =
  /** Uma pessoa, autenticada. */
  | { readonly kind: 'user'; readonly userId: UserId }
  /** Um agente de IA agindo em nome do tenant (doutrina da Casa). */
  | { readonly kind: 'agent'; readonly agentKey: string }
  /** A própria plataforma — job, cron, migração, reentrega. */
  | { readonly kind: 'system'; readonly process: string };

/**
 * Uma entrada da trilha de auditoria: **quem, o quê, quando, em qual tenant.**
 *
 * **Minerado de:** o padrão de auditoria do peritus (**PROVADO** — a
 * vertical mais madura do império, auditada como referência de segurança).
 *
 * **Regras que este tipo carrega:**
 *
 * 1. **Append-only.** Auditoria não se edita e não se apaga. Corrigir um
 *    erro é escrever uma nova entrada, nunca reescrever a anterior.
 * 2. **Sobrevive ao dado.** Arquivar tenant, desinstalar módulo ou remover
 *    registro não apaga a trilha — por isso `resourceId` é solto, e não
 *    uma chave estrangeira que cascatearia o apagamento.
 * 3. **Nunca guarda segredo.** `before`/`after` levam o dado de negócio
 *    que mudou. Senha, token, chave e segredo são redigidos **antes** de
 *    chegar aqui — trilha de auditoria é o último lugar onde um segredo
 *    deveria vazar, e é onde mais dói quando vaza.
 */
export interface AuditEntry {
  readonly id: Uuid;
  /** Nunca opcional: não existe auditoria fora de um tenant. */
  readonly tenantId: TenantId;
  readonly actor: AuditActor;
  /** O que foi feito, `kebab-case`. @example 'module.installed' */
  readonly action: string;
  /** A classe do alvo. @example 'tenant-module' · 'role' · 'invoice' */
  readonly resourceType: string;
  /** O alvo. `null` quando a ação não recai sobre um registro específico. */
  readonly resourceId: string | null;
  /** Que módulo registrou a entrada. `null` = o próprio Core. */
  readonly moduleId: ModuleId | null;
  readonly occurredAt: IsoDateTime;
  /** Estado anterior, já redigido de segredos. */
  readonly before?: Readonly<Record<string, unknown>>;
  /** Estado posterior, já redigido de segredos. */
  readonly after?: Readonly<Record<string, unknown>>;
  readonly ip?: string;
  readonly userAgent?: string;
}
