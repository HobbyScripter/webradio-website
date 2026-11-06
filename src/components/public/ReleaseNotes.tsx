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
 * Split the notes into the short summary and the technical remainder.
 *
 * The summary is everything before the first heading. Notes that start with a
 * heading keep the first section (usually "What's new") as the summary; the
 * remainder is collapsed behind "Technische Details".
 */
function splitAtFirstTechnicalSection(lines: string[]): { intro: string[]; details: string[] } {
  const headingIndices: number[] = [];
  let inCodeBlock = false;

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (!inCodeBlock && /^#{1,6}\s+/.test(line)) {
      headingIndices.push(index);
    }
  });

  const firstHeading = headingIndices[0];
  if (firstHeading === undefined) {
    return { intro: lines, details: [] };
  }

  if (lines.slice(0, firstHeading).some((line) => line.trim().length > 0)) {
    return { intro: lines.slice(0, firstHeading), details: lines.slice(firstHeading) };
  }

  const secondHeading = headingIndices[1];
  if (secondHeading === undefined) {
    return { intro: lines, details: [] };
  }

  return { intro: lines.slice(0, secondHeading), details: lines.slice(secondHeading) };
}

/**
 * GitHub release bodies are Markdown written by the project maintainers. The
 * website does not render that Markdown as HTML: every line becomes a React text
 * node, links and images are reduced to their labels, and only headings and list
 * markers receive styling. Code blocks are collapsed separately.
 */
function parseNoteLines(lines: string[], keyPrefix: string): ReactNode[] {
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
            key={`${keyPrefix}-code-${index}`}
            className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
          >
            <summary className="cursor-pointer text-[11px] font-semibold text-zinc-400 hover:text-zinc-200">
              Codeausschnitt
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
          key={`${keyPrefix}-heading-${index}`}
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
          <p key={`${keyPrefix}-bullet-${index}`} className="flex gap-2.5 text-sm text-zinc-300">
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
          <p key={`${keyPrefix}-numbered-${index}`} className="flex gap-2.5 text-sm text-zinc-300">
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
        <p key={`${keyPrefix}-text-${index}`} className="text-sm leading-relaxed text-zinc-400">
          {text}
        </p>,
      );
    }
  });

  if (inCodeBlock && codeBuffer.length > 0) {
    nodes.push(
      <pre
        key={`${keyPrefix}-code-open`}
        className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[11px] leading-5 text-zinc-300"
      >
        {codeBuffer.join('\n')}
      </pre>,
    );
  }

  return nodes;
}

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
  const { intro, details } = splitAtFirstTechnicalSection(lines);
  const introNodes = parseNoteLines(intro, 'intro');
  const detailNodes = parseNoteLines(details, 'details');

  if (introNodes.length === 0 && detailNodes.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Die Release Notes enthalten keinen darstellbaren Text. Die vollständigen Hinweise stehen auf
        der GitHub-Release-Seite.
      </p>
    );
  }

  return (
    <div className="space-y-2" aria-label="Release Notes">
      {introNodes.length > 0 ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">
          Was ist neu?
        </p>
      ) : null}
      {introNodes}

      {detailNodes.length > 0 ? (
        <details className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-300 hover:text-white">
            Technische Details
          </summary>
          <div className="mt-2 space-y-2">{detailNodes}</div>
        </details>
      ) : null}

      {notes.length > maxChars ? (
        <p className="text-xs text-zinc-500">
          Die Anzeige ist gekürzt. Der vollständige Text steht auf der GitHub-Release-Seite.
        </p>
      ) : null}
    </div>
  );
}
