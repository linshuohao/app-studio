import { cookies } from 'next/headers';
import { ReleaseHost } from './release-host';

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ releaseId?: string }>;
}) {
  const { releaseId } = await searchParams;
  const api = new URL(process.env.PLATFORM_API_URL || 'http://127.0.0.1:3001');
  const cookie = (await cookies()).toString();
  let diagnosticOwner: string | undefined;
  if (process.env.PLATFORM_DIAGNOSTICS_STUDIO_PILOT === '1' && cookie) {
    try {
      const response = await fetch(new URL('/api/platform/diagnostics/pilot', api), {
        headers: { cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const result: { owner?: unknown } = await response.json();
        if (typeof result.owner === 'string') diagnosticOwner = result.owner;
      }
    } catch {
      // Host rendering remains available without the optional pilot service.
    }
  }
  return (
    <ReleaseHost
      initialId={typeof releaseId === 'string' ? releaseId : ''}
      diagnosticOwner={diagnosticOwner}
      localDiagnosticSamples={
        process.env.NODE_ENV === 'development' && process.env.STUDIO_LOCAL_DIAGNOSTIC_HOST === '1'
      }
    />
  );
}
