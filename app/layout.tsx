import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SessionWrapper from "@/components/SessionWrapper";

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
    <html lang="en">
      <body className="min-h-screen bg-[#0f0f0f] text-[#e8e8e8]">
        <SessionWrapper>
          <Nav />
          <main className="max-w-4xl mx-auto px-4 py-10">{children}</main>
        </SessionWrapper>
      </body>
    </html>
  );
}
