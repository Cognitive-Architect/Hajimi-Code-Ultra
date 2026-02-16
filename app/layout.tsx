import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hajimi Code Ultra - Ouroboros",
  description: "七权治理系统 - 本地考古抢救版",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
