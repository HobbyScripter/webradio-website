import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { reportTargetTypeSchema } from '@/lib/validations';
import { resolveReportTarget } from '@/lib/report-service';
import ReportForm from '@/components/public/ReportForm';
import { Container, PageHeader } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Inhalt melden',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const [{ type: rawType, id }, session] = await Promise.all([
    searchParams,
    getServerAuthSession(),
  ]);

  const callback = `/report?type=${encodeURIComponent(rawType ?? '')}&id=${encodeURIComponent(id ?? '')}`;
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const parsedType = reportTargetTypeSchema.safeParse(rawType ?? '');
  const targetId = (id ?? '').trim();

  // Public-only: the page must not reveal drafts or removed entries by id.
  const target =
    parsedType.success && targetId !== ''
      ? await resolveReportTarget(parsedType.data, targetId, { publicOnly: true })
      : null;

  return (
    <div className="bg-[#07070a] pb-24">
      <PageHeader
        eyebrow="Katalog"
        title="Inhalt melden"
        description="Melde einen Katalogeintrag, der gegen die Nutzungsregeln verstößt. Die Meldung wird geprüft; sie ändert selbst nichts."
      />
      <Container className="mt-10">
        <div className="max-w-2xl rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
          {!parsedType.success || !target ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-zinc-300">
                Das angegebene Ziel wurde nicht gefunden oder ist nicht mehr verfügbar.
              </p>
              <Link
                href="/plugins"
                className="inline-flex text-sm font-semibold text-violet-300 hover:text-violet-200"
              >
                Zum Katalog
              </Link>
            </div>
          ) : (
            <ReportForm
              targetType={parsedType.data}
              targetId={targetId}
              targetLabel={target.label}
            />
          )}
        </div>
      </Container>
    </div>
  );
}
