import type { ShelfItem } from '@alsham/permissions';

/**
 * **O MAPA INTEIRO DA STORE** — os 47 territórios da Taxonomia, declarados uma
 * vez para nunca mais serem redesenhados a cada onda de módulos.
 *
 * ⭐ **A decisão de arquitetura que resolve "nunca mais redesenhar":** este
 * arquivo declara os 18 Domains Universais (Taxonomia §5) e os 29 OS/Verticais
 * (Taxonomia §6) — cada um com sua chave técnica, o nome oficial em PT e a
 * contagem de capacidades DO MAPA. A tela **não decide** o que é "Em Breve" por
 * uma lista escrita à mão: ela CRUZA este mapa com o que `buildShelf()` retorna
 * (agrupado por `domainKey`/`verticalKey`). Território com ≥1 módulo publicado
 * vira seção viva; território com 0, vira pill "Em breve". Quando uma onda
 * futura publicar um módulo num território hoje vazio, ele **gradua sozinho** —
 * zero código novo, zero redesign.
 *
 * ⚠️ **Sol Único (CLAUDE.md §2, Lei 6).** Os nomes e as contagens vêm
 * LITERALMENTE de `docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md`. Nenhum nome
 * inventado, nenhum fora do mapa, nenhuma capacidade individual listada — a
 * contagem é a leitura do oceano, não a promessa de empacotamento (Lei 7).
 *
 * ⚠️ **Sem emoji no produto** (IDENTIDADE-VISUAL §6, anti-brand). A Taxonomia
 * prefixa cada território com um emoji; aqui fica só o nome institucional.
 *
 * ⚠️ **As chaves dos territórios ainda VAZIOS são provisórias.** As dos
 * territórios vivos (`finance`, `crm`, `hr`, `legal`, `marketing`,
 * `procurement`, `operations`, `cx`, `bi`) são as que o `core.module_registry`
 * já usa — verificadas contra o seed. As demais são a melhor aposta de qual
 * `domain_key`/`vertical_key` um módulo futuro usará; se um módulo nascer com
 * chave diferente, a tela NÃO quebra: o cruzamento cai no fallback (ver
 * `mapShelfToTaxonomy`) e o território aparece rotulado com a chave crua.
 */

export interface Territory {
  /** `domain_key` (para domínios) ou `vertical_key` (para verticais). */
  readonly key: string;
  readonly layer: 'domain' | 'vertical';
  /** Nome oficial em PT — Taxonomia §5/§6, sem o emoji do mapa. */
  readonly name: string;
  /** Contagem de capacidades DO MAPA (Taxonomia), não de módulos construídos. */
  readonly capabilities: number;
}

/**
 * 18 DOMAINS UNIVERSAIS — Taxonomia §5, na ordem do mapa (171 capacidades).
 *
 * Vivos hoje (chave confirmada no `core.module_registry`): finance, crm, hr,
 * legal, marketing, procurement, operations, cx, bi.
 */
export const DOMAIN_TERRITORIES: readonly Territory[] = [
  { key: 'finance', layer: 'domain', name: 'Financeiro', capabilities: 19 },
  { key: 'crm', layer: 'domain', name: 'Comercial & CRM', capabilities: 12 },
  { key: 'hr', layer: 'domain', name: 'RH', capabilities: 14 },
  { key: 'legal', layer: 'domain', name: 'Jurídico', capabilities: 12 },
  { key: 'marketing', layer: 'domain', name: 'Marketing', capabilities: 13 },
  { key: 'procurement', layer: 'domain', name: 'Compras', capabilities: 9 },
  { key: 'operations', layer: 'domain', name: 'Operações', capabilities: 10 },
  // ↓ ainda sem módulo publicado — chaves provisórias
  { key: 'supply-chain', layer: 'domain', name: 'Supply Chain', capabilities: 7 },
  { key: 'pmo', layer: 'domain', name: 'PMO & Projetos', capabilities: 10 },
  { key: 'quality', layer: 'domain', name: 'Qualidade', capabilities: 7 },
  { key: 'cx', layer: 'domain', name: 'Atendimento ao Cliente', capabilities: 8 },
  { key: 'bi', layer: 'domain', name: 'BI', capabilities: 7 },
  { key: 'ai-applied', layer: 'domain', name: 'IA Aplicada', capabilities: 9 },
  { key: 'grc', layer: 'domain', name: 'Governança, Riscos & Compliance', capabilities: 7 },
  { key: 'infosec', layer: 'domain', name: 'Segurança da Informação', capabilities: 7 },
  { key: 'esg', layer: 'domain', name: 'ESG & Sustentabilidade', capabilities: 6 },
  { key: 'rnd', layer: 'domain', name: 'Pesquisa & Desenvolvimento', capabilities: 6 },
  { key: 'accounting', layer: 'domain', name: 'Contábil & Fiscal', capabilities: 8 },
];

/**
 * 29 OS/VERTICAIS — Taxonomia §6, na ordem do mapa (198 capacidades).
 *
 * Nenhum vertical tem módulo publicado hoje — todas as chaves são provisórias.
 */
export const VERTICAL_TERRITORIES: readonly Territory[] = [
  { key: 'shopping-centers', layer: 'vertical', name: 'Shopping Centers', capabilities: 9 },
  { key: 'retail', layer: 'vertical', name: 'Varejo & Supermercados', capabilities: 7 },
  { key: 'energy', layer: 'vertical', name: 'Energia', capabilities: 8 },
  { key: 'health', layer: 'vertical', name: 'Saúde', capabilities: 8 },
  { key: 'government', layer: 'vertical', name: 'Governo', capabilities: 8 },
  { key: 'events', layer: 'vertical', name: 'Eventos', capabilities: 8 },
  { key: 'beauty', layer: 'vertical', name: 'Beleza & Estética', capabilities: 6 },
  { key: 'agro', layer: 'vertical', name: 'Agro', capabilities: 8 },
  { key: 'logistics', layer: 'vertical', name: 'Logística', capabilities: 7 },
  { key: 'heavy-fleet', layer: 'vertical', name: 'Frota Pesada & Máquinas', capabilities: 7 },
  { key: 'industry', layer: 'vertical', name: 'Indústria', capabilities: 7 },
  { key: 'construction', layer: 'vertical', name: 'Construção Civil', capabilities: 8 },
  { key: 'real-estate', layer: 'vertical', name: 'Imóveis', capabilities: 6 },
  { key: 'condos', layer: 'vertical', name: 'Condomínios', capabilities: 7 },
  { key: 'education', layer: 'vertical', name: 'Educação', capabilities: 7 },
  { key: 'hospitality', layer: 'vertical', name: 'Hotelaria', capabilities: 6 },
  { key: 'restaurants', layer: 'vertical', name: 'Restaurantes', capabilities: 6 },
  { key: 'fitness', layer: 'vertical', name: 'Fitness & Academias', capabilities: 6 },
  { key: 'pet', layer: 'vertical', name: 'Pet & Veterinária', capabilities: 6 },
  { key: 'churches-ngos', layer: 'vertical', name: 'Igrejas & ONGs', capabilities: 6 },
  { key: 'ecommerce', layer: 'vertical', name: 'E-commerce', capabilities: 7 },
  { key: 'labs', layer: 'vertical', name: 'Laboratórios', capabilities: 7 },
  { key: 'insurance', layer: 'vertical', name: 'Seguros & Corretoras', capabilities: 6 },
  { key: 'cooperatives', layer: 'vertical', name: 'Cooperativas', capabilities: 6 },
  { key: 'mining', layer: 'vertical', name: 'Mineração', capabilities: 6 },
  { key: 'ports-airports', layer: 'vertical', name: 'Portos & Aeroportos', capabilities: 6 },
  { key: 'telecom', layer: 'vertical', name: 'Telecom', capabilities: 6 },
  { key: 'franchises', layer: 'vertical', name: 'Franquias', capabilities: 7 },
  { key: 'metaverse', layer: 'vertical', name: 'Metaverso Corporativo', capabilities: 6 },
];

/** Um território com os módulos publicados que caem nele (vazio = "Em breve"). */
export interface TerritorySection {
  readonly territory: Territory;
  readonly items: ShelfItem[];
}

/** Uma galeria: territórios vivos (com módulo) e os que ainda não chegaram. */
export interface Gallery {
  readonly layer: 'domain' | 'vertical';
  readonly live: TerritorySection[];
  readonly upcoming: Territory[];
}

/** A chave de agrupamento de um item, conforme a camada dele. */
function keyOf(item: ShelfItem): string | null {
  return item.entry.layer === 'vertical' ? item.entry.verticalKey : item.entry.domainKey;
}

/**
 * Um território cru, sintetizado quando um módulo publicado tem uma chave que
 * NÃO existe no mapa acima (requisito 5: nunca quebrar a tela).
 *
 * ⚠️ Se isto aparecer na UI, é sinal de que um módulo nasceu com um
 * `domain_key`/`vertical_key` fora da Taxonomia — ou de que a chave provisória
 * de um território vazio não bateu com a que o módulo escolheu. O conserto é
 * alinhar a chave aqui no mapa, não esconder o território.
 */
function rawTerritory(key: string, layer: 'domain' | 'vertical'): Territory {
  return { key, layer, name: key, capabilities: 0 };
}

/**
 * Cruza a prateleira (`buildShelf()`) com o mapa da Taxonomia.
 *
 * Pura: recebe os itens, devolve as duas galerias. Território com ≥1 item →
 * seção viva; sem item → "Em breve". Módulo com chave desconhecida vira um
 * território cru na galeria da camada dele (fallback do requisito 5).
 */
export function mapShelfToTaxonomy(items: readonly ShelfItem[]): {
  domains: Gallery;
  verticals: Gallery;
} {
  const porChave = new Map<string, ShelfItem[]>();
  for (const item of items) {
    const chave = keyOf(item);
    const bucket = `${item.entry.layer}:${chave ?? '∅'}`;
    const lista = porChave.get(bucket);
    if (lista) lista.push(item);
    else porChave.set(bucket, [item]);
  }

  function galleryFor(
    layer: 'domain' | 'vertical',
    territories: readonly Territory[],
  ): Gallery {
    const live: TerritorySection[] = [];
    const upcoming: Territory[] = [];
    const consumidas = new Set<string>();

    for (const territory of territories) {
      const bucket = `${layer}:${territory.key}`;
      const items = porChave.get(bucket) ?? [];
      if (items.length > 0) {
        consumidas.add(bucket);
        live.push({ territory, items });
      } else {
        upcoming.push(territory);
      }
    }

    // Fallback: módulos publicados cuja chave não bateu com nenhum território
    // do mapa. Nunca deveria acontecer — mas se acontecer, aparece rotulado com
    // a chave crua em vez de sumir.
    for (const [bucket, items] of porChave) {
      if (!bucket.startsWith(`${layer}:`) || consumidas.has(bucket)) continue;
      const chave = bucket.slice(layer.length + 1);
      live.push({ territory: rawTerritory(chave, layer), items });
    }

    return { layer, live, upcoming };
  }

  return {
    domains: galleryFor('domain', DOMAIN_TERRITORIES),
    verticals: galleryFor('vertical', VERTICAL_TERRITORIES),
  };
}
