import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <div className="border-b border-rose-950/60 bg-rose-950/20 px-4 py-2 text-center text-xs text-rose-300 font-medium">
        Administrationsbereich — Nur für autorisierte Systemverwalter
      </div>
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
