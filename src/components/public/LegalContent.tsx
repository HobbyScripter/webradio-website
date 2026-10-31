import React from 'react';

const SAFE_URL = /^https?:\/\//i;

function escapeText(text: string): string {
  return text;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenize bold and links
  const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<React.Fragment key={`${keyPrefix}-t-${i++}`}>{escapeText(text.slice(last, match.index))}</React.Fragment>);
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        const label = m[1];
        const url = m[2];
        if (SAFE_URL.test(url)) {
          nodes.push(
            <a key={`${keyPrefix}-a-${i++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline">
              {label}
            </a>,
          );
        } else {
          nodes.push(<React.Fragment key={`${keyPrefix}-x-${i++}`}>{label}</React.Fragment>);
        }
      } else {
        nodes.push(<React.Fragment key={`${keyPrefix}-r-${i++}`}>{token}</React.Fragment>);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<React.Fragment key={`${keyPrefix}-e-${i++}`}>{escapeText(text.slice(last))}</React.Fragment>);
  }
  return nodes;
}

export default function LegalContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let paraBuffer: string[] = [];

  const flushPara = () => {
    if (paraBuffer.length) {
      const text = paraBuffer.join(' ');
      blocks.push(
        <p key={`p-${i++}`} className="whitespace-pre-line text-sm leading-7 text-zinc-300">
          {renderInline(text, `p-${i}`)}
        </p>,
      );
      paraBuffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer) {
      if (listBuffer.type === 'ul') {
        blocks.push(
          <ul key={`ul-${i++}`} className="list-disc pl-6 space-y-1 text-sm text-zinc-300">
            {listBuffer.items.map((item, idx) => (
              <li key={idx}>{renderInline(item, `li-${i}-${idx}`)}</li>
            ))}
          </ul>,
        );
      } else {
        blocks.push(
          <ol key={`ol-${i++}`} className="list-decimal pl-6 space-y-1 text-sm text-zinc-300">
            {listBuffer.items.map((item, idx) => (
              <li key={idx}>{renderInline(item, `li-${i}-${idx}`)}</li>
            ))}
          </ol>,
        );
      }
      listBuffer = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPara();
      flushList();
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushPara();
      flushList();
      blocks.push(<h2 key={`h2-${i++}`} className="text-lg font-semibold text-white mt-6">{renderInline(trimmed.slice(2), `h-${i}`)}</h2>);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push(<h3 key={`h3-${i++}`} className="text-base font-semibold text-white mt-4">{renderInline(trimmed.slice(3), `h-${i}`)}</h3>);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      flushPara();
      flushList();
      blocks.push(<blockquote key={`q-${i++}`} className="border-l-2 border-zinc-700 pl-4 italic text-sm text-zinc-400">{renderInline(trimmed.slice(2), `q-${i}`)}</blockquote>);
      continue;
    }
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ulMatch) {
      flushPara();
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      flushPara();
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(olMatch[1]);
      continue;
    }
    paraBuffer.push(trimmed);
  }
  flushPara();
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}