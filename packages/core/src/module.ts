import type { EventTypeDeclaration } from './events.ts';
import type {
  CoreVersionRange,
  IsoDateTime,
  ModuleId,
  SemVer,
  TenantId,
  Uuid,
} from './primitives.ts';
import type { CapabilityDeclaration, ModuleTaxonomy } from './taxonomy.ts';
import type { Permission } from './tenant.ts';

/**
 * **O CONTRATO DO LEGO.**
 *
 * Como um módulo se declara ao Core. Um módulo que não produz um manifesto
 * válido não se registra, não aparece na Store e não é instalável.
 *
 * As sete regras de arquitetura do Roadmap estão codificadas aqui: o módulo
 * é independente, instalável e removível, expõe API, emite eventos, tem
 * permissões próprias, tem docs e testes, tem IA opcional — e **nunca
 * depende de outro módulo**.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida completo
 * @see docs/canon/ROADMAP-TECNICO-V1.md — regras de arquitetura
 */
export interface ModuleManifest {
  readonly id: ModuleId;
  readonly name: string;
  readonly version: SemVer;
  /** Uma frase: o que este módulo resolve. Vai para a vitrine da Store. */
  readonly summary: string;

  /**
   * Onde este módulo vive na Taxonomia — Domain universal ou Vertical.
   *
   * **Sol Único:** referencia a Taxonomia, não cria classificação nova.
   */
  readonly taxonomy: ModuleTaxonomy;

  /**
   * As capacidades da Taxonomia que este módulo de fato implementa.
   *
   * **Lei 7 vive aqui.** Uma capacidade só entra nesta lista quando está
   * construída e funcionando. O manifesto é o que a Store exibe — listar
   * capacidade não construída é promessa no ar, e promessa no ar é
   * exatamente o que a Lei 7 proíbe.
   */
  readonly capabilities: readonly CapabilityDeclaration[];

  /**
   * As permissões que este módulo registra ao ser instalado, e que são
   * revogadas em bloco quando ele é removido.
   */
  readonly permissions: readonly Permission[];

  /** O que este módulo conta ao mundo e o que ele escuta do mundo. */
  readonly events: {
    readonly emits: readonly EventTypeDeclaration[];
    /**
     * Eventos que este módulo consome.
     *
     * ⚠️ Consumir o evento de outro módulo **não é depender dele**. O
     * acoplamento é com o *tipo do evento*, que é contrato público, não
     * com o código de quem o emitiu. Se ninguém emitir aquele tipo, este
     * módulo simplesmente não é acordado — não quebra.
     */
    readonly consumes: readonly EventTypeDeclaration[];
  };

  /**
   * A faixa de versão do Core que este módulo aceita.
   *
   * **Esta é a única dependência que existe.** Note que não há campo
   * `dependsOn` para outros módulos, e a ausência é deliberada: *"nunca
   * depender diretamente de outro módulo — toda comunicação ocorre através
   * do Core"* (Roadmap, Regras de Arquitetura). O que o tipo não permite
   * escrever, ninguém precisa lembrar de proibir na revisão.
   */
  readonly requiresCore: CoreVersionRange;

  /**
   * Agentes de IA que este módulo embarca.
   *
   * Opcional por contrato, esperado por doutrina da Casa: *"sempre que
   * puder, implantar um agente dentro do sistema"*. Agente **não é
   * módulo** — é a segunda dimensão, com marketplace próprio
   * (Taxonomia §7).
   */
  readonly agents?: readonly AgentSlot[];
}

/**
 * O encaixe de um agente dentro de um módulo.
 *
 * **Origem candidata:** o formato de alma Cápsula X.2 do alsham-os/Diamond
 * e o schema de marketplace do cognitive-mirror-ai (Balanço de Tecnologia
 * §2: **DOSSIÊ**; Balanço Supabase §1: as tabelas existem mas estão
 * **vazias hoje** — a verificar antes de ancorar a Store de Agentes nelas).
 * Por isso este tipo é o mínimo necessário para o Core não travar a Fase 8:
 * ele **não** tenta modelar a alma do agente ainda.
 */
export interface AgentSlot {
  readonly key: string;
  readonly name: string;
  /** O que este agente faz dentro do módulo, em uma frase. */
  readonly purpose: string;
}

/** Estado de um módulo no registro da plataforma. */
export type ModuleRegistrationStatus =
  /** Registrado, mas invisível na Store. */
  | 'draft'
  /** Publicado e instalável. */
  | 'published'
  /** Some da vitrine; quem já instalou continua rodando. */
  | 'deprecated';

/**
 * Um módulo no registro da plataforma — o catálogo, antes de qualquer
 * tenant instalar. É a fonte da vitrine da Store.
 *
 * **Minerado de:** o schema de marketplace do cognitive-mirror-ai —
 * `price_cents`, `is_subscription`, categoria, `capabilities` por item
 * (Balanço de Tecnologia §1: **PROVADO no schema**, com a leitura de que
 * *"monetização é UPDATE, não obra"*).
 *
 * ⚠️ **Preço não mora aqui.** Este tipo descreve o que o módulo *é*;
 * quanto ele custa é assunto de `@alsham/billing`, na Etapa 2. Manter as
 * duas coisas separadas é o que permite o mesmo módulo ter preço diferente
 * por plano sem reescrever o catálogo.
 */
export interface ModuleRegistration {
  readonly manifest: ModuleManifest;
  readonly status: ModuleRegistrationStatus;
  readonly registeredAt: IsoDateTime;
}

/** Estado de um módulo **dentro de um tenant**. */
export type TenantModuleStatus =
  | 'installing'
  | 'active'
  /** Instalado, porém desligado — dado preservado, acesso cortado. */
  | 'suspended'
  | 'uninstalled';

/**
 * A instalação de um módulo por um tenant — **o "instalar" da Store.**
 *
 * É a linha que transforma a tese em produto: *o cliente monta o próprio
 * sistema como quem instala aplicativos* (Taxonomia §11).
 *
 * **Minerado de:** a cadeia tenant→plano→limite→consumo do kraken-v2 —
 * `plan_limits` (5 planos) + `usage_ledger` (Balanço Supabase §1:
 * **PROVADO** em produção).
 */
export interface TenantModule {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly moduleId: ModuleId;
  /** Versão instalada. Atualização é por versão — nunca em bloco. */
  readonly version: SemVer;
  readonly status: TenantModuleStatus;
  readonly installedAt: IsoDateTime;
  /**
   * Configuração do tenant para este módulo.
   *
   * **É aqui que a Lei anti-viés se materializa.** Requisito que não passa
   * no teste *"outra empresa do mesmo setor usaria isso exatamente como
   * está?"* não vira código no módulo: vira uma chave neste objeto, ou um
   * serviço cobrado à parte. É o que impede o produto de virar o sistema
   * de um cliente só.
   */
  readonly settings: Readonly<Record<string, unknown>>;
}

/**
 * O teto contratado de um tenant para uma métrica.
 *
 * **Minerado de:** `plan_limits` + `usage_ledger` do kraken-v2 (Balanço de
 * Tecnologia §1 e Balanço Supabase §1: **PROVADO**, com 95+ lançamentos
 * reais e economia unitária calculada).
 */
export interface PlanLimit {
  readonly planCode: string;
  /** A grandeza limitada. @example 'seats' · 'storage-mb' · 'ai-tokens' */
  readonly metric: string;
  /** `null` = ilimitado no plano. */
  readonly limit: number | null;
  /** O que fazer ao estourar. */
  readonly onExceed: 'block' | 'meter';
}
