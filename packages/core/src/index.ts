/**
 * `@alsham/core` — **o contrato do Lego.**
 *
 * Os tipos que todo módulo do ALSHAM Business OS™ obedece. Este pacote é
 * deliberadamente **zero runtime**: só tipos, nenhuma função, nenhuma
 * constante, nenhum import de banco. Compilar este pacote não produz um
 * único byte de JavaScript.
 *
 * A razão é a regra de arquitetura mais dura do Roadmap: *"nunca depender
 * diretamente de outro módulo — toda comunicação ocorre através do Core"*.
 * Um Core sem runtime não tem como ser acoplado por acidente. Ele descreve
 * o encaixe; quem executa é a implementação, que virá depois e por partes.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida de um módulo
 * @see docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md — a única taxonomia
 * @see docs/canon/ROADMAP-TECNICO-V1.md — a ordem de engenharia
 */

export type {
  CoreVersionRange,
  IsoDateTime,
  ModuleId,
  SemVer,
  TenantId,
  UserId,
  Uuid,
} from './primitives';

export type {
  CapabilityDeclaration,
  DomainKey,
  ModuleTaxonomy,
  VerticalKey,
} from './taxonomy';

export type {
  Membership,
  MembershipStatus,
  Permission,
  PermissionKey,
  Role,
  RoleKey,
  Tenant,
  TenantStatus,
} from './tenant';

export type {
  DomainEvent,
  EventEnvelope,
  EventType,
  EventTypeDeclaration,
  OutboxEntry,
  OutboxStatus,
} from './events';

export type {
  AgentSlot,
  ModuleManifest,
  ModuleRegistration,
  ModuleRegistrationStatus,
  PlanLimit,
  TenantModule,
  TenantModuleStatus,
} from './module';

export type { AuditActor, AuditEntry } from './audit';
