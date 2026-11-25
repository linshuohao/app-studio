import { platform, type ComposePhase } from './platform-api';
import { studioUrl } from './studio-location';
import type { IssueReport } from './agent-issues';

export type PanelPosition = { x: number; y: number; width?: number; height?: number };
export type ConversationLink = { id: string; position?: PanelPosition };
export type FormReference = {
  formId: string;
  versionId: string;
  name: string;
  versionName?: string | null;
  savedAt: string;
  pointer?: string;
  objectLabel?: string;
};

export type AssetReference = {
  kind: 'function' | 'material';
  assetId: string;
  assetVersion: string;
  artifactDigest: string;
  name: string;
};

export type MessageReference = FormReference | AssetReference;
export const maxReferences = 5;

export function assetReference(
  kind: AssetReference['kind'],
  row: {
    id: string;
    version: string;
    artifact: { digest: string };
    title?: string;
  },
): AssetReference {
  return {
    kind,
    assetId: row.id,
    assetVersion: row.version,
    artifactDigest: row.artifact.digest,
    name: row.title || row.id,
  };
}

export function referenceRequest(reference: MessageReference) {
  if ('kind' in reference) {
    const { kind, assetId, assetVersion, artifactDigest } = reference;
    return { kind, assetId, assetVersion, artifactDigest };
  }
  const { formId, versionId, pointer } = reference;
  return { formId, versionId, ...(pointer !== undefined && { pointer }) };
}

export function referenceId(reference: MessageReference) {
  return JSON.stringify(referenceRequest(reference));
}

export function addReference(current: MessageReference[], reference: MessageReference) {
  if (
    current.length >= maxReferences ||
    current.some((item) => referenceId(item) === referenceId(reference))
  )
    return current;
  return [...current, reference];
}

export function referenceUrl(reference: MessageReference) {
  if ('kind' in reference)
    return studioUrl({
      catalog: reference.kind === 'function' ? 'functions' : 'materials',
      asset: reference.assetId,
      assetVersion: reference.assetVersion,
      assetDigest: reference.artifactDigest,
    });
  return studioUrl({
    form: reference.formId,
    snapshot: reference.versionId,
    object: reference.pointer,
  });
}

export function referenceLabel(reference: MessageReference) {
  if ('kind' in reference)
    return [
      reference.kind === 'function' ? '纯函数' : '物料',
      reference.name,
      'v' + reference.assetVersion,
    ].join(' · ');
  return [
    reference.name,
    reference.objectLabel,
    reference.versionName ||
      (reference.savedAt && new Date(reference.savedAt).toLocaleString('zh-CN')),
    reference.versionId.slice(0, 8),
  ]
    .filter(Boolean)
    .join(' · ');
}

export type AssistantTurn = {
  turnId: string;
  message: string;
  references?: MessageReference[];
  result: {
    kind: string;
    message?: string;
    summary?: string;
    reason?: string;
    questions?: string[];
    issues?: IssueReport['issues'];
    verification?: IssueReport['verification'];
  };
  draftId?: string;
  formId?: string;
};
export type TurnAttempt = {
  turnId: string;
  message: string;
  references?: MessageReference[];
  status: 'running' | 'interrupted' | 'done';
  resumable: boolean;
  interruptionReason?: string;
  events: (
    | { type: 'progress'; message: string }
    | ({ type: 'compose_phase' } & ComposePhase)
    | { type: 'understanding_item'; kind: 'requirement' | 'question'; text: string }
    | { type: 'understanding_reset' }
    | { type: 'text_reset' }
    | { type: 'text_delta'; delta: string }
  )[];
};
export type AssistantConversation = {
  attempts?: TurnAttempt[];
  pendingInput?: string;
  formId?: string;
  workId?: string;
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  turns: AssistantTurn[];
};
export type FormDraft = {
  id: string;
  name: string;
  versionName: string;
  text: string;
  appliedDigest: string;
  candidateText: string;
  candidateBaseText: string | null;
  candidateDigest: string;
  revision: number;
  previewDigest: string | null;
  formId: string | null;
  versionId: string | null;
  updatedAt: string;
};
export type EditorProposal = {
  id: string;
  formId: string;
  turnId: string;
  candidateText: string;
  digest: string;
  candidateBaseText?: string;
  sourceRevision: number;
};
export type TurnResponse = {
  conversation: AssistantConversation;
  draft?: FormDraft;
  editorProposal?: EditorProposal;
};

export function assistantText(result: AssistantTurn['result']) {
  return [result.summary ?? result.message ?? result.reason, ...(result.questions ?? [])]
    .filter(Boolean)
    .join('\n\n');
}

export function conversationKey(user: string, space: string, form: string, work: string) {
  return 'studio-assistant-link:' + JSON.stringify([user, space, form, work]);
}
export function readConversation(key: string): ConversationLink | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && typeof value.id === 'string') return value;
  } catch {
    // A conversation can be opened without a local panel preference.
  }
}
export function keepConversation(key: string, link: ConversationLink | undefined) {
  try {
    if (link) sessionStorage.setItem(key, JSON.stringify(link));
    else sessionStorage.removeItem(key);
  } catch {
    // Server-owned messages remain available from the conversation list.
  }
}

export function renameConversation(id: string, title: string) {
  return platform<{ id: string; title: string }>('/agent-conversations/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: { title: title.trim() },
  });
}

export type ConversationSummary = { id: string; title: string; updatedAt: string };
