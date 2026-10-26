import Link from 'next/link';
import { Container, PageHeader } from '@/components/ui/layout';
import type { LegalReadiness, LegalSection } from '@/lib/legal';

/**
 * Rendered for every visitor while the release gate is closed. It is not a
 * placeholder that could be mistaken for a finished legal notice — it states
 * exactly why the page is not available yet.
 */
function PendingNotice({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-6">
      <h2 className="text-lg font-semibold text-amber-200">
        Freigabe ausstehend – dieser Text ist nicht veröffentlicht
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
        Die Angaben für diese Seite liegen noch nicht vollständig vor. Es werden
        bewusst keine Platzhalter, Beispielanschriften oder erfundenen
        Vertragsbeziehungen angezeigt, weil solche Angaben wie ein fertiges
        Impressum oder eine fertige Datenschutzerklärung wirken könnten.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
        Diese Seite ist deshalb für alle Besucher gesperrt, nicht nur für
        Suchmaschinen. Sobald die Angaben vorliegen und der Text rechtlich geprüft
        wurde, wird sie freigegeben.
      </p>
      {missing.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300/80">
            Fehlende Pflichtangaben ({missing.length})
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
      <p className="mt-5 text-xs leading-relaxed text-amber-200/60">
        Die technische Umsetzung dieser Seite ist keine juristische Prüfung und
        keine Rechtsberatung.
      </p>
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
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="whitespace-pre-line text-sm leading-7 text-zinc-300"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function LegalDocument({
  title,
  description,
  readiness,
  sections,
}: {
  title: string;
  description: string;
  readiness: LegalReadiness;
  sections: LegalSection[];
}) {
  return (
    <div className="bg-[#07070a] pb-24">
      <PageHeader eyebrow="Rechtliches" title={title} description={description} />
      <Container className="mt-10">
        <div className="max-w-3xl">
          {readiness.publishable ? (
            <Sections sections={sections} />
          ) : (
            <PendingNotice missing={readiness.missing} />
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
                  Nutzungsregeln
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </Container>
    </div>
  );
}
