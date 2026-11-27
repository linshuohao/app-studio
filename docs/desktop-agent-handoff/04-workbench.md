# 04 · 引擎、编辑与扩展

本章是制品接线与扩展练习入口。机制和迁移验收见[引擎设计](07-engine-design.md)，实际布局、字段、规则及草稿写入见[配置工作台设计](08-workbench-design.md)。

## 引擎制品是一条单向依赖

| 层 | 沿用职责 | 桌面接入 |
| --- | --- | --- |
| L1 Definition | 数据、规则、作用域及视图声明 | 编辑、导入、导出使用同一协议 |
| L2 Compiler | 规范化、静态诊断、依赖及能力锁 | 本机检查，生成 PreparedForm |
| L3 Runtime | Working Data、Command、Scope、Flush、校验 | 每次试填独立实例 |
| L4 Renderer | 物料装配、绑定、订阅与输入交付 | React UI 装配真实引擎 |

使用引擎仓可审计的同批制品，包括协议、Compiler、Runtime、React Renderer、物料与纯函数包、Catalog/Manifest 和 Agent 所读手册。用确定提交、包版本与制品摘要记录来源。原仓这些依赖使用 `workspace:*`，新项目应安装受控 Registry 或锁定 tarball 制品。先证明干净检出能安装并跑通 `Definition → Prepared → Runtime → Renderer`，再上工作台。当前需要从原仓或制品提供者取得包；没有制品时用清楚标识的替身继续桌面联验，真实引擎验收保持待完成。

## 可视化编辑

| 编辑入口 | 交互与提交 |
| --- | --- |
| 字段 | 树上进行增删定位，抽屉配置属性和规则。一次应用形成一个撤销单元。 |
| 布局 | 编排画布负责插入、删除和拖动；节点抽屉负责属性和替换。保留兼容子树及词法绑定。 |
| 联动、校验 | 在规则清单和抽屉编辑。明确联动的观察、读取和动作顺序，区分校验前置、输入和结果归属。 |
| JSON | 共享同一定义草稿。能局部写回时保留未触及原文及未知属性，位置歧义时定位到原文。 |

普通作者编辑和 Agent 候选应用复用同一工作台。抽屉暂存、应用、试填和持久化分别发生。试填数据属于 Runtime 实例，编辑的定义属于工作台。一次试填结果绑定具体候选或工作稿，旧检查回执不能证明新内容有效。

## 两个资产练习

这些命令在提供现有资产工具的引擎仓中运行。桌面仓以消费和集成测试为主。

```bash
pnpm asset:new material --id date-range-example --dry-run
pnpm asset:new function --id text.hasVisibleText --dry-run
```

- **date-range**。从静态 Manifest 检查 label 与两个可空日期绑定，把制品对应的 React 实现加入物料注册表。弹窗编辑值先暂存，取消没有写入，确认分别交付两个值。验证其中一端失败时，界面重读并展示实际的部分结果。
- **text.isNonBlank**。Manifest 声明任意 JSON 入参和布尔结果。编译时登记契约，运行时注册同一制品下的纯函数。通过 Constraint 检查姓名，输入全角空格无效，输入 `" 张三 "` 有效且快照保留原文。
- **交付**。在引擎仓运行资产级测试和 Compiler/Runtime 集成验证；用 `asset:change` 记录行为兼容影响，`assets:check` 检查契约与导出，再预览 `release:plan`。桌面验收用真实的包制品，不依赖用模板重新实现两项资产。

下面是旅险最小用例中的两个协议片段。把相应路径声明在数据 Schema 中，使用确定 Catalog 编译整份定义。

```json
{
  "material": "date-range",
  "props": { "label": "出行日期" },
  "bindings": {
    "start": { "source": "data", "path": "/travel/startDate" },
    "end": { "source": "data", "path": "/travel/endDate" }
  }
}
```

```json
{
  "op": "text.isNonBlank",
  "args": [{ "ref": { "source": "data", "path": "/name", "scope": "insured" } }]
}
```

第二段是逐成员 Constraint 的 `assert`。规则的 Scope 将 `/insureds` 中每项绑定为 `insured`，Issue 目标同样指向该成员的 `/name`。验收时交换成员顺序，再检查错误归属。
