import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: `${SITE_NAME} — Open-Source-Webradio mit Plugins und Themes`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "WebRadio",
    "Open Source",
    "Internetradio",
    "Audio-Streaming",
    "Plugins",
    "Themes",
    "Entwickler",
  ],
  category: "technology",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Open-Source-Webradio`,
    description: SITE_DESCRIPTION,
    ...(absoluteUrl("/") ? { url: absoluteUrl("/") } : {}),
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Open-Source-Webradio`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  ...(absoluteUrl("/") ? { alternates: { canonical: absoluteUrl("/") } } : {}),
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#07070a] text-zinc-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Zum Inhalt springen
        </a>
        {children}
      </body>
    </html>
  );
}
