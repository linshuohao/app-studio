import { TableResults, MasterDetail } from '../../apps/studio/src/components/ui/list-layout';
import { IconButton, Tooltip } from '../../apps/studio/src/components/ui';
import { Feedback } from '../../apps/studio/src/components/ui/controls';
import { FormLayout } from '../../apps/studio/src/components/ui/form-layout';
import { Modal } from '../../apps/studio/src/app/modal';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Field,
  Form,
  Input,
  Textarea,
  Select,
  Dialog,
  Drawer,
  Grid,
  GridItem,
  Pagination,
  Tabs,
  TreeView,
  DataTable,
  ListFilterBar,
  Icon,
} from '../../apps/studio/src/components/ui';
import { Field as FilterField } from '../../apps/studio/src/components/ui/form-layout';
import { StudioSelect } from '../../apps/studio/src/components/ui/select';
import './playground.css';

function renderOption(value) {
  return (
    <Select.Item key={value} value={value}>
      <Select.ItemText>{value}</Select.ItemText>
      <Select.ItemIndicator />
    </Select.Item>
  );
}
function Options({ items, groups, ...props }) {
  return (
    <Select.Root {...props}>
      <Select.Trigger aria-label={props.name}>
        <Select.Value>{(value) => (Array.isArray(value) ? value.join('、') : value)}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false}>
          <Select.Popup>
            <Select.List>
              {groups
                ? groups.map(({ label, items }) => (
                    <Select.Group key={label}>
                      <Select.GroupLabel>{label}</Select.GroupLabel>
                      {items.map(renderOption)}
                    </Select.Group>
                  ))
                : items.map(renderOption)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
function ButtonExample({ children, ...args }) {
  const [count, set] = useState(0);
  return (
    <>
      <Button {...args} onClick={() => set(count + 1)}>
        {children}
      </Button>
      <output>点击 {count} 次</output>
    </>
  );
}
function FieldExample({ label, description, disabled, required, validationMode = 'onSubmit' }) {
  const [result, set] = useState('');
  return (
    <Form validationMode={validationMode} onFormSubmit={(v) => set(v.title || '（空）')}>
      <Field.Root name="title" disabled={disabled}>
        <Field.Label>{label}</Field.Label>
        <Input required={required} />
        <Field.Description>{description}</Field.Description>
        <Field.Error match="valueMissing">请填写{label}</Field.Error>
      </Field.Root>
      <Button type="submit">保存</Button>
      <output>{result}</output>
    </Form>
  );
}
function InputExample({ type, disabled, readOnly }) {
  const [value, set] = useState('');
  return (
    <>
      <Input
        key={type}
        type={type}
        {...(type === 'time' ? { min: '08:00', max: '18:00', step: 60 } : {})}
        accept={type === 'file' ? '.json' : undefined}
        aria-label="输入示例"
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) =>
          set(
            type === 'file'
              ? [...e.currentTarget.files].map((f) => f.name).join('、')
              : e.currentTarget.value,
          )
        }
      />
      <output>{value}</output>
    </>
  );
}
function SelectExample({ multiple, disabled, grouped }) {
  const [value, set] = useState(multiple ? ['草稿'] : '草稿');
  return (
    <>
      <Options
        name="发布状态"
        items={['草稿', '审核中', '已发布']}
        groups={
          grouped
            ? [
                { label: '发布前', items: ['草稿', '审核中'] },
                { label: '发布后', items: ['已发布'] },
              ]
            : undefined
        }
        multiple={multiple}
        disabled={disabled}
        value={value}
        onValueChange={set}
      />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
function Overlay({ component: C, title, modal }) {
  return (
    <C.Root modal={modal}>
      <C.Trigger render={<Button />}>打开{title}</C.Trigger>
      <C.Portal>
        <C.Backdrop />
        <C.Viewport>
          <C.Popup>
            <C.Title>{title}</C.Title>
            <C.Description>确认已选择的物料。</C.Description>
            <C.Close render={<Button variant="secondary" />}>关闭</C.Close>
          </C.Popup>
        </C.Viewport>
      </C.Portal>
    </C.Root>
  );
}
const records = [
  ['旅险投保', '草稿', 3, '保险'],
  ['境外医疗', '已发布', 8, '保险'],
  ['费用报销', '已发布', 4, '财务'],
  ['差旅申请', '草稿', 2, '行政'],
  ['团体旅险', '已发布', 6, '保险'],
  ['付款申请', '草稿', 1, '财务'],
  ['办公采购', '已发布', 5, '行政'],
  ['交通报销', '草稿', 7, '财务'],
];
function TableExample({ sortable, hideable }) {
  const [sort, S] = useState(null),
    [page, P] = useState(1),
    [size, Z] = useState(3);
  const rows =
    sort && sortable
      ? [...records].sort((a, b) => (a[2] - b[2]) * (sort.direction === 'asc' ? 1 : -1))
      : records;
  return (
    <section className="table-example">
      <h3>表单结果</h3>
      <DataTable
        label="表单结果"
        columns={[
          { key: 'name', title: '名称', render: (r) => r[0] },
          { key: 'category', title: '分类', render: (r) => r[3] },
          { key: 'status', title: '状态', hideable, render: (r) => r[1] },
          { key: 'version', title: '版本', sortable, render: (r) => 'v' + r[2] },
        ]}
        rows={rows.slice((page - 1) * size, page * size)}
        rowKey={(r) => r[0]}
        sort={sortable ? sort : null}
        onSortChange={(s) => {
          S(s);
          P(1);
        }}
      />
      <Pagination
        total={rows.length}
        page={page}
        pageSize={size}
        pageSizeOptions={[3, 5, 10]}
        onChange={(p, s) => {
          P(p);
          Z(s);
        }}
      />
    </section>
  );
}
function FilterExample({ label, layout = 'compact', expandable = false }) {
  const defaults = { query: '', status: '', category: '' };
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const rows = records.filter(
    (row) =>
      row[0].includes(applied.query) &&
      (!applied.status || row[1] === applied.status) &&
      (!applied.category || row[3] === applied.category),
  );
  const query = (control) => (
    <Input
      {...control}
      type="search"
      aria-label="表单名称"
      placeholder="搜索表单名称…"
      value={draft.query}
      onValueChange={(query) => setDraft({ ...draft, query })}
    />
  );
  const status = (control, visibleLabel) => (
    <StudioSelect
      {...control}
      aria-label="发布状态"
      visibleLabel={visibleLabel}
      value={draft.status}
      onValueChange={(status) => setDraft({ ...draft, status })}
    >
      <option value="">全部状态</option>
      <option value="草稿">草稿</option>
      <option value="已发布">已发布</option>
    </StudioSelect>
  );
  const category = (control, visibleLabel) => (
    <StudioSelect
      {...control}
      aria-label="分类"
      visibleLabel={visibleLabel}
      value={draft.category}
      onValueChange={(category) => setDraft({ ...draft, category })}
    >
      <option value="">全部分类</option>
      <option value="财务">财务</option>
      <option value="保险">保险</option>
      <option value="行政">行政</option>
    </StudioSelect>
  );
  return (
    <>
      <ListFilterBar
        label={label}
        layout={layout}
        advanced={
          expandable
            ? {
                fields: <FilterField label="分类">{(control) => category(control)}</FilterField>,
                appliedSummary: applied.category && '已应用分类：' + applied.category,
              }
            : undefined
        }
        onApply={() => setApplied(draft)}
        onReset={() => {
          setDraft(defaults);
          setApplied(defaults);
        }}
      >
        {layout === 'query' ? (
          <>
            <FilterField label="表单名称">{query}</FilterField>
            <FilterField label="发布状态">{(control) => status(control)}</FilterField>
            <FilterField label="分类">{(control) => category(control)}</FilterField>
          </>
        ) : (
          <>
            {query()}
            {layout === 'compact' && status(undefined, '发布状态')}
            {layout === 'compact' && !expandable && category(undefined, '分类')}
          </>
        )}
      </ListFilterBar>
      <output>
        {rows.length} 条 · {rows.map((row) => row[0]).join('、')}
      </output>
    </>
  );
}
function Pager({ total }) {
  const [page, P] = useState(1),
    [size, Z] = useState(3);
  return (
    <Pagination
      page={Math.min(page, Math.max(1, Math.ceil(total / size)))}
      pageSize={size}
      total={total}
      pageSizeOptions={[3, 5, 10]}
      onChange={(p, s) => {
        P(p);
        Z(s);
      }}
    />
  );
}
function GridExample({ density, span }) {
  return (
    <Grid density={density}>
      {['名称', '状态', '版本说明'].map((x) => (
        <GridItem key={x} span={span}>
          <div className="specimen-cell">{x}</div>
        </GridItem>
      ))}
    </Grid>
  );
}
const fieldArgs = {
  label: '版本名称',
  description: '填写可识别的版本名称。',
  required: true,
  disabled: false,
};
function TabsExample({ size, bordered, orientation, activateOnFocus }) {
  return (
    <Tabs.Root bordered={bordered} size={size} orientation={orientation} defaultValue="overview">
      <Tabs.List aria-label="表单配置区" activateOnFocus={activateOnFocus}>
        <Tabs.Tab value="overview">基本信息</Tabs.Tab>
        <Tabs.Tab value="fields">字段配置</Tabs.Tab>
        <Tabs.Tab value="rules">校验规则</Tabs.Tab>
        <Tabs.Tab value="history" disabled>
          发布记录
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">
        <h3>基本信息</h3>
        <p>境外旅行保障</p>
        <p>投保人可为自己及同行人员购买保障。</p>
      </Tabs.Panel>
      <Tabs.Panel value="fields">
        <h3>字段配置</h3>
        <p>投保人姓名、证件号码、出行日期</p>
      </Tabs.Panel>
      <Tabs.Panel value="rules">
        <h3>校验规则</h3>
        <p>返程日期不得早于出发日期。</p>
      </Tabs.Panel>
      <Tabs.Panel value="history">
        <h3>发布记录</h3>
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function TreeExample({ label, density }) {
  const [selected, setSelected] = useState('applicant');
  const [expanded, setExpanded] = useState(['applicant']);
  const nodes = [
    { id: 'applicant', label: '投保人' },
    { id: 'name', parent: 'applicant', label: '姓名' },
    { id: 'contact', parent: 'applicant', label: '联系方式' },
    { id: 'phone', parent: 'contact', label: '被保险人的境外紧急联络电话号码' },
    { id: 'policy', label: '保单信息' },
  ].map((node) => ({ ...node, selected: node.id === selected }));

  return (
    <div style={{ maxInlineSize: '12rem' }}>
      <TreeView
        label={label}
        nodes={nodes}
        density={density}
        isExpanded={(id) => expanded.includes(id)}
        onToggle={(id) =>
          setExpanded((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
          )
        }
        renderItem={(node, focusProps) => (
          <Button
            {...focusProps}
            variant="text"
            aria-pressed={node.selected}
            onClick={() => setSelected(node.id)}
          >
            {node.label}
          </Button>
        )}
      />
      <output>当前选中：{nodes.find((node) => node.selected)?.label}</output>
    </div>
  );
}

const stories = {
  tableresults: [
    ({ label }) => (
      <TableResults label={label}>
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>类型</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>姓名</td>
              <td>文本</td>
            </tr>
          </tbody>
        </table>
      </TableResults>
    ),
    { label: '字段清单' },
  ],
  masterdetail: [
    ({ label }) => {
      const [selected, setSelected] = useState('姓名');
      return (
        <MasterDetail
          label={label}
          navigation={
            <nav aria-label="字段">
              {['姓名', '年龄'].map((item) => (
                <Button key={item} onClick={() => setSelected(item)}>
                  {item}
                </Button>
              ))}
            </nav>
          }
        >
          <h3>{selected}</h3>
          <p>{selected === '姓名' ? '文本' : '整数'}</p>
        </MasterDetail>
      );
    },
    { label: '字段详情' },
  ],
  icon: [
    ({ name }) => (
      <span>
        <Icon name={name} /> 搜索字段
      </span>
    ),
    { name: ['Search', 'Info'] },
  ],
  iconbutton: [
    ({ disabled }) => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <IconButton
            icon="Info"
            aria-label="查看说明"
            disabled={disabled}
            onClick={() => setOpen(!open)}
          />
          {open && <p>选择字段后可查看详情。</p>}
        </>
      );
    },
    { disabled: false },
  ],
  tooltip: [
    ({ label }) => (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger render={<Button />}>查看帮助</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner>
              <Tooltip.Popup>{label}</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    ),
    { label: '选择后可查看字段详情' },
  ],
  feedback: [
    ({ kind, message }) => <Feedback kind={kind}>{message}</Feedback>,
    { kind: ['status', 'error'], message: '已收到检查结果' },
  ],
  formlayout: [
    ({ density, columns }) => (
      <FormLayout density={density} columns={columns}>
        <FilterField label="名称">{(props) => <Input {...props} />}</FilterField>
        <FilterField label="备注">{(props) => <Input {...props} />}</FilterField>
      </FormLayout>
    ),
    { density: ['regular', 'dense'], columns: ['single', 'two'] },
  ],
  fieldlayout: [
    ({ error }) => (
      <FilterField label="名称" hint="填写可识别的名称" error={error}>
        {(props) => <Input {...props} />}
      </FilterField>
    ),
    { error: '请填写名称' },
  ],
  studioselect: [
    ({ disabled }) => {
      const [value, setValue] = useState('draft');
      return (
        <StudioSelect
          aria-label="配置状态"
          value={value}
          onValueChange={setValue}
          disabled={disabled}
        >
          <option value="draft">草稿</option>
          <option value="ready">已就绪</option>
        </StudioSelect>
      );
    },
    { disabled: false },
  ],
  nativemodal: [
    ({ title }) => {
      const [trigger, setTrigger] = useState(null);
      return (
        <>
          <Button onClick={(e) => setTrigger(e.currentTarget)}>查看说明</Button>
          {trigger && (
            <Modal title={title} returnFocus={trigger} onClose={() => setTrigger(null)}>
              当前字段用于记录投保人姓名。
            </Modal>
          )}
        </>
      );
    },
    { title: '字段说明' },
  ],
  treeview: [TreeExample, { label: '表单字段', density: ['compact', 'regular'] }],
  button: [
    ButtonExample,
    { children: '保存草稿', variant: ['primary', 'secondary', 'text'], disabled: false },
  ],
  input: [InputExample, { type: ['text', 'time', 'file'], disabled: false, readOnly: false }],
  select: [SelectExample, { multiple: false, disabled: false, grouped: false }],
  field: [FieldExample, fieldArgs],
  form: [FieldExample, { ...fieldArgs, validationMode: ['onSubmit', 'onBlur', 'onChange'] }],
  textarea: [
    ({ rows, disabled, placeholder }) => (
      <Textarea
        aria-label="版本说明"
        render={<textarea rows={rows} />}
        disabled={disabled}
        placeholder={placeholder}
      />
    ),
    { rows: 3, disabled: false, placeholder: '填写版本说明' },
  ],
  modal: [(a) => <Overlay component={Dialog} {...a} />, { title: '选择物料', modal: true }],
  drawer: [(a) => <Overlay component={Drawer} {...a} />, { title: '物料详情', modal: true }],
  grid: [GridExample, { density: ['regular', 'dense'], span: 6 }],
  griditem: [GridExample, { span: 6, density: ['dense', 'regular'] }],
  pagination: [Pager, { total: 23 }],
  tabs: [
    TabsExample,
    {
      size: ['md', 'sm'],
      bordered: false,
      orientation: ['horizontal', 'vertical'],
      activateOnFocus: false,
    },
  ],
  datatable: [TableExample, { sortable: true, hideable: true }],
  listfilterbar: [FilterExample, { label: '表单筛选' }],
  'listfilterbar-single': [FilterExample, { label: '版本筛选', layout: 'search' }],
  'listfilterbar-query': [FilterExample, { label: '带标签的筛选', layout: 'query' }],
  'listfilterbar-advanced': [FilterExample, { label: '可展开的筛选', expandable: true }],
};
import { Playground } from './props-panel';
const root = document.querySelector('#playground');
if (root) {
  const [name, mode] = location.hash.slice(1).split('/');
  if (name === 'cardlist') location.replace('business-playground.html#cardlist');
  if (stories[name])
    createRoot(root).render(
      <Playground
        story={stories[name]}
        overrides={
          name === 'input' && mode
            ? { type: mode }
            : name === 'select' && mode
              ? { multiple: mode === 'multiple', grouped: mode === 'grouped' }
              : {}
        }
      />,
    );
}
document
  .querySelectorAll('[data-handbook-icon]')
  .forEach((el) => createRoot(el).render(<Icon name={el.dataset.handbookIcon} />));
