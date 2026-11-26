import { redirect } from 'next/navigation';
import { studioUrl } from '../studio-location';

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const { event } = await searchParams;
  redirect(
    studioUrl({ page: 'diagnostics', event: typeof event === 'string' ? event : undefined }),
  );
}
