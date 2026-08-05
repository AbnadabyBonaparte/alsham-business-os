import type { ReactNode } from 'react';

/**
 * ⭐ **Um renderizador de markdown MÍNIMO e SEGURO — sem dependência nova.**
 *
 * O corpo das páginas reservadas (`core.secret_pages`) é markdown. Este
 * renderizador cobre o subconjunto que um documento de proposta usa —
 * títulos (`#`/`##`/`###`), listas (`-`/`*`), negrito (`**`) e parágrafos — e
 * NADA além disso. Não há `dangerouslySetInnerHTML`: cada trecho vira filho de
 * React (escapado pelo próprio React), então corpo nenhum injeta HTML.
 *
 * ⛔ Zero dependência (o canon exige aprovação do dono para lib nova). Zero HEX:
 * só tokens `--bos-*`.
 */
export function MarkdownLite({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul'; items: string[] };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'ul', items: list });
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph();
      flushList();
      const level = h[1]!.length;
      blocks.push({ kind: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', text: h[2]! });
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushParagraph();
      list.push(li[1]!);
      continue;
    }
    // Linha comum: acumula no parágrafo (fecha lista pendente).
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Negrito `**...**` → <strong>, com o resto como texto escapado. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <strong key={key++} className="font-semibold text-bos-text">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Block({ b }: { b: Block }) {
  if (b.kind === 'h1')
    return <h1 className="font-display text-2xl text-bos-text">{renderInline(b.text)}</h1>;
  if (b.kind === 'h2')
    return <h2 className="font-display text-xl text-bos-text">{renderInline(b.text)}</h2>;
  if (b.kind === 'h3')
    return <h3 className="font-display text-lg text-bos-text">{renderInline(b.text)}</h3>;
  if (b.kind === 'ul')
    return (
      <ul className="space-y-1.5">
        {b.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-bos-muted">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bos-accent/60" />
            <span>{renderInline(it)}</span>
          </li>
        ))}
      </ul>
    );
  return <p className="text-sm leading-relaxed text-bos-muted">{renderInline(b.text)}</p>;
}
