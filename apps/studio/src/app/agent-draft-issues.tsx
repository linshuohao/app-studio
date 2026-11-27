import { Button, DataTable, type Column } from '@form-engine/studio-design-components';
import type { DraftIssue } from './agent-conversation';
import { AgentReply } from './agent-reply';

const modules = [
  { key: 'view', label: '视图', roots: ['views', 'viewTemplates'], prefix: '页面' },
  {
    key: 'validation',
    label: '校验',
    roots: ['constraints', 'validationMessages'],
    prefix: '额外校验',
  },
  { key: 'reaction', label: '联动', roots: ['reactions'], prefix: '联动' },
];

type IssueRow = DraftIssue & { key: string };

function moduleFor(issue: DraftIssue) {
  const root = issue.sourcePointer.split('/')[1];
  return modules.find((module) => module.roots.includes(root));
}

function issueMessage(issue: DraftIssue) {
  const section = moduleFor(issue);
  const prefix = section && `${section.prefix}未完整纳入草稿。`;
  return prefix && issue.message.startsWith(prefix) && issue.message.length > prefix.length
    ? issue.message.slice(prefix.length)
    : issue.message;
}

function draftIssueSummary(text: string, issues: DraftIssue[]) {
  // Staged Compose stores the same module findings in both the summary and the draft issues.
  const combined = issues
    .map((issue) => `${moduleFor(issue)?.key}：${issueMessage(issue)}`)
    .join('；');
  return text === combined ? '' : text;
}

function issueRows(issue: DraftIssue): DraftIssue[] {
  const message = issueMessage(issue);
  const requirementIds = [...new Set(issue.requirementIds)];
  if (requirementIds.length < 2) return [{ ...issue, message, requirementIds }];

  // Historical results may combine several requirement findings in one module entry.
  const parts = message.split(/(?<=[。；;!?！？.]|\n)\s*(?=R[1-9]\d*\b)/u);
  const ids = parts.map((part) => /^R[1-9]\d*\b/u.exec(part.trim())?.[0]);
  if (parts.length === requirementIds.length && requirementIds.every((id) => ids.includes(id))) {
    return parts.map((part, index) => ({
      ...issue,
      message: part.trim(),
      requirementIds: [ids[index]!],
    }));
  }
  const sharedMessage =
    message.replace(/^(?:R[1-9]\d*\s*[、,，]\s*)+R[1-9]\d*\b\s*[：:]?\s*/u, '') || message;
  return requirementIds.map((id) => ({
    ...issue,
    message: sharedMessage,
    requirementIds: [id],
  }));
}

export function AgentDraftIssues({
  summary = '',
  issues,
  onLocate,
}: {
  summary?: string;
  issues: DraftIssue[];
  onLocate?: (pointer: string) => void;
}) {
  const introduction = draftIssueSummary(summary, issues);
  const columns: Column<IssueRow>[] = [
    { key: 'requirement', title: '需求', render: (row) => row.requirementIds.join('、') || '—' },
    { key: 'message', title: '问题', render: (row) => row.message },
  ];
  if (onLocate) {
    columns.push({
      key: 'locate',
      title: '操作',
      render: (row) => (
        <Button
          variant="text"
          aria-label={`定位问题 ${row.requirementIds.join('、') || row.message}`}
          onClick={() => onLocate(row.sourcePointer)}
        >
          定位
        </Button>
      ),
    });
  }
  const issuesByModule = new Map<string, IssueRow[]>();
  issues.forEach((issue, index) => {
    const group = moduleFor(issue)?.key ?? 'other';
    const rows = issueRows(issue).map((row, part) => ({ ...row, key: `${index}-${part}` }));
    issuesByModule.set(group, [...(issuesByModule.get(group) ?? []), ...rows]);
  });

  return (
    <div className="agent-draft-issues" aria-label="草稿待处理项">
      {introduction && <AgentReply text={introduction} />}
      {[...modules, { key: 'other', label: '其他' }].map(({ key, label }) => {
        const rows = issuesByModule.get(key);
        return (
          rows && (
            <section key={key}>
              <h4>{label}</h4>
              <DataTable
                label={`${label}问题`}
                rows={rows}
                columns={columns}
                rowKey={(row) => row.key}
              />
            </section>
          )
        );
      })}
    </div>
  );
}
