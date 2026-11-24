import type { VersionSummary } from './platform-api';
export function versionLabel(version?: Pick<VersionSummary, 'name' | 'note' | 'savedAt'> | null) {
  return (
    version?.name ||
    version?.note ||
    (version?.savedAt ? `配置 · ${new Date(version.savedAt).toLocaleString('zh-CN')}` : '当前配置')
  );
}
export function releaseLabel(release: { name?: string; publishedAt?: string | null }) {
  return (
    release.name ||
    (release.publishedAt
      ? `发布 · ${new Date(release.publishedAt).toLocaleString('zh-CN')}`
      : '本次发布')
  );
}
