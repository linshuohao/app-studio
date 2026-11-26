'use client';

import { useEffect, useState } from 'react';
import { Button, Feedback } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import type { LockedCapability } from '@form-engine/protocol/prepared';
import { RecordIdentity } from '../components/record-identity';
import { studioUrl } from './studio-location';
import { Modal } from './modal';
import { failureMessage, platform } from './platform-api';
import type { InspectionInput } from './config-inspection';

export type AssetChoice = {
  profile: string;
  kind: 'materials' | 'pureFunctions';
  id: string;
  version: string;
  artifactDigest: string;
};

type Dependency = {
  kind: AssetChoice['kind'];
  id: string;
  lock: LockedCapability | null;
  available: boolean;
  slots?: readonly string[];
  locations: string[];
  candidates: { lock: LockedCapability; recommended: boolean; contractChanged?: boolean }[];
};
type Profile = { profile: string; dependencies: Dependency[] };
const identity = (lock: LockedCapability) => JSON.stringify([lock.version, lock.artifact.digest]);

export function useAssetBindingProfiles(path?: string, input?: InspectionInput) {
  const inputJson = input ? JSON.stringify(input) : undefined;
  const [state, setState] = useState<{
    path: string;
    input: string;
    profiles?: Profile[];
    error?: string;
  }>();
  useEffect(() => {
    if (!path || !inputJson) return;
    const abort = new AbortController();
    void platform<Profile[]>(path + '/asset-bindings', {
      body: JSON.parse(inputJson),
      signal: abort.signal,
    }).then(
      (profiles) => {
        if (!abort.signal.aborted) setState({ path, input: inputJson, profiles });
      },
      (reason: unknown) => {
        if (!abort.signal.aborted)
          setState({ path, input: inputJson, error: failureMessage(reason) });
      },
    );
    return () => abort.abort();
  }, [inputJson, path]);
  return state?.path === path && state?.input === inputJson ? state : undefined;
}

export function catalogAssetPath(
  kind: 'materials' | 'functions',
  id: string,
  version?: string,
  digest?: string,
) {
  return (
    `/catalog/${kind}/${encodeURIComponent(id)}?` +
    new URLSearchParams({
      ...(version && { version }),
      ...(digest && { artifactDigest: digest }),
    })
  );
}

export function AssetBindingEditor({
  path,
  input,
  editable,
  onSelect,
  onClose,
  onLocate,
}: {
  path: string;
  input: InspectionInput;
  editable: boolean;
  onSelect: (choice: AssetChoice) => void;
  onClose: () => void;
  onLocate: (pointer: string) => void;
}) {
  const result = useAssetBindingProfiles(path, input);

  return (
    <Modal title="Web 资产版本" onClose={onClose}>
      {result?.error && <Feedback kind="error">{result.error}</Feedback>}
      {!result && <p role="status">正在读取资产依赖…</p>}
      {result?.profiles?.every(({ dependencies }) => !dependencies.length) && (
        <p>当前配置没有可解析的 Web 资产依赖。</p>
      )}
      {result?.profiles?.map(({ profile, dependencies }) => (
        <fieldset key={profile}>
          <legend>{profile}</legend>
          {dependencies.map(({ kind, id, lock, available, candidates, locations }) => (
            <div key={kind + '/' + id}>
              <strong>{id}</strong>
              <p>{lock ? `${lock.version}${available ? '' : ' · 制品不可用'}` : '待绑定'}</p>
              {lock && <RecordIdentity id={lock.artifact.digest} label="查看完整制品摘要" />}
              {candidates.some(({ contractChanged }) => contractChanged) && (
                <details>
                  <summary>查看不同版本契约</summary>
                  {candidates.map(({ lock: candidate }) => (
                    <p key={identity(candidate)}>
                      <a
                        href={studioUrl({
                          catalog: kind === 'materials' ? 'materials' : 'functions',
                          asset: id,
                          assetVersion: candidate.version,
                          assetDigest: candidate.artifact.digest,
                        })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {candidate.version} · {candidate.artifact.digest.slice(7, 19)}
                      </a>
                    </p>
                  ))}
                </details>
              )}
              {editable && candidates.length > 0 && (
                <StudioSelect
                  aria-label={`${profile} · ${id} 版本`}
                  value={
                    lock &&
                    candidates.some((candidate) => identity(candidate.lock) === identity(lock))
                      ? identity(lock)
                      : ''
                  }
                  onValueChange={(value) => {
                    const selected = candidates.find(({ lock }) => identity(lock) === value);
                    if (selected)
                      onSelect({
                        profile,
                        kind,
                        id,
                        version: selected.lock.version,
                        artifactDigest: selected.lock.artifact.digest,
                      });
                  }}
                >
                  <option value="" disabled>
                    选择版本
                  </option>
                  {candidates.map(({ lock, recommended, contractChanged }) => (
                    <option key={identity(lock)} value={identity(lock)}>
                      {lock.version} · {lock.artifact.digest.slice(7, 19)}
                      {recommended ? ' · 推荐' : ''}
                      {contractChanged ? ' · 契约有变化' : ''}
                    </option>
                  ))}
                </StudioSelect>
              )}
              {locations.map((pointer) => (
                <Button
                  key={pointer}
                  variant="secondary"
                  onClick={() => {
                    onLocate(pointer);
                    onClose();
                  }}
                >
                  {pointer}
                </Button>
              ))}
            </div>
          ))}
        </fieldset>
      ))}
    </Modal>
  );
}
