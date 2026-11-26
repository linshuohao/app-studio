import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Assemble Studio · Playground',
  description: '基于正式物料库的动态表单场景演示',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  );
}
