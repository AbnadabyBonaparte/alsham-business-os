import type { IsoDateTime, TenantId, UserId, Uuid } from './primitives.ts';

/**
 * Estado de vida de um tenant.
 *
 * `suspended` é reversível (inadimplência, investigação); `archived` é
 * terminal para efeito de uso, mas **não apaga dado** — a trilha de
 * auditoria sobrevive ao arquivamento (padrão Peritus).
 */
export type TenantStatus = 'active' | 'suspended' | 'archived';

/**
 * O tenant — a empresa cliente. A raiz de todo isolamento da plataforma.
 *
 * **Minerado de:** `workspaces` do esqueleto kraken-v2 — a cadeia
 * tenant→membro→plano→limite→consumo completa e em produção
 * (Balanço de Tecnologia §1 e Balanço Supabase §1: **PROVADO**, registrado
 * como *"a peça mais próxima do Core da Fase 1 que o império possui"*).
 * Complemento de schema: `organizations` da pedreira alsham-core —
 * **minerar o schema, jamais reutilizar o banco** (lição paga nº2).
 *
 * **Lição paga que este tipo carrega:** nada de banco-mãe compartilhado
 * entre sistemas. O isolamento é por `tenant_id` + RLS, em todas as tabelas.
 */
export interface Tenant {
  readonly id: TenantId;
  /** Identificador legível e estável, único na plataforma. */
  readonly slug: string;
  /**
   * Nome de exibição do tenant.
   *
   * ⚠️ **Lei anti-viés:** este campo é dado de runtime, preenchido pelo
   * banco do cliente. Nunca é literal em código, seed, teste ou fixture
   * deste repositório.
   */
  readonly name: string;
  readonly status: TenantStatus;
  /** Plano contratado. Resolve os limites em `PlanLimit`. */
  readonly planCode: string;
  readonly createdAt: IsoDateTime;
}

/** Estado de um vínculo entre pessoa e tenant. */
export type MembershipStatus = 'invited' | 'active' | 'revoked';

/**
 * O vínculo entre uma pessoa e um tenant. Uma pessoa pode pertencer a
 * vários tenants — o papel é sempre **por tenant**, nunca global.
 *
 * **Minerado de:** `workspace_members` + `invite_codes`/`invite_redemptions`
 * do kraken-v2 (Balanço Supabase §1: **PROVADO**). O ciclo convite →
 * resgate → membro ativo já roda em produção lá.
 */
export interface Membership {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** Papel dentro **deste** tenant. */
  readonly roleKey: RoleKey;
  readonly status: MembershipStatus;
  readonly createdAt: IsoDateTime;
}

/** Chave de papel, `kebab-case` (`owner`, `admin`, `finance-approver`). */
export type RoleKey = string;

/**
 * Um papel — o feixe de permissões que se concede a um membro.
 *
 * **Minerado de:** `user_roles` + `org_policies` do rascunho de RBAC da
 * pedreira alsham-core (Balanço Supabase §1), casados com o padrão de RLS
 * do Peritus/Forensic (Balanço de Tecnologia §1: **PROVADO**).
 *
 * **Duas camadas, sempre:** RLS no banco não substitui autorização na
 * aplicação. RLS garante que o tenant errado não *vê* a linha; o papel
 * garante que o membro certo não *faz* o que não deve.
 */
export interface Role {
  readonly key: RoleKey;
  /**
   * `null` = papel de sistema, idêntico em todo tenant (`owner`, `admin`).
   * Preenchido = papel que aquele tenant criou para si.
   */
  readonly tenantId: TenantId | null;
  readonly name: string;
  readonly description: string;
  /** Permissões concedidas. Nunca herda de outro papel: a lista é a verdade. */
  readonly permissions: readonly PermissionKey[];
}

/**
 * Chave de permissão, sempre em três partes: `<moduleId>.<recurso>.<ação>`.
 *
 * O prefixo ser o `ModuleId` é o que torna a permissão **rastreável até o
 * módulo que a registrou** — e o que permite revogar tudo de uma vez quando
 * o tenant desinstala o módulo.
 *
 * @example 'billing.subscription.read'
 * @example 'finance.payable.approve'
 */
export type PermissionKey = `${string}.${string}.${string}`;

/**
 * Uma permissão declarada por um módulo.
 *
 * **Regra de arquitetura (Roadmap):** todo módulo tem permissões próprias.
 * Módulo que não declara permissão não passa no crivo de instalação.
 */
export interface Permission {
  readonly key: PermissionKey;
  /** O módulo que registrou esta permissão. Prefixo de `key`. */
  readonly moduleId: string;
  /** O que esta permissão libera, em uma frase, para a tela de papéis. */
  readonly description: string;
}
