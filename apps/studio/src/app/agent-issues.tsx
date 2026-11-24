const categories = {
  material: '组件物料',
  function: '函数',
  interaction: '事件与命令',
  host: 'Host 与运行环境',
  conflict: '需求冲突',
};
const statuses = {
  capability_gap: '能力不足',
  contract_unclear: '契约待补充',
  evidence_missing: '待验证',
  decision_required: '待你决定',
};
export type IssueReport = {
  issues: {
    category: keyof typeof categories;
    status: keyof typeof statuses;
    title: string;
    finding: string;
    action: string;
    requirement_ids?: string[];
    claims?: string[];
    question?: string;
  }[];
  verification: {
    compilation: 'unverified' | 'failed' | 'passed';
    checkCode?: string;
    candidateDigest?: string;
  };
};

export function AgentIssues({ issues, verification }: IssueReport) {
  return (
    <div aria-label="需求缺口">
      {Object.entries(categories).map(([category, label]) => {
        const rows = issues.filter((item) => item.category === category);
        return (
          rows.length > 0 && (
            <section key={category}>
              <h4>
                {label}（{rows.length}）
              </h4>
              {rows.map((item, index) => (
                <div key={index}>
                  <details>
                    <summary>
                      {item.title} · {statuses[item.status]}
                    </summary>
                    <p>{item.finding}</p>
                    {item.requirement_ids?.length ? (
                      <small>关联需求 {item.requirement_ids.join('、')}</small>
                    ) : null}
                    {item.claims?.length ? (
                      <ul>
                        {item.claims.map((claim) => (
                          <li key={claim}>{claim}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.question && <strong>{item.question}</strong>}
                  </details>
                  <p>下一步：{item.action}</p>
                </div>
              ))}
            </section>
          )
        );
      })}
      <details>
        <summary>
          编译记录 ·{' '}
          {{ unverified: '未验证', failed: '未通过', passed: '已通过' }[verification.compilation]}
        </summary>
        {verification.checkCode === 'ready_configuration_mapping_required' && (
          <p>请先补齐需求到配置的映射，再提交编译。</p>
        )}
        {verification.checkCode && <code>{verification.checkCode}</code>}
        {verification.candidateDigest && (
          <p>
            已检查配置摘要 <code>{verification.candidateDigest}</code>
          </p>
        )}
      </details>
    </div>
  );
}
