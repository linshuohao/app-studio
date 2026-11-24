import Link from 'next/link';
import type { ReactNode } from 'react';
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Demo 导航" className="border-b px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/"
            className="rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            全部 Demo
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
