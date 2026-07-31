/**
 * **O MENU — quais rotas existem para quem.**
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): isto vive em `packages/` porque é DECISÃO
 * — cruzar as permissões que o usuário tem no tenant com o que cada tela exige.
 * O layout recebe a lista pronta e desenha `<Link>`.
 *
 * ⚠️ **Esconder o item é CORTESIA, não segurança.** Quem impede de verdade é a
 * RLS: sem permissão do módulo, `<modulo>.can_access()` devolve falso e a tela
 * não carrega linha nenhuma, mesmo com a URL digitada à mão. O menu existe para
 * não prometer o que não foi contratado.
 *
 * ⭐ **Uma leitura só, para o menu inteiro.** A Etapa 10 registrou a dívida com
 * o nome dela: *"uniformizá-los é mudança própria, com uma leitura de permissões
 * só para o menu inteiro em vez de uma por módulo"*. É esta função: ela recebe o
 * conjunto COMPLETO de permissões do usuário — uma consulta — e responde por
 * todos os itens. A versão anterior fazia uma ida ao banco por módulo, e cada
 * módulo novo acrescentava mais uma.
 */

/** Uma entrada do menu, já decidida. */
export interface MenuItem {
  readonly href: string;
  readonly label: string;
  /**
   * O módulo a que a rota pertence, ou `null` quando ela é do Core.
   *
   * Rota de Core (o painel, a Store) não some por falta de permissão de
   * módulo: ela é a plataforma, não um item de catálogo.
   */
  readonly moduleId: string | null;
}

/**
 * O menu completo, na ordem em que se lê.
 *
 * ⚠️ **`requires` guarda PREFIXO de módulo, não uma lista de chaves.** Listar
 * as permissões uma a uma faria este arquivo precisar mudar toda vez que um
 * módulo ganhasse uma permissão nova — e o dia em que alguém esquecesse seria o
 * dia em que o item sumiria do menu de quem tem acesso, sem erro nenhum. O
 * prefixo é o mesmo contrato que `core.install_module()` usa para conceder e
 * revogar em bloco.
 */
const MENU: readonly MenuItem[] = [
  { href: '/', label: 'Painel', moduleId: null },
  { href: '/importar', label: 'Importar', moduleId: 'recon' },
  { href: '/conciliacao', label: 'Conciliação', moduleId: 'recon' },
  { href: '/aprovacoes', label: 'Aprovações', moduleId: 'recon' },
  { href: '/fechamento', label: 'Fechamento', moduleId: 'recon' },
  { href: '/campanhas', label: 'Campanhas', moduleId: 'marketing' },
  { href: '/contas-a-pagar', label: 'Contas a pagar', moduleId: 'ap' },
  { href: '/contas-a-receber', label: 'Contas a receber', moduleId: 'ar' },
  { href: '/relacionamentos', label: 'Relacionamentos', moduleId: 'crm' },
  { href: '/compras', label: 'Compras', moduleId: 'po' },
  { href: '/esteira', label: 'Esteira', moduleId: 'ops' },
  { href: '/esteiras', label: 'Esteiras', moduleId: 'ops' },
  { href: '/estoque', label: 'Estoque', moduleId: 'inv' },
  { href: '/propostas', label: 'Propostas', moduleId: 'quote' },
  { href: '/funil', label: 'Funil', moduleId: 'deal' },
  { href: '/eventos', label: 'Eventos', moduleId: 'evt' },
  { href: '/cobranca', label: 'Cobrança', moduleId: 'dun' },
  { href: '/contratos', label: 'Contratos', moduleId: 'ctr' },
  { href: '/caixa', label: 'Caixa', moduleId: 'cash' },
  { href: '/atendimento', label: 'Atendimento', moduleId: 'care' },
  { href: '/ocorrencias', label: 'Ocorrências', moduleId: 'occ' },
  { href: '/manutencao', label: 'Manutenção', moduleId: 'mnt' },
  { href: '/patrimonio', label: 'Patrimônio', moduleId: 'pat' },
  { href: '/checklists', label: 'Checklists', moduleId: 'chk' },
  { href: '/espacos', label: 'Espaços', moduleId: 'spc' },
  { href: '/visitas', label: 'Visitas', moduleId: 'vis' },
  { href: '/leads', label: 'Leads', moduleId: 'lead' },
  { href: '/metas', label: 'Metas', moduleId: 'goal' },
  { href: '/comunicados', label: 'Comunicados', moduleId: 'comm' },
  { href: '/calendario', label: 'Calendário', moduleId: 'edcal' },
  { href: '/midia', label: 'Mídia', moduleId: 'media' },
  { href: '/pesquisas', label: 'Pesquisas', moduleId: 'nps' },
  { href: '/centros-de-custo', label: 'Centros de Custo', moduleId: 'cc' },
  { href: '/orcamentos', label: 'Orçamentos', moduleId: 'bud' },
  { href: '/contas-bancarias', label: 'Contas Bancárias', moduleId: 'bank' },
  { href: '/investimentos', label: 'Investimentos', moduleId: 'invest' },
  { href: '/dre', label: 'DRE Gerencial', moduleId: 'dre' },
  { href: '/colaboradores', label: 'Colaboradores', moduleId: 'hr' },
  { href: '/escalas', label: 'Escalas', moduleId: 'shift' },
  { href: '/treinamentos', label: 'Treinamentos', moduleId: 'train' },
  { href: '/avaliacoes', label: 'Avaliações', moduleId: 'perf' },
  { href: '/politicas', label: 'Políticas', moduleId: 'pol' },
  { href: '/lojistas', label: 'Lojistas', moduleId: 'mall' },
  { href: '/locacao', label: 'Locação', moduleId: 'lease' },
  { href: '/fundo-promocao', label: 'Fundo de Promoção', moduleId: 'fund' },
  { href: '/estacionamento', label: 'Estacionamento', moduleId: 'park' },
  { href: '/rondas', label: 'Rondas', moduleId: 'sec' },
  { href: '/fornecedores', label: 'Fornecedores', moduleId: 'vendor' },
  { href: '/cotacoes', label: 'Cotações', moduleId: 'rfq' },
  { href: '/recebimentos', label: 'Recebimento', moduleId: 'recv' },
  { href: '/avaliacao-fornecedores', label: 'Avaliação de Fornecedores', moduleId: 'vperf' },
  { href: '/estoque-minimo', label: 'Estoque Mínimo', moduleId: 'reorder' },
  { href: '/planejamento-demanda', label: 'Planejamento de Demanda', moduleId: 'dem' },
  { href: '/sop', label: 'S&OP', moduleId: 'sop' },
  { href: '/centros-distribuicao', label: 'Centros de Distribuição', moduleId: 'dc' },
  { href: '/despachos', label: 'Despacho', moduleId: 'disp' },
  { href: '/performance-logistica', label: 'Performance Logística', moduleId: 'logperf' },
  { href: '/projetos', label: 'Projetos', moduleId: 'proj' },
  { href: '/cronogramas', label: 'Cronogramas', moduleId: 'sched' },
  { href: '/kanban', label: 'Kanban', moduleId: 'kanban' },
  { href: '/recursos', label: 'Recursos', moduleId: 'alloc' },
  { href: '/custos-projeto', label: 'Custos do Projeto', moduleId: 'pcost' },
  { href: '/sprints', label: 'Scrum', moduleId: 'scrum' },
  { href: '/gantt', label: 'Gantt', moduleId: 'gantt' },
  { href: '/riscos', label: 'Riscos', moduleId: 'risk' },
  { href: '/apontamentos', label: 'Timesheet', moduleId: 'timesheet' },
  { href: '/portfolio', label: 'Portfólio', moduleId: 'pfolio' },
  { href: '/nao-conformidades', label: 'Não Conformidades', moduleId: 'nc' },
  { href: '/auditorias', label: 'Auditorias', moduleId: 'audit' },
  { href: '/capa', label: 'CAPA', moduleId: 'capa' },
  { href: '/iso', label: 'Requisitos ISO', moduleId: 'iso' },
  { href: '/esg', label: 'Métricas Ambientais', moduleId: 'esg' },
  { href: '/store', label: 'Store', moduleId: null },
  { href: '/ajustes', label: 'Ajustes', moduleId: null },
];

/**
 * Os itens de menu visíveis para quem tem estas permissões.
 *
 * @param permissions todas as permissões do usuário NO TENANT ATUAL, de todos
 *   os módulos. Uma consulta a `core.role_permissions`, sob RLS.
 */
export function visibleMenu(permissions: ReadonlySet<string>): readonly MenuItem[] {
  return MENU.filter(
    (item) => item.moduleId === null || hasModuleAccess(permissions, item.moduleId),
  );
}

/**
 * O usuário tem QUALQUER permissão deste módulo?
 *
 * É a mesma pergunta que `<modulo>.can_access()` faz no banco: qualquer uma das
 * permissões do módulo dá acesso de leitura às telas dele. Perguntar por uma
 * chave específica esconderia o módulo de quem só tem a permissão de decidir —
 * justamente quem mais precisa entrar.
 */
export function hasModuleAccess(
  permissions: ReadonlySet<string>,
  moduleId: string,
): boolean {
  const prefixo = `${moduleId}.`;
  for (const p of permissions) {
    if (p.startsWith(prefixo)) return true;
  }
  return false;
}

/** Os módulos a que o usuário tem acesso, deduzidos do conjunto. */
export function accessibleModules(permissions: ReadonlySet<string>): readonly string[] {
  const modulos = new Set<string>();
  for (const p of permissions) {
    const ponto = p.indexOf('.');
    if (ponto > 0) modulos.add(p.slice(0, ponto));
  }
  // `core.*` é a plataforma, não um módulo de catálogo.
  modulos.delete('core');
  return [...modulos].sort();
}

/** Só para teste e documentação: o menu inteiro, sem filtro. */
export const ALL_MENU_ITEMS = MENU;
