/**
 * A Taxonomia, expressa em tipos.
 *
 * **Sol Único:** este arquivo não cria taxonomia — ele *referencia* a única
 * que existe, `docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md`. As chaves abaixo
 * são a transcrição fiel dos 18 Domains universais (§5) e dos 29 OS/Verticais
 * (§6) daquele documento.
 *
 * Se a Taxonomia mudar, este arquivo muda junto, no mesmo PR. Se alguém
 * precisar de uma chave que não está aqui, a resposta não é acrescentar
 * uma linha: é levar a proposta ao canon primeiro.
 */

/**
 * Os 18 Domains universais — módulos que praticamente toda empresa usa.
 *
 * @see docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md §5
 */
export type DomainKey =
  /** 💰 Financeiro (19 capacidades) */
  | 'finance'
  /** 🤝 Comercial & CRM (12) — reaproveita 360° PRIMA */
  | 'crm'
  /** 👥 RH (14) */
  | 'hr'
  /** ⚖ Jurídico (12) */
  | 'legal'
  /** 📢 Marketing (13) */
  | 'marketing'
  /** 📦 Compras (9) */
  | 'procurement'
  /** 🏭 Operações (10) */
  | 'operations'
  /** 🔗 Supply Chain (7) — separado de Compras */
  | 'supply-chain'
  /** 📋 PMO & Projetos (10) */
  | 'pmo'
  /** 🧪 Qualidade (7) */
  | 'quality'
  /** 💬 Atendimento ao Cliente — CX (8) */
  | 'cx'
  /** 📊 BI (7) */
  | 'bi'
  /** 🤖 IA Aplicada (9) — reaproveita o Exército ALSHAM */
  | 'applied-ai'
  /** 🏛 Governança, Riscos & Compliance — GRC (7) */
  | 'grc'
  /** 🔐 Segurança da Informação (7) */
  | 'infosec'
  /** 🌱 ESG & Sustentabilidade (6) */
  | 'esg'
  /** 🔬 Pesquisa & Desenvolvimento (6) */
  | 'rnd'
  /** 🧾 Contábil & Fiscal (8) — fronteira construir × INTEGRAR (Lei 3) */
  | 'accounting';

/**
 * Os 29 OS/Verticais — pacotes por setor, que reutilizam os Domains
 * universais e acrescentam só o que é do ofício.
 *
 * @see docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md §6
 */
export type VerticalKey =
  | 'shopping-centers'
  | 'retail'
  | 'energy'
  /** Vertical viva: Peritus / Medical OS™ (Balanço: PROVADO). */
  | 'health'
  /** Vertical viva: Peritus (Balanço: PROVADO). */
  | 'government'
  /** Vertical viva: Events OS™ (Balanço: DOSSIÊ). */
  | 'events'
  /** Vertical viva: Suprema Beleza (Balanço: DOSSIÊ). */
  | 'beauty'
  | 'agro'
  | 'logistics'
  | 'heavy-fleet'
  | 'industry'
  | 'construction'
  | 'real-estate'
  | 'condominiums'
  | 'education'
  | 'hospitality'
  | 'restaurants'
  | 'fitness'
  | 'pet'
  | 'churches-ngos'
  | 'ecommerce'
  | 'laboratories'
  | 'insurance'
  | 'cooperatives'
  | 'mining'
  | 'ports-airports'
  | 'telecom'
  | 'franchises'
  /** Canon FUTURO, pós-lançamento (Taxonomia §6). */
  | 'corporate-metaverse';

/**
 * Onde um módulo se situa na hierarquia canônica.
 *
 * União discriminada de propósito: um módulo é **ou** de Domain universal,
 * **ou** de Vertical. Não existe módulo que seja os dois — se parecer que é,
 * a peça universal desce para o Domain e a vertical fica só com o ofício.
 *
 * As camadas Core e Engines **não aparecem aqui de propósito**: Engines são
 * encanamento da plataforma e, por decisão da Taxonomia (§4), não entram na
 * Store. Um Engine não se declara com `ModuleManifest`.
 */
export type ModuleTaxonomy =
  | { readonly layer: 'domain'; readonly domain: DomainKey }
  | { readonly layer: 'vertical'; readonly vertical: VerticalKey };

/**
 * Uma capacidade — a unidade de valor dentro de um Domain ou Vertical
 * (ex.: `Conciliação bancária` dentro de Financeiro).
 *
 * **Capacidade ≠ módulo.** Capacidade é a unidade do mapa; módulo é a
 * unidade de empacotamento. Quantas capacidades viram um módulo instalável
 * é decisão de produto, tomada caso a caso — o mapa não decide isso
 * (Taxonomia §1).
 */
export interface CapabilityDeclaration {
  /** Chave estável, `kebab-case`, única dentro do módulo. */
  readonly key: string;
  /**
   * O nome da capacidade **como escrito na Taxonomia**, para que a
   * rastreabilidade mapa→código seja conferível a olho.
   *
   * @example 'Conciliação bancária'
   */
  readonly canonicalName: string;
}
