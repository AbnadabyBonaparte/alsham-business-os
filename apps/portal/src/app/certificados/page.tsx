import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Contábil & Fiscal · Certificado Digital — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezessete — ABRE o Domain Contábil & Fiscal):
 * schema, RLS, gatilhos e o motor @alsham/fiscalcert estão provados no CI. É só
 * o registro de METADADOS (tipo, titular, validade) — nunca o arquivo .pfx, a
 * chave privada ou a assinatura (Lei 3 + segurança). Esta página existe para a
 * rota não apontar para o vazio.
 */
export default function CertificadosPage() {
  return (
    <>
      <PageHero
        eyebrow="Contábil & Fiscal · Certificado Digital"
        title="A agenda de validade dos certificados."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Guarda os metadados de cada certificado — o tipo (e-CNPJ, e-CPF… texto livre), o titular e, o que importa, quando vence. É um lembrete de vencimento, nunca um cofre: o arquivo .pfx, a chave privada e qualquer assinatura ficam de fora, por lei e por segurança. O certificado trocado é arquivado, não apagado (active ↔ archived). As outras 7 capacidades do domínio — NF-e, NFS-e, NFC-e, SPED, eSocial, apuração, integração com contador — são integração, não módulo (Lei 3). O módulo fiscalcert já vive no banco e no motor @alsham/fiscalcert."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a agenda de vencimentos (com os alertas, que são engine futura) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
