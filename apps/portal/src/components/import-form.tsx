'use client';

import { useRef, useState, useTransition } from 'react';

import {
  importStatementAction,
  previewStatementAction,
  type PreviewResult,
} from '@/app/actions';
import { money, shortDate } from '@/lib/format';
import { Badge, ErrorState, Panel } from '@/components/states';

/**
 * A tela de importar extrato.
 *
 * ⭐ **Este componente não sabe ler extrato.** Ele coleta o arquivo, chama
 * `previewStatementAction` (que chama o parser, no pacote) e desenha o que
 * voltou. Não há `split(';')`, não há regex de data, não há conversão de
 * valor aqui — isso é regra de negócio e vive em
 * `@alsham/finance-reconciliation/parsing`.
 *
 * O fluxo é **ler → conferir → confirmar**. O operador vê o que vai entrar
 * antes de entrar; importar às cegas é como se descobre no mês seguinte que o
 * separador decimal estava errado.
 */
export function ImportForm({
  canImport,
  temMapeamentoCsv,
}: {
  canImport: boolean;
  /** `false` quando o tenant ainda não configurou `settings.import.csvMapping`. */
  temMapeamentoCsv: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [format, setFormat] = useState<'ofx' | 'csv'>('ofx');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ lineCount: number } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canImport) {
    return (
      <ErrorState
        title="Você não pode importar extratos neste tenant"
        detail="Esta ação exige a permissão recon.statement.import. Peça a quem administra a empresa."
      />
    );
  }

  function conferir(formData: FormData) {
    setErro(null);
    setFeito(null);
    startTransition(async () => {
      const r = await previewStatementAction(formData);
      if (r.ok && r.data) setPreview(r.data);
      else {
        setPreview(null);
        setErro(r.ok ? 'Não foi possível ler o arquivo.' : r.message);
      }
    });
  }

  function confirmar() {
    const form = formRef.current;
    if (!form) return;
    setErro(null);
    startTransition(async () => {
      const r = await importStatementAction(new FormData(form));
      if (r.ok && r.data) {
        setFeito({ lineCount: r.data.lineCount });
        setPreview(null);
        form.reset();
      } else {
        setErro(r.ok ? 'Falha inesperada.' : r.message);
      }
    });
  }

  const saidas = preview?.lines.filter((l) => l.amountCents < 0).length ?? 0;
  const entradas = preview?.lines.filter((l) => l.amountCents > 0).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Panel className="px-6 py-6">
        <form ref={formRef} action={conferir} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-bos-muted">Formato</span>
              <select
                name="format"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as 'ofx' | 'csv');
                  setPreview(null);
                }}
                className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text focus:border-bos-accent focus:outline-none"
              >
                <option value="ofx">OFX</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-bos-muted">Arquivo</span>
              <input
                type="file"
                name="file"
                accept={format === 'ofx' ? '.ofx,.OFX' : '.csv,.txt,.CSV'}
                required
                onChange={() => setPreview(null)}
                className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text file:mr-3 file:rounded file:border-0 file:bg-bos-elevated file:px-3 file:py-1 file:text-xs file:text-bos-text focus:border-bos-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-bos-muted">Conta</span>
              <input
                name="accountRef"
                placeholder="a referência que sua empresa usa"
                defaultValue={preview?.accountRef ?? ''}
                required
                className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted focus:border-bos-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-bos-muted">Moeda (ISO 4217)</span>
              <input
                name="currency"
                placeholder="BRL"
                maxLength={3}
                defaultValue={preview?.currency ?? ''}
                required
                className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm uppercase text-bos-text placeholder:text-bos-muted focus:border-bos-accent focus:outline-none"
              />
            </label>
          </div>

          {format === 'csv' && !temMapeamentoCsv ? (
            <p className="rounded-md border border-bos-warning/50 bg-bos-warning/10 px-3 py-2 text-xs text-bos-text">
              Este tenant ainda não tem um mapeamento de CSV configurado
              (<code className="font-mono">settings.import.csvMapping</code>). Sem ele não há como
              saber qual coluna é qual — cada banco exporta o CSV que quer, e por isso o layout é
              configuração da empresa, não do produto.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60 disabled:opacity-50"
            >
              {pending && !preview ? 'Lendo o arquivo…' : 'Conferir antes de importar'}
            </button>
            {preview ? (
              <span className="text-xs text-bos-muted">
                nada foi gravado ainda — confira abaixo
              </span>
            ) : null}
          </div>
        </form>
      </Panel>

      {erro ? (
        <ErrorState title="O arquivo não pôde ser importado" detail={erro} />
      ) : null}

      {feito ? (
        <Panel className="border-bos-success/40 px-6 py-6">
          <p className="font-display text-lg text-bos-text">Extrato importado</p>
          <p className="mt-2 text-sm text-bos-muted">
            {feito.lineCount} lançamento{feito.lineCount === 1 ? '' : 's'} entraram. Vá à mesa de
            conciliação para ver as sugestões de baixa.
          </p>
        </Panel>
      ) : null}

      {preview ? (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bos-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{preview.lines.length} lançamentos</Badge>
              <Badge tone="neutral">{saidas} saídas</Badge>
              <Badge tone="neutral">{entradas} entradas</Badge>
              {preview.periodStart && preview.periodEnd ? (
                <Badge tone="neutral">
                  {shortDate(preview.periodStart)} – {shortDate(preview.periodEnd)}
                </Badge>
              ) : null}
            </div>

            <button
              type="button"
              onClick={confirmar}
              disabled={pending}
              className="rounded-md border border-bos-success/60 bg-bos-success/20 px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:bg-bos-success/30 disabled:opacity-50"
            >
              {pending ? 'Importando…' : 'Confirmar importação'}
            </button>
          </div>

          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="sticky top-0 bg-bos-surface">
                <tr className="border-b border-bos-border text-left text-xs text-bos-muted">
                  <th scope="col" className="px-5 py-3 font-medium">#</th>
                  <th scope="col" className="px-5 py-3 font-medium">Data</th>
                  <th scope="col" className="px-5 py-3 font-medium">Histórico</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bos-border">
                {preview.lines.map((l) => (
                  <tr key={`${l.lineNo}-${l.externalId ?? ''}`}>
                    <td className="tabular px-5 py-3 text-bos-muted">{l.lineNo}</td>
                    <td className="tabular px-5 py-3 text-bos-muted">{shortDate(l.postedAt)}</td>
                    <td className="px-5 py-3">
                      <p className="text-bos-text">{l.description || '—'}</p>
                      {l.counterpartyName ? (
                        <p className="mt-0.5 text-xs text-bos-muted">{l.counterpartyName}</p>
                      ) : null}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-bos-text">
                      {money(l.amountCents, preview.currency ?? 'BRL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-bos-border px-5 py-3 font-mono text-[11px] text-bos-muted">
            impressão digital do arquivo: {preview.contentHash.slice(0, 32)}…
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
