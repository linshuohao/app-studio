import { platform } from './platform-api';
import type { IssueReport } from './agent-issues';

export type PanelPosition = { x: number; y: number; width?: number; height?: number };
export type ConversationLink = { id: string; position?: PanelPosition };
export type AssistantTurn = {
  turnId: string;
  message: string;
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
  status: 'running' | 'interrupted' | 'done';
  resumable: boolean;
  events: (
    | { type: 'progress'; message: string }
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
