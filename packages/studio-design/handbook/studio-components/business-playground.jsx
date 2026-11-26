import { PageHeading } from '../../../../apps/studio/src/app/page-heading';
import { Modal } from '../../../../apps/studio/src/app/modal';
import { JsonSource } from '../../../../apps/studio/src/app/json-source';
import {
  SchemaNavigation,
  usePendingNavigation,
  useSchemaNavigation,
} from '../../../../apps/studio/src/app/schema-navigation';
import { MaterialDetailPreview } from '../../../../apps/studio/src/app/material-detail-preview';
import { ExpressionVerificationPanel } from '../../../../apps/studio/src/app/expression-verification-panel';
import { CopyForm, FormManagement } from '../../../../apps/studio/src/app/form-management';
import { OperationRecords } from '../../../../apps/studio/src/app/operation-records';
import { AccountSecurity } from '../../../../apps/studio/src/app/account-security';
import {
  Requirements,
  ReleaseHostExample,
  ReleaseIntegration,
} from '../../../../apps/studio/src/app/host/requirements';
import {
  AgentMessage,
  AgentReply,
  AgentCandidateCard,
} from '../../../../apps/studio/src/app/agent-reply';
import { ConfigDiff, DiffResult } from '../../../../apps/studio/src/app/config-diff';
import {
  FunctionHelp,
  ArgumentHelp,
} from '../../../../apps/studio/src/app/expression-function-help';
import { ExpressionDisplay } from '../../../../apps/studio/src/app/expression-display';
import { ReactionFieldPicker } from '../../../../apps/studio/src/app/reaction-fields-ui';
import { ScopeEditor } from '../../../../apps/studio/src/app/scope-editor';
import {
  FieldPickerDialog,
  FieldPickerControl,
} from '../../../../apps/studio/src/app/field-picker';
import { FieldTree } from '../../../../apps/studio/src/components/field-tree';
import {
  ContractPanel,
  ContractTable,
} from '../../../../apps/studio/src/components/catalog/contract-reference';
import { MaterialDescription } from '../../../../apps/studio/src/app/material-description';
import { RegexInput } from '../../../../apps/studio/src/app/regex-input';
import { LayoutFieldPicker } from '../../../../apps/studio/src/app/layout-field-picker';
import { LayoutExpressionDialog } from '../../../../apps/studio/src/app/layout-expression';
import { ManifestInput } from '../../../../apps/studio/src/app/manifest-input';
import { ValueInput } from '../../../../apps/studio/src/app/layout-material-value';
import { ConfigInspection } from '../../../../apps/studio/src/app/config-inspection';
import { AgentMerge } from '../../../../apps/studio/src/app/agent-merge';
import { AgentIssues } from '../../../../apps/studio/src/app/agent-issues';
import { cardListStory } from './card-list-example';
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Playground } from './props-panel';
import { pickerStory } from './field-picker-demo';
import { ExpressionEditor } from '../../../../apps/studio/src/app/expression-editor';
import { reactionFields } from '../../../../apps/studio/src/app/reaction-fields';
import { ActionEditor } from '../../../../apps/studio/src/app/reaction-action-editor';
import {
  JsonEditor,
  JsonEditorView,
  useJsonHistory,
} from '../../../../apps/studio/src/components/json/json-editor';
import { CodeBlock } from '../../../../apps/studio/src/components/code-block';
import { RecordIdentity } from '../../../../apps/studio/src/components/record-identity';
import { AgentPanel, AgentUserMessage } from '../../../../apps/studio/src/app/agent-panel';
import { referenceId } from '../../../../apps/studio/src/app/agent-conversation';
import { PreviewRuntime } from '../../../../apps/studio/src/app/preview-runtime';
import {
  webPreviewCapabilities,
  createWebCapabilities,
} from '../../../../apps/studio/src/app/web-capabilities';
import { compile } from '@form-engine/compiler';
import { artifact, definitions } from '../../../../apps/playground/src/demos/catalog';
import '../../../../apps/studio/src/components/field-picker/field-picker.css';
import './playground.css';
import { travelDefinition } from '../../../../apps/playground/src/demos/travel/definition';
import functionDocumentation from '../../../pure-functions/catalog-docs.json';

const guardian = travelDefinition.constraints.find((rule) => rule.id === 'guardian-required');
const estimate = travelDefinition.reactions.find((rule) => rule.id === 'estimate-total');
const manifests = Object.values(webPreviewCapabilities.functions).map((f) => f.manifest);
const functionDocs = new Map(Object.entries(functionDocumentation));
function TravelExpression({ initial, scopes, expected, ...props }) {
  const [raw, setRaw] = useState(() => JSON.stringify(initial));
  return (
    <section className="studio-form-layout">
      <ExpressionEditor
        {...props}
        raw={raw}
        onChange={setRaw}
        expected={expected}
        fields={reactionFields(travelDefinition.data.schema, scopes)}
        manifests={manifests}
        named={travelDefinition.expressions}
        functionDocs={functionDocs}
        allowValidation={false}
      />
      <details>
        <summary>查看表达式 JSON</summary>
        <pre>{raw}</pre>
      </details>
    </section>
  );
}
function Expression(args) {
  return (
    <TravelExpression
      {...args}
      initial={guardian.when}
      scopes={[guardian.scope]}
      expected={{ type: 'boolean' }}
    />
  );
}
function PremiumValue(args) {
  return (
    <TravelExpression
      {...args}
      initial={estimate.then[0].value.$expr}
      expected={{ type: 'number' }}
    />
  );
}
function Action({ initialKind }) {
  const [raw, setRaw] = useState();
  const [version, reset] = useState(0);
  const [, setPending] = useState(false);
  return (
    <div style={{ maxWidth: '32rem' }}>
      <ActionEditor
        key={initialKind + version}
        initial={raw}
        kind={initialKind}
        fields={reactionFields(travelDefinition.data.schema, [guardian.scope])}
        manifests={manifests}
        named={travelDefinition.expressions}
        functionDocs={functionDocs}
        scope={guardian.scope}
        onPending={setPending}
        discard={() => reset((n) => n + 1)}
        onApply={async (next) => {
          setRaw(next);
          reset((n) => n + 1);
        }}
      />
      <details>
        <summary>查看已应用的动作 JSON</summary>
        <pre>{raw ?? '暂无已应用动作'}</pre>
      </details>
    </div>
  );
}
function Json({ readOnly, label, size }) {
  const [text, setText] = useState(() =>
    JSON.stringify(
      {
        name: '旅险投保',
        trip: { destination: '日本', dates: { departure: '2027-04-03', return: '2027-04-10' } },
        travelers: [
          {
            name: '林安',
            age: 36,
            primary: true,
            emergencyContact: { name: '陈宁', relationship: '家人' },
          },
          { name: '林悦', age: 9, primary: false, emergencyContact: null },
        ],
        coverage: {
          currency: 'CNY',
          benefits: [
            { name: '境外医疗', limit: 300000, exclusions: ['既往症'] },
            { name: '行李延误', limit: 1500, exclusions: [] },
          ],
        },
      },
      null,
      2,
    ),
  );
  return (
    <JsonEditor size={size} text={text} onChange={setText} readOnly={readOnly} label={label} />
  );
}
function Agent(args) {
  const [message, M] = useState(''),
    [messages, S] = useState([]);
  const [references, setReferences] = useState([
    {
      formId: 'example',
      versionId: 'example-version',
      name: '示例报名表',
      versionName: '初版',
      savedAt: '2026-11-25',
    },
    {
      kind: 'material',
      assetId: 'text-input',
      assetVersion: '0.1.0',
      artifactDigest: 'example',
      name: '文本输入',
    },
  ]);
  const reply = '已收到你的表单需求。';
  return (
    <AgentPanel
      {...args}
      floating={false}
      open
      onCollapse={() => {}}
      label="表单需求"
      references={references}
      onRemoveReference={(id) =>
        setReferences((items) => items.filter((item) => referenceId(item) !== id))
      }
      message={message}
      onMessage={M}
      onSend={() => {
        S([...messages, message]);
        M('');
      }}
    >
      {messages.map((m, i) => (
        <React.Fragment key={i}>
          <AgentUserMessage text={m} />
          <AgentMessage text={reply}>
            <div data-speaker="assistant">
              <b>表单助手</b>
              <AgentReply text={reply} />
            </div>
          </AgentMessage>
        </React.Fragment>
      ))}
    </AgentPanel>
  );
}
const cap = createWebCapabilities(artifact, artifact);
const compiled = compile({
  definition: {
    protocolVersion: '1',
    id: 'handbook',
    version: '1',
    data: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
    views: {
      main: {
        material: 'field',
        props: { label: '姓名' },
        bindings: { value: { source: 'data', path: '/name' } },
        slots: {
          default: [
            { material: 'text-input', bindings: { value: { source: 'data', path: '/name' } } },
          ],
        },
      },
    },
  },
  catalog: {
    id: 'handbook',
    materials: Object.fromEntries(
      definitions.map((d) => [d.contract.manifest.id, { manifest: d.contract.manifest, artifact }]),
    ),
    pureFunctions: {},
  },
});
function Preview({ name }) {
  return compiled.success ? (
    <PreviewRuntime key={name} prepared={compiled.prepared} data={{ name }} capabilities={cap} />
  ) : (
    <output>{JSON.stringify(compiled.diagnostics)}</output>
  );
}
const schema = { type: 'object', properties: { name: { type: 'string', title: '姓名' } } };
const fieldRows = [{ id: 'name', label: '姓名', path: '/name', depth: 0 }];
const bindingFields = [
  {
    schemaPath: '/properties/name',
    label: '姓名',
    ref: { source: 'data', path: '/name' },
    schema: { type: 'string' },
  },
];
function OpenExample({ label, children }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState();
  const trigger = useRef(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && children(() => setOpen(false), setValue, trigger.current)}
      {value !== undefined && <output>{JSON.stringify(value)}</output>}
    </>
  );
}

function LeaveExample() {
  const [name, setName] = useState('');
  const [left, setLeft] = useState(false);
  usePendingNavigation('inspector', name ? { discard: () => setName('') } : null);
  const { beforeLeave } = useSchemaNavigation();
  return left ? (
    <p>已返回字段列表</p>
  ) : (
    <>
      <label>
        名称
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button onClick={() => beforeLeave(() => setLeft(true))}>返回字段列表</button>
    </>
  );
}
function PageHeadingExample({ initialTitle, delayedSave }) {
  const [title, setTitle] = useState(initialTitle);
  const [renameDisabled, setRenameDisabled] = useState(false);
  const completeSave = useRef(null);

  function save(value) {
    if (!delayedSave) {
      setTitle(value);
      return;
    }
    return new Promise((resolve) => {
      completeSave.current = () => {
        completeSave.current = null;
        setTitle(value);
        resolve();
      };
    });
  }

  return (
    <PageHeading
      title={title}
      back={{ label: '恢复示例标题', onClick: () => setTitle(initialTitle) }}
      rename={{ label: '表单名称', onSave: save, disabled: renameDisabled }}
    >
      <button type="button" className="studio-button" onClick={() => setTitle(initialTitle)}>
        重置
      </button>
      <button
        type="button"
        className="studio-button"
        aria-pressed={renameDisabled}
        onClick={() => setRenameDisabled(!renameDisabled)}
      >
        禁用标题编辑
      </button>
      {delayedSave && (
        <button type="button" className="studio-button" onClick={() => completeSave.current?.()}>
          完成保存
        </button>
      )}
    </PageHeading>
  );
}

const stories = {
  'page-heading': [PageHeadingExample, { initialTitle: '差旅审批单', delayedSave: false }],
  'page-heading-async': [PageHeadingExample, { initialTitle: '差旅审批单', delayedSave: true }],
  identity: [({ id }) => <RecordIdentity id={id} />, { id: 'travel-insurance' }],
  contracttable: [
    ({ required }) => (
      <ContractTable
        schema={{ ...schema, required: required ? ['name'] : [] }}
        pointer=""
        annotations={{}}
      />
    ),
    { required: true },
  ],
  'json-source': [
    ({ readOnly }) => {
      const [text, onChange] = useState(JSON.stringify(travelDefinition));
      const [profile, onProfile] = useState('main');
      return (
        <JsonSource
          text={text}
          onChange={onChange}
          profile={profile}
          onProfile={onProfile}
          formPath="/handbook"
          readOnly={readOnly}
        />
      );
    },
    { readOnly: true },
  ],
  'schema-navigation': [
    () => (
      <SchemaNavigation text="{}">
        <LeaveExample />
      </SchemaNavigation>
    ),
    {},
  ],
  'material-detail-preview': [
    () => (
      <MaterialDetailPreview preview={{ prepared: compiled.prepared, data: { name: '林安' } }} />
    ),
    {},
  ],
  'expression-verification-panel': [
    () => (
      <ExpressionVerificationPanel
        config={{
          formPath: '/handbook',
          schema: JSON.stringify(schema),
          scopes: [],
          travel: false,
        }}
        expected={{ type: 'boolean' }}
        raw="true"
        expr={true}
        fields={[]}
        manifests={[]}
        focus={() => {}}
      />
    ),
    {},
  ],
  'copy-form': [
    ({ disabled }) => (
      <OpenExample label="复制为新表单">
        {(close, showName, trigger) => (
          <Modal title="复制为新表单" size="standard" onClose={close} returnFocus={trigger}>
            <CopyForm
              path="/handbook"
              versionId="v1"
              allowNew
              disabled={disabled}
              onClose={(name) => {
                if (name) showName(name);
                close();
              }}
            />
          </Modal>
        )}
      </OpenExample>
    ),
    { disabled: false },
  ],
  'form-management': [
    ({ editable }) => {
      const [form, onMetadata] = useState({
        name: '投保单',
        description: '家庭出行',
        revision: 1,
        archived: false,
      });
      return (
        <OpenExample label="编辑名称与说明">
          {(close, _showValue, trigger) => (
            <Modal title="编辑名称与说明" size="standard" onClose={close} returnFocus={trigger}>
              <FormManagement
                form={form}
                onMetadata={onMetadata}
                path="/handbook"
                editable={editable}
                disabled={false}
                onEditClose={close}
              />
            </Modal>
          )}
        </OpenExample>
      );
    },
    { editable: true },
  ],
  'operation-records': [
    ({ title }) => (
      <OpenExample label={title}>
        {(close) => (
          <OperationRecords kind="form" path="/handbook/operations" title={title} onClose={close} />
        )}
      </OpenExample>
    ),
    { title: '查看操作记录' },
  ],
  'account-security': [
    () => (
      <AccountSecurity
        account={{ userId: 'example', username: '示例账号', hasPassword: true }}
        disabled
        onRefresh={async () => {}}
        onSessionLost={() => {}}
      />
    ),
    {},
  ],
  jsonview: [
    ({ readOnly }) => {
      const [text, onChange] = useState('{"name":"示例"}');
      const history = useJsonHistory(text, onChange);
      return (
        <JsonEditorView
          text={text}
          onChange={onChange}
          history={history}
          readOnly={readOnly}
          label="配置原文"
        />
      );
    },
    { readOnly: false },
  ],
  contractpanel: [
    ({ title }) => (
      <ContractPanel
        title={title}
        typeName="Applicant"
        schema={schema}
        pointer=""
        annotations={{}}
      />
    ),
    { title: '投保人' },
  ],
  materialdescription: [
    ({ title, text }) => <MaterialDescription title={title} text={text} />,
    { title: '物料说明', text: '显示一个姓名输入框。' },
  ],
  regexinput: [
    ({ disabled }) => {
      const [value, setValue] = useState('^[0-9]{6}$');
      return <RegexInput value={value} onChange={setValue} disabled={disabled} />;
    },
    { disabled: false },
  ],
  fieldtree: [
    ({ showPath, showMetadata, mode, disabled }) => {
      const [active, setActive] = useState();
      const [selected, setSelected] = useState([]);
      const [open, setOpen] = useState(true);
      const nodes = [
        { id: 'applicant', label: '投保人', path: '/applicant', selectable: false },
        {
          id: 'name',
          parentId: 'applicant',
          label: '姓名',
          path: '/applicant/name',
          metadata: { type: 'string', required: true },
        },
        {
          id: 'age',
          parentId: 'applicant',
          label: '年龄',
          path: '/applicant/age',
          metadata: { type: 'integer' },
          disabledReason: '此位置不接受整数',
        },
      ];
      const selection =
        mode === 'multiple'
          ? { mode, value: selected, onChange: setSelected }
          : mode === 'single'
            ? { mode, value: active ?? null, onChange: setActive }
            : { mode };
      return (
        <FieldTree
          label="字段层级"
          nodes={nodes}
          showPath={showPath}
          metadata={
            showMetadata ? { extra: (node) => (node.id === 'name' ? ['已关联'] : []) } : false
          }
          disabled={disabled}
          selection={selection}
          activeId={active}
          onActivate={(node) => setActive(node.id)}
          isExpanded={() => open}
          onToggle={() => setOpen(!open)}
        />
      );
    },
    { showPath: true, showMetadata: true, mode: ['none', 'single', 'multiple'], disabled: false },
  ],
  fieldcontrol: [
    ({ label }) => {
      const [value, setValue] = useState();
      return (
        <FieldPickerControl rows={fieldRows} label={label} value={value} onChange={setValue} />
      );
    },
    { label: '选择字段' },
  ],
  fielddialog: [
    ({ title }) => {
      const [id, select] = useState();
      return (
        <OpenExample label={title}>
          {(close, apply) => (
            <FieldPickerDialog
              title={title}
              rows={fieldRows}
              selected={fieldRows.filter((row) => row.id === id)}
              onSelect={select}
              onApply={() => {
                apply(id);
                close();
              }}
              onClose={close}
            />
          )}
        </OpenExample>
      );
    },
    { title: '选择目标字段' },
  ],
  layoutfield: [
    ({ label }) => {
      const [value, set] = useState();
      return <LayoutFieldPicker fields={bindingFields} label={label} value={value} set={set} />;
    },
    { label: '选择绑定字段' },
  ],
  reactionfield: [
    ({ title }) => (
      <OpenExample label={title}>
        {(close, apply) => (
          <ReactionFieldPicker
            fields={reactionFields(schema)}
            title={title}
            onApply={apply}
            onClose={close}
          />
        )}
      </OpenExample>
    ),
    { title: '选择监听字段' },
  ],
  scopeeditor: [
    ({ compactSummary }) => {
      const [scope, set] = useState();
      return (
        <ScopeEditor
          schema={travelDefinition.data.schema}
          rule={{ scope }}
          onChange={async (value) => set(value)}
          compactSummary={compactSummary}
        />
      );
    },
    { compactSummary: false },
  ],
  expressiondisplay: [
    () => (
      <section>
        <p>展开「出行天数」，再展开具名表达式 tripDays，可以查看它读取的日期字段。</p>
        <ExpressionDisplay
          value={estimate.then[0].value}
          fields={reactionFields(travelDefinition.data.schema, estimate.scope)}
          manifests={manifests}
          named={travelDefinition.expressions}
          functionDocs={functionDocs}
        />
      </section>
    ),
    {},
  ],
  functionhelp: [
    () => <FunctionHelp manifest={manifests.find((item) => item.parameters.length)} />,
    {},
  ],
  argumenthelp: [
    () => (
      <ArgumentHelp
        help={{
          parameter: manifests.find((item) => item.parameters.length).parameters[0],
          pointer: '/parameters/0',
          annotations: {},
        }}
      />
    ),
    {},
  ],
  layoutexpression: [
    ({ title }) => (
      <OpenExample label={title}>
        {(close, apply) => (
          <LayoutExpressionDialog
            title={title}
            initial="true"
            expected={{ type: 'boolean' }}
            fields={bindingFields}
            verification={{
              formPath: '/handbook',
              schema: JSON.stringify(schema),
              scopes: [],
              travel: false,
            }}
            close={close}
            apply={apply}
          />
        )}
      </OpenExample>
    ),
    { title: '编辑显示条件' },
  ],
  manifestinput: [
    ({ label }) => {
      const [value, set] = useState('false');
      return <ManifestInput label={label} schema={{ type: 'boolean' }} value={value} set={set} />;
    },
    { label: '显示标题' },
  ],
  valueinput: [
    ({ label }) => {
      const [raw, set] = useState('"姓名"');
      return (
        <ValueInput
          schema={{ type: 'string' }}
          label={label}
          raw={raw}
          set={set}
          fields={bindingFields}
        />
      );
    },
    { label: '标题' },
  ],
  inspection: [
    ({ disabled }) => {
      const [profile, set] = useState('');
      return (
        <ConfigInspection
          path="/handbook"
          input={{ text: '{}' }}
          sourceText="{}"
          canCheck
          disabled={disabled}
          profile={profile}
          onProfile={set}
        />
      );
    },
    { disabled: false },
  ],
  configdiff: [
    ({ label }) => (
      <OpenExample label={label}>
        {(close) => (
          <ConfigDiff
            path="/handbook"
            initialLeft="v1"
            initialRight="draft"
            versions={[]}
            choose={false}
            draft='{"title":"新名称"}'
            onClose={close}
          />
        )}
      </OpenExample>
    ),
    { label: '比较版本' },
  ],
  agentmerge: [
    ({ label }) => (
      <OpenExample label={label}>
        {(close, apply) => (
          <AgentMerge
            base='{"name":"原名"}'
            current='{"name":"手工修改"}'
            candidate='{"name":"候选名称"}'
            onApply={(text) => {
              apply(text);
              close();
            }}
            onClose={close}
          />
        )}
      </OpenExample>
    ),
    { label: '处理合并冲突' },
  ],
  codeblock: [
    ({ json, jsx, typescript }) => (
      <>
        <CodeBlock language="json" label="JSON 配置" source={json} />
        <CodeBlock language="jsx" label="JSX 示例" source={jsx} />
        <CodeBlock language="typescript" label="TypeScript 契约" source={typescript} />
      </>
    ),
    {
      json: '{\n  "name": "差旅申请",\n  "enabled": true\n}',
      jsx: 'export function Form() {\n  return <FormRenderer readOnly={false} />;\n}',
      typescript: 'type Props = { name: string; readOnly?: boolean };',
    },
  ],
  agentreply: [
    ({ text, streaming }) => <AgentReply text={text} streaming={streaming} />,
    {
      text: [
        '已添加**姓名**字段。',
        '```json\n{ "name": "姓名", "required": true }\n```',
        [
          '| ExternalFormFieldIdentityFromTheSourceSchema | 必填 | 来源 | 说明 | 校验规则 | OriginalFormValueFromTheSourceDocument | 调整后的值 |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          ...Array.from(
            { length: 24 },
            (_, i) => `| 字段 ${i + 1} | 是 | 表单定义 | 提交前确认 | 非空文本 | 原始值 | 新值 |`,
          ),
        ].join('\n'),
      ].join('\n\n'),
      streaming: false,
    },
  ],
  candidatecard: [
    ({ title }) => {
      const [applied, set] = useState(false);
      return (
        <AgentCandidateCard>
          <strong>{title}</strong>
          <button type="button" disabled={applied} onClick={() => set(true)}>
            {applied ? '已应用' : '应用候选'}
          </button>
        </AgentCandidateCard>
      );
    },
    { title: '增加姓名字段' },
  ],
  agentissues: [
    ({ compilation }) => (
      <AgentIssues
        issues={[
          {
            category: 'host',
            status: 'evidence_missing',
            title: '验证服务',
            finding: '尚缺少服务地址',
            action: '提供可用的验证服务地址',
          },
        ]}
        verification={{ compilation }}
      />
    ),
    { compilation: ['unverified', 'passed', 'failed'] },
  ],
  requirements: [
    ({ layout }) => (
      <Requirements
        prepared={{
          definition: { views: {} },
          hostRequirements: { requests: [{ name: 'lookup' }], events: [], validators: [] },
        }}
        layout={layout}
      />
    ),
    { layout: ['details', 'table'] },
  ],
  hostexample: [
    ({ releaseId }) => <ReleaseHostExample releaseId={releaseId} />,
    { releaseId: 'travel-demo' },
  ],
  integration: [() => <ReleaseIntegration releaseId="travel-demo" layout="capabilities" />, {}],
  cardlist: cardListStory,
  expression: [
    Expression,
    { label: '监护人校验生效条件', allowValidation: false, compactArguments: false },
  ],
  fields: pickerStory,
  value: [PremiumValue, { label: '总保费' }],
  action: [
    ({ initialKind }) => <Action key={initialKind} initialKind={initialKind} />,
    {
      initialKind: [
        'set',
        'patch',
        'remove',
        'array.insert',
        'array.remove',
        'array.move',
        'host.emit',
        'batch',
      ],
    },
  ],
  json: [Json, { readOnly: false, label: '表单配置', size: ['regular', 'compact'] }],
  reference: [
    ({ id }) => (
      <>
        <RecordIdentity id={id} />
        <ContractTable
          pointer=""
          annotations={{}}
          schema={{ type: 'object', required: ['name'], properties: { name: { type: 'string' } } }}
        />
      </>
    ),
    { id: 'travel-insurance' },
  ],
  preview: [Preview, { name: '王明' }],
  diff: [
    ({ before, after }) => (
      <DiffResult texts={[JSON.stringify({ name: before }), JSON.stringify({ name: after })]} />
    ),
    { before: '出行保障', after: '境外出行保障' },
  ],
  agent: [Agent, { sendLabel: '发送', disabled: false, sendDisabled: false }],
};
const [name, mode] = location.hash.slice(1).split('/');
createRoot(document.querySelector('#business-playground')).render(
  <Playground
    story={stories[name || 'expression']}
    overrides={
      name === 'fieldtree' && mode === 'hidden'
        ? { mode: 'multiple', showPath: false, showMetadata: false }
        : name === 'fieldtree' && mode === 'disabled'
          ? { mode: 'multiple', disabled: true }
          : name === 'json' && mode === 'compact'
            ? { size: 'compact' }
            : mode === 'multiple'
              ? { multiple: true, label: '选择监听字段', description: '可跨作用域选择多个字段。' }
              : {}
    }
  />,
);
