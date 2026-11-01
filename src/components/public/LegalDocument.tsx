import Link from 'next/link';
import { Container, PageHeader } from '@/components/ui/layout';
import type { LegalDetails, LegalSection } from '@/lib/legal';
import LegalContent from '@/components/public/LegalContent';
import MarkdownText from '@/components/public/MarkdownText';

/**
 * Rendered while required operator details are still missing. It is not a
 * placeholder that could be mistaken for a finished legal notice — it states
 * exactly which facts are outstanding.
 */
function PendingNotice({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-6">
      <h2 className="text-lg font-semibold text-amber-200">Angaben noch nicht vollständig</h2>
      <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
        Für diese Seite liegen noch nicht alle Pflichtangaben vor. Es werden bewusst keine
        Platzhalter oder Beispielangaben angezeigt.
      </p>
      {missing.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300/80">
            Fehlende Angaben ({missing.length})
          </p>
          <ul className="mt-2 grid gap-1 text-sm text-amber-100/70 sm:grid-cols-2">
            {missing.map((label) => (
              <li key={label} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 h-1 w-1 rounded-full bg-amber-300/70" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SectionTable({ table }: { table: NonNullable<LegalSection['table']> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
        <thead className="bg-white/[0.03] text-zinc-400">
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2.5 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] text-zinc-300">
          {table.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th
                    key={`cell-${rowIndex}-${cellIndex}`}
                    scope="row"
                    className="px-3 py-2.5 text-left align-top font-medium text-zinc-200"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className="px-3 py-2.5 align-top text-zinc-400"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sections({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section key={section.heading}>
          <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
          <div className="mt-3 space-y-3">
            {section.address ? (
              <address className="not-italic text-sm leading-7 text-zinc-300">
                {section.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : null}
            {section.paragraphs.map((paragraph) =>
              // Address-like blocks keep their line breaks; prose is rendered as
              // safe Markdown so links such as the Impressum work without HTML.
              paragraph.includes('\n') && paragraph.split('\n').length <= 3 ? (
                <p key={paragraph} className="whitespace-pre-line text-sm leading-7 text-zinc-300">
                  {paragraph}
                </p>
              ) : (
                <MarkdownText
                  key={paragraph}
                  text={paragraph}
                  className="text-sm leading-7 text-zinc-300"
                />
              ),
            )}
            {section.table ? <SectionTable table={section.table} /> : null}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function LegalDocument({
  title,
  description,
  details,
  sections,
  content,
}: {
  title: string;
  description: string;
  details: LegalDetails;
  sections: LegalSection[];
  content?: string | null;
}) {
  const hasPublishedContent = Boolean(content && content.trim().length > 0);

  return (
    <div className="bg-[#07070a] pb-24">
      <PageHeader eyebrow="Rechtliches" title={title} description={description} />
      <Container className="mt-10">
        <div className="max-w-3xl">
          {hasPublishedContent ? (
            <LegalContent content={content as string} />
          ) : details.complete ? (
            <Sections sections={sections} />
          ) : (
            <PendingNotice missing={details.missing} />
          )}

          <nav aria-label="Weitere rechtliche Informationen" className="mt-12 border-t border-white/[0.07] pt-6">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <li>
                <Link href="/impressum" className="text-zinc-400 hover:text-white">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="text-zinc-400 hover:text-white">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="/nutzungsbedingungen" className="text-zinc-400 hover:text-white">
                  Nutzungsbedingungen
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </Container>
    </div>
  );
}
