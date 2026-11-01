import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Minimal, safe Markdown renderer.
 *
 * Catalog descriptions and release notes are written by third parties and the
 * website must never render raw HTML. This component parses a small,
 * deliberately narrow subset of Markdown into React elements:
 *
 *   - paragraphs (blank line separated),
 *   - unordered and ordered lists,
 *   - bold text, inline code,
 *   - links, restricted to http(s) and same-site paths.
 *
 * Everything else — raw HTML, images, tables, block quotes — is rendered as
 * plain text. No `dangerouslySetInnerHTML` is used anywhere.
 */

const SAFE_LINK = /^(https?:\/\/|\/)/i;

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; label: string; href: string };

function tokenizeInline(input: string): InlineToken[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  const tokens: InlineToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: 'text', value: input.slice(last, match.index) });
    }

    const token = match[0];
    if (token.startsWith('**')) {
      tokens.push({ kind: 'strong', value: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      tokens.push({ kind: 'code', value: token.slice(1, -1) });
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link && link[1] !== undefined && link[2] !== undefined && SAFE_LINK.test(link[2])) {
        tokens.push({ kind: 'link', label: link[1], href: link[2] });
      } else {
        tokens.push({ kind: 'text', value: token });
      }
    }

    last = match.index + token.length;
  }

  if (last < input.length) {
    tokens.push({ kind: 'text', value: input.slice(last) });
  }

  return tokens;
}

function renderInline(input: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(input).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.kind) {
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-zinc-100">
            {token.value}
          </strong>
        );
      case 'code':
        return (
          <code
            key={key}
            className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.9em] text-zinc-200"
          >
            {token.value}
          </code>
        );
      case 'link':
        return token.href.startsWith('/') ? (
          <Link key={key} href={token.href} className="text-violet-300 underline-offset-4 hover:underline">
            {token.label}
          </Link>
        ) : (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-violet-300 underline-offset-4 hover:underline"
          >
            {token.label}
          </a>
        );
      default:
        return <span key={key}>{token.value}</span>;
    }
  });
}

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      flushList();
      continue;
    }

    // Headings are reduced to a bold paragraph; there is no heading level
    // inside descriptive text.
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading && heading[1] !== undefined) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'paragraph', lines: [`**${heading[1]}**`] });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet && bullet[1] !== undefined) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered && numbered[1] !== undefined) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export default function MarkdownText({
  text,
  className = 'text-sm leading-relaxed text-zinc-400',
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <p key={`p-${index}`} className={className}>
            {renderInline(block.lines.join(' '), `p-${index}`)}
          </p>
        ) : block.ordered ? (
          <ol key={`ol-${index}`} className={`list-decimal space-y-1 pl-5 ${className}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`li-${index}-${itemIndex}`}>{renderInline(item, `li-${index}-${itemIndex}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={`ul-${index}`} className={`list-disc space-y-1 pl-5 ${className}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`li-${index}-${itemIndex}`}>{renderInline(item, `li-${index}-${itemIndex}`)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Flatten Markdown to plain text, for meta descriptions and previews. */
export function markdownToPlainText(text: string, maxChars = 0): string {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_>|]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (maxChars <= 0 || plain.length <= maxChars) {
    return plain;
  }

  const cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()} …`;
}
