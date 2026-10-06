import type { ReactNode } from 'react';

// A small Markdown subset for AI answers: paragraphs, headings, "-"/"*"/"1."
// lists, tables, "---" dividers, **bold**, *italic* and `code`. Rendered as
// React elements, never as HTML, so nothing in an answer can inject markup or
// scripts.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${i++}`} className="rounded bg-chip px-1 text-[0.9em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (line: string) => line.startsWith('|') && line.endsWith('|') && line.length > 1;
const isTableRule = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line);
const cells = (line: string) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`o${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`u${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A table: a "| a | b |" header row followed by a "|---|---|" rule.
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      i -= 1;
      const k = blocks.length;
      blocks.push(
        <div key={`t${k}`} className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-chip">
              <tr>
                {head.map((h, j) => (
                  <th key={j} className="px-2.5 py-1.5 font-semibold text-ink">
                    {inline(h, `t${k}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-line align-top">
                  {head.map((_, j) => (
                    <td key={j} className="px-2.5 py-1.5 text-ink-2">
                      {inline(r[j] ?? '', `t${k}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      blocks.push(<hr key={`r${blocks.length}`} className="border-line" />);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flush();
      blocks.push(<p key={`h${blocks.length}`} className="font-semibold text-ink">{inline(heading[1], `h${blocks.length}`)}</p>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-ink">{blocks}</div>;
}
