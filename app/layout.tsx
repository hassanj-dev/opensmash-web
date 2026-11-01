import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { siteConfig } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // Makes every relative URL (Open Graph image, canonical ...) a full https:// URL.
  metadataBase: new URL(siteConfig.url),

  // Pages that only set `title: "Pricing"` become "Pricing | OpenSmash".
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: siteConfig.keywords,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,

  // The share image comes automatically from app/opengraph-image.tsx
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    url: "/",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Icons: app/icon.png, app/icon.svg and app/favicon.ico are picked up automatically.
  // Only the Apple icon needs a path (the file already exists in public/).
  icons: {
    apple: "/apple-icon.png",
  },

  // Google Search Console "HTML tag" verification. Put the code into the
  // NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION environment variable on Vercel.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable} data-scroll-behavior="smooth">
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}