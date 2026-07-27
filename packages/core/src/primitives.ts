/**
 * Primitivos compartilhados por todo o contrato do Core.
 *
 * Nada aqui tem runtime. São apelidos nominais que existem para que uma
 * assinatura diga *o que* o identificador é, não só que é uma string.
 */

/** UUID v4, como o Postgres o devolve. */
export type Uuid = string;

/**
 * Data-hora em ISO 8601, sempre em UTC (`2026-07-27T06:47:00.000Z`).
 *
 * Convenção fechada do Core: o banco guarda `timestamptz`, a fronteira
 * serializa em UTC. Módulo nenhum inventa fuso — o fuso é apresentação.
 */
export type IsoDateTime = string;

/** Identificador do tenant. Atravessa **toda** query da plataforma. */
export type TenantId = Uuid;

/** Identificador do usuário, na tabela de identidade do Supabase Auth. */
export type UserId = Uuid;

/**
 * Identificador estável de um módulo — `kebab-case`, único na plataforma.
 *
 * É o prefixo de toda permissão e de todo tipo de evento que o módulo
 * publica, e é a chave pela qual o tenant o instala na Store.
 *
 * @example 'billing' · 'finance-reconciliation' · 'crm'
 */
export type ModuleId = string;

/** Versionamento semântico de um módulo (`1.4.2`). */
export type SemVer = string;

/**
 * Faixa de versão do Core que um módulo aceita (`^1.0.0`).
 *
 * É a **única** dependência que um módulo pode declarar (ver `ModuleManifest`).
 */
export type CoreVersionRange = string;
