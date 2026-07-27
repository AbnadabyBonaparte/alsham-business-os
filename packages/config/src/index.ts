/**
 * @alsham/config — constantes canônicas do ALSHAM Business OS™.
 *
 * REGRA DESTE ARQUIVO (Lei 7 + Lei anti-viés + Sol Único):
 *
 * Só entra aqui o que é **institucional e verificável**. Não entra:
 *  - número de marketing (quantidade de módulos, capacidades, clientes, uptime);
 *  - qualquer dado de cliente — nome, razão social, CNPJ, contato, apelido;
 *  - segredo de qualquer espécie (chave, token, connection string, URL de projeto).
 *
 * Segredo mora em variável de ambiente e é lido pelo Core, nunca por este pacote.
 *
 * Este arquivo é a fonte única **para o código**. A declaração jurídica de
 * propriedade vive em `NOTICE.md`, na raiz do repositório — os dois devem
 * concordar sempre; se divergirem, `NOTICE.md` vence.
 */

/**
 * Identidade do produto.
 *
 * `name` é o nome canônico usado no canon (`docs/canon/`) e no README.
 * Nada aqui descreve o que o produto faz — descrição é assunto do canon,
 * não de constante de código.
 */
export const PRODUCT = {
  /** Nome canônico do produto. */
  name: 'ALSHAM Business OS',
  /** Nome com a marca nominativa, para uso em texto institucional. */
  displayName: 'ALSHAM Business OS™',
  /** Identificador estável em snake/kebab — usado em slug, chave e log. */
  slug: 'alsham-business-os',
} as const;

/**
 * Identidade da empresa proprietária.
 *
 * IP 100% ALSHAM Global (Lei 5 do projeto). O tenant usa a plataforma;
 * nunca detém o motor nem as chaves-mãe.
 *
 * Fonte da razão social e do CNPJ: `NOTICE.md` na raiz.
 */
export const COMPANY = {
  /** Razão social. */
  legalName: 'ALSHAM Global Commerce Ltda',
  /** CNPJ, com máscara, como consta no NOTICE.md. */
  cnpj: '59.332.265/0001-30',
  /** Canal comercial oficial. */
  commercialEmail: 'comercial@alshamglobal.com.br',
} as const;

export type Product = typeof PRODUCT;
export type Company = typeof COMPANY;
