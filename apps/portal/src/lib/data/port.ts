import type {
  ApprovalItem,
  BankStatement,
  CsvMapping,
  MatchingSettings,
  ParsedStatement,
  Payable,
  Receivable,
  StatementLine,
} from '@alsham/finance-reconciliation';

/**
 * A PORTA DE DADOS do painel.
 *
 * ⭐ **Aqui a Regra de Ouro se sustenta ou cai** (CLAUDE.md §5.3).
 *
 * Repare no que esta interface **não** tem: nenhum método `calcular`,
 * `decidir`, `pontuar`, `resumir` ou `validar`. Só `carregar` e `gravar`. A
 * porta busca linhas e devolve linhas; quem pensa é
 * `@alsham/finance-reconciliation`.
 *
 * Nem mesmo `importStatement` foge disso: ela recebe um `ParsedStatement` já
 * pronto — quem leu o arquivo foi o parser, no pacote. A porta só grava.
 *
 * Consequência prática: trocar Supabase por outra coisa em 2028 é escrever um
 * novo adapter. Trocar o Next.js é jogar `apps/` fora. Em nenhum dos dois
 * casos se toca na regra de negócio — porque ela nunca esteve aqui.
 */
export interface DataPort {
  /** De onde vieram os dados — a tela mostra isso ao operador, sem esconder. */
  readonly kind: 'mock' | 'supabase';

  /**
   * As permissões do usuário no tenant atual.
   *
   * A tela usa para ESCONDER o que a pessoa não pode fazer. Isso é cortesia
   * de interface, **não** segurança: quem manda é a RLS e a policy no banco,
   * que barram a escrita mesmo se alguém forjar o clique.
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

  /**
   * O mapeamento de colunas do CSV **do tenant**, de
   * `settings.import.csvMapping`. `null` quando ainda não foi configurado.
   *
   * ⚠️ Mesma lei: cada empresa usa o banco que usa, e cada banco exporta o
   * CSV que quer. Uma lista de bancos homologados no código seria o sistema
   * de um cliente só.
   */
  loadCsvMapping(): Promise<CsvMapping | null>;

  loadStatementLines(): Promise<StatementLine[]>;
  loadPayables(): Promise<Payable[]>;
  /** Projeções locais de títulos a receber (crédito do extrato). */
  loadReceivables(): Promise<Receivable[]>;
  loadApprovalQueue(): Promise<ApprovalItem[]>;

  /** Os extratos ainda abertos, para a tela de fechamento. */
  loadOpenStatements(): Promise<BankStatement[]>;

  /** As linhas de UM extrato — o insumo de `summarizeStatement()`. */
  loadLinesOfStatement(statementId: string): Promise<StatementLine[]>;

  /**
   * Grava um extrato já lido pelo parser.
   *
   * O `contentHash` é a chave de idempotência: reimportar o mesmo arquivo
   * bate no `unique` do banco e volta como erro legível, não como duplicata
   * silenciosa.
   */
  importStatement(input: {
    accountRef: string;
    currency: string;
    format: 'ofx' | 'csv';
    originalFilename: string | null;
    contentHash: string;
    parsed: ParsedStatement;
  }): Promise<{ statementId: string; lineCount: number }>;

  /**
   * Fecha o extrato (`status` → `closed`).
   *
   * É isto que dispara o trigger `bank_statements_emit_completed` e põe
   * `recon.reconciliation.completed` na caixa de saída do Core — na mesma
   * transação.
   */
  closeStatement(statementId: string): Promise<void>;

  /** Descarta o extrato. Ação destrutiva: some da operação, nunca da trilha. */
  discardStatement(statementId: string): Promise<void>;

  decideMatch(input: { matchId: string; decision: 'confirmed' | 'rejected' }): Promise<void>;

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
