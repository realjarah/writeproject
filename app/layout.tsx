import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SessionWrapper from "@/components/SessionWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "WriteClone – Your AI Ghostwriter",
  description: "Write in your voice, on demand.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Anti-flash: apply stored theme before first paint */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme');
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (t === 'dark' || (!t && prefersDark) || t === null) {
                  document.documentElement.classList.add('dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#f5f5f5] dark:bg-[#080808] text-[#0d0d0d] dark:text-[#efefef]">
        <ThemeProvider>
          <SessionWrapper>
            <Nav />
            <main className="max-w-4xl mx-auto px-4 py-10">{children}</main>
          </SessionWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
