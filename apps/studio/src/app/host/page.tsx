import { ReleaseHost } from './release-host';

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ releaseId?: string }>;
}) {
  const { releaseId } = await searchParams;
  return <ReleaseHost initialId={typeof releaseId === 'string' ? releaseId : ''} />;
}
