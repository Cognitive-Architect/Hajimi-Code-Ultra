import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hajimi Code Ultra',
  description: 'Desktop IDE with Seven-Power Governance',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-slate-900 text-white">
        {children}
      </body>
    </html>
  );
}
