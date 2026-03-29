import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Record Collection",
  description: "Browse your Discogs collection and create genre playlists",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
