import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mein Konto',
  robots: { index: false, follow: false },
};

// Redirect /account to /account (the page itself)
// This layout is needed for the (account) group structure
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
