import type {
  ApprovalItem,
  MatchingSettings,
  Payable,
  StatementLine,
} from '@alsham/finance-reconciliation';

/**
 * A PORTA DE DADOS do painel.
 *
 * ⭐ **Aqui a Regra de Ouro se sustenta ou cai** (CLAUDE.md §5.3).
 *
 * Repare no que esta interface **não** tem: nenhum método `calcular`,
 * `decidir`, `pontuar` ou `validar`. Só `carregar` e `gravar`. A porta busca
 * linhas e devolve linhas; quem pensa é `@alsham/finance-reconciliation`.
 *
 * Consequência prática: trocar Supabase por outra coisa em 2028 é escrever um
 * novo adapter. Trocar o Next.js é jogar `apps/` fora. Em nenhum dos dois
 * casos se toca na regra de negócio — porque ela nunca esteve aqui.
 *
 * **Teste de bolso:** se eu apagar `apps/` inteiro, perco alguma regra de
 * negócio? Lendo esta interface, a resposta é não.
 */
export interface DataPort {
  /** De onde vieram os dados — a tela mostra isso ao operador, sem esconder. */
  readonly kind: 'mock' | 'supabase';

  /**
   * As permissões do usuário no tenant atual.
   *
   * A tela usa para ESCONDER o que a pessoa não pode fazer. Isso é cortesia
   * de interface, **não** segurança: quem manda é a RLS e a policy no banco,
   * que barram a escrita mesmo se alguém forjar o clique. Botão escondido
   * evita frustração; policy evita incidente.
   */
  listPermissions(): Promise<ReadonlySet<string>>;

  /**
   * A política de conciliação **do tenant**, de `core.tenant_modules.settings`.
   *
   * ⚠️ Vem do banco de propósito. Uma empresa aceita casar automático a 0.95,
   * outra exige 0.99. Se este número virasse constante no app, o produto
   * seria o sistema de UMA empresa (Lei anti-viés).
   */
  loadMatchingSettings(): Promise<MatchingSettings>;

  loadStatementLines(): Promise<StatementLine[]>;
  loadPayables(): Promise<Payable[]>;
  loadApprovalQueue(): Promise<ApprovalItem[]>;

  /**
   * Grava o visto do humano num casamento.
   *
   * A porta **não decide** se pode: ela tenta, e o banco responde. Se a
   * permissão faltar, a policy devolve zero linhas afetadas e isto lança.
   */
  decideMatch(input: {
    matchId: string;
    decision: 'confirmed' | 'rejected';
  }): Promise<void>;

  /** Grava a decisão de um item da fila. Mesma regra: quem autoriza é o banco. */
  decideApproval(input: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    note?: string;
  }): Promise<void>;
}

/**
 * Erro de carregamento com mensagem apresentável — a tela nunca crasha em branco.
 *
 * A causa original vai em `options.cause`, o campo padrão do `Error` desde o
 * ES2022: ela fica no log do servidor e **não** é mostrada ao usuário. Detalhe
 * de banco na tela é vazamento, não diagnóstico.
 */
export class DataPortError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataPortError';
  }
}
