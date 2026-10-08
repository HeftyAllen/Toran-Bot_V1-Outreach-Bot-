import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bot 1 Control Room",
  description: "A private lead research and outreach review workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
