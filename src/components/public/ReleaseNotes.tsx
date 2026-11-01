import type { ReactNode } from 'react';

function cleanInline(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Repeated boilerplate headings that GitHub bodies often start with. */
const REPEATED_HEADER = /^\s*(?:\*\*)?(release stage|version|release date|tag|channel|build)\s*(?:\*\*)?\s*[:\-–|]/i;

function isRepeatedHeader(line: string): boolean {
  return REPEATED_HEADER.test(line);
}

/**
 * Cut at a paragraph boundary. A hard character cut splits words, so the text is
 * reduced to the last complete block before the limit.
 */
export function truncateAtParagraph(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const window = text.slice(0, maxChars);
  const lastParagraph = window.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.4) {
    return window.slice(0, lastParagraph).trimEnd();
  }

  const lastSentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
  if (lastSentence > maxChars * 0.4) {
    return window.slice(0, lastSentence + 1).trimEnd();
  }

  return window.trimEnd();
}

/**
 * GitHub release bodies are Markdown written by the project maintainers. The
 * website does not render that Markdown as HTML: every line becomes a React text
 * node, links and images are reduced to their labels, and only headings and list
 * markers receive styling. Code blocks are collapsed as technical details.
 */
export default function ReleaseNotes({
  notes,
  maxChars = 12_000,
}: {
  notes: string;
  maxChars?: number;
}) {
  if (!notes.trim()) {
    return (
      <p className="text-sm text-zinc-500">Für dieses Release sind keine Release Notes hinterlegt.</p>
    );
  }

  const truncated = truncateAtParagraph(notes, maxChars);
  const lines = truncated.replace(/\r/g, '').split('\n');
  const nodes: ReactNode[] = [];
  let codeBuffer: string[] = [];
  let inCodeBlock = false;
  let skipRepeatedHeaders = true;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (/^\s*```/.test(line)) {
      if (inCodeBlock) {
        nodes.push(
          <details
            key={`code-${index}`}
            className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
          >
            <summary className="cursor-pointer text-[11px] font-semibold text-zinc-400 hover:text-zinc-200">
              Technische Details
            </summary>
            <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-5 text-zinc-300">
              {codeBuffer.join('\n')}
            </pre>
          </details>,
        );
        codeBuffer = [];
      }
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) {
      return;
    }

    // Only the first block may carry the boilerplate header rows.
    if (skipRepeatedHeaders) {
      if (isRepeatedHeader(line)) {
        return;
      }
      if (line.trim().length > 0 && !/^#{1,6}\s/.test(line)) {
        skipRepeatedHeaders = false;
      }
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = cleanInline(heading[2]!);
      if (!text) {
        return;
      }
      nodes.push(
        <p
          key={`heading-${index}`}
          className={
            level <= 2
              ? 'mt-4 text-sm font-semibold text-zinc-100 first:mt-0'
              : 'mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400 first:mt-0'
          }
        >
          {text}
        </p>,
      );
      return;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      const text = cleanInline(bullet[1]!);
      if (text) {
        nodes.push(
          <p key={`bullet-${index}`} className="flex gap-2.5 text-sm text-zinc-300">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
            <span>{text}</span>
          </p>,
        );
      }
      return;
    }

    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numbered) {
      const text = cleanInline(numbered[2]!);
      if (text) {
        nodes.push(
          <p key={`numbered-${index}`} className="flex gap-2.5 text-sm text-zinc-300">
            <span className="shrink-0 font-mono text-[11px] text-zinc-500">{numbered[1]}.</span>
            <span>{text}</span>
          </p>,
        );
      }
      return;
    }

    const text = cleanInline(line);
    if (text) {
      nodes.push(
        <p key={`text-${index}`} className="text-sm leading-relaxed text-zinc-400">
          {text}
        </p>,
      );
    }
  });

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Die Release Notes enthalten keinen darstellbaren Text. Die vollständigen Hinweise stehen auf
        der GitHub-Release-Seite.
      </p>
    );
  }

  return (
    <div className="space-y-2" aria-label="Release Notes">
      {nodes}
      {notes.length > maxChars ? (
        <p className="text-xs text-zinc-500">
          Die Anzeige ist gekürzt. Der vollständige Text steht auf der GitHub-Release-Seite.
        </p>
      ) : null}
    </div>
  );
}
