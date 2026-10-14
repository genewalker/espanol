import type { Metadata } from "next";
import Link from "next/link";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glosäventyret",
  description: "Öva spanska tillsammans, ett ord i taget.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <>
    <a href="#main" className="sr-only focus:not-sr-only focus:inline-block focus:p-4">Hoppa till innehåll</a>
    <header className="border-b"><nav aria-label="Huvudmeny" className="mx-auto flex max-w-5xl px-5 py-3">
      <Link href="/" className="flex min-h-11 items-center font-bold text-primary">Glosäventyret <span aria-hidden="true" className="ml-2">✦</span></Link>
    </nav></header>
    {children}
  </>;
  return <html lang="sv"><body>
    {process.env.NEXT_PUBLIC_CONVEX_URL ? (
      <ConvexAuthNextjsServerProvider shouldHandleCode={false}>
        <Providers>{content}</Providers>
      </ConvexAuthNextjsServerProvider>
    ) : content}
  </body></html>;
}
