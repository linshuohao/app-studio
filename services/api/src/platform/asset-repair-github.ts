type GitHubStatus = 'open' | 'draft' | 'closed' | 'merged' | 'unavailable';
type GitHubPullRequest = { state?: string; isDraft?: boolean };

export function githubPullRequestNumber(url: string, repository: string | null) {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9][0-9]{0,9})$/.exec(url);
  if (repository && match?.[1]?.toLowerCase() === repository.toLowerCase()) {
    const number = Number(match[2]);
    if (number <= 2_147_483_647) return number;
  }
  return undefined;
}

function status(pr: GitHubPullRequest | null | undefined): GitHubStatus {
  switch (pr?.state) {
    case 'OPEN':
      return pr.isDraft ? 'draft' : 'open';
    case 'CLOSED':
      return 'closed';
    case 'MERGED':
      return 'merged';
    default:
      return 'unavailable';
  }
}

export async function withGitHubPullRequestStatus<
  T extends { pullRequest: { url: string } | null },
>(rows: T[], repository: string | null) {
  if (!repository) return rows;
  const numbers = rows.map((row) =>
    githubPullRequestNumber(row.pullRequest?.url ?? '', repository),
  );
  const unique = [...new Set(numbers.filter((number) => number !== undefined))];
  if (!unique.length) return rows;

  const token = process.env.PLATFORM_ASSET_REPAIR_GITHUB_TOKEN?.trim();
  let records: Record<string, GitHubPullRequest | null> | null | undefined;
  if (token) {
    const [owner, name] = repository.split('/');
    const fields = unique.map(
      (number) => 'pr' + number + ': pullRequest(number: ' + number + ') { state isDraft }',
    );
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ' +
            fields.join(' ') +
            ' } }',
          variables: { owner, name },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(2500),
      });
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { repository?: Record<string, GitHubPullRequest | null> | null };
        };
        records = body.data?.repository;
      }
    } catch {
      // Source availability is represented on the linked PR, independent of the task status.
    }
  }
  return rows.map((row, index) => {
    const number = numbers[index];
    return number === undefined ? row : { ...row, githubStatus: status(records?.['pr' + number]) };
  });
}
