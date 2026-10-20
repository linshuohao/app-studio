---
id: ENGINEERING-FE-001
title: 工程工具链与初始化方案
type: design
status: active
layer: 系统
modules:
- M01
- M17
related:
  decisions:
  - ADR-FE-013
  - ADR-FE-014
sources:
- SRC-PROTOCOLIMPLEMENTATION
- SRC-PROTOCOLBASELINE
- SRC-ENGINEERING
navigation:
  group: 01 · 架构全貌
  order: 30
last_reviewed: '2026-10-21'
status_note: E1–E4 工程底座已初始化并完成本地联验；Protocol 三领域类型 / Schema 首批实现已通过本地检查；Compiler / Runtime 与远端 CI 未完成
---

# 工程工具链与初始化方案

本篇是已确认首期工程选型的实施依据，承接[六包边界与目录](architecture.md#application-engineering)。覆盖选型比较、依赖安装、脚手架初始化、任务编排、代码约束、Git、质量门禁和验收。用户已确认采用定制优先的 UI 路线，并要求通过 pnpm 获取最新依赖、通过脚手架初始化项目。方案归档时只交付文档；随后用户授权执行 E1–E4。当前工作区、六包、Next / Nest、统一任务及本地联验已落地，实际记录与日常命令见第 10 节。以下 create / init 步骤用于追溯首次创建，不应对已初始化仓库重复执行。

Playground 保持轻量并使用 Next.js，不在本轮展开页面、状态管理或产品架构。后端采用 NestJS，Platform / Studio 的整体设计及状态管理另行讨论。核心 Runtime 等保持纯 TS，与应用框架无关。已确认组合见 [ADR-FE-014](decisions/ADR-FE-014-engineering-toolchain.md)；补充规则属于该范围内的实施细化，尚待工程验证，不新增核心协议语义。

## 1. 已选技术组合与比较 {#engineering-selection}

| 范围 | 已选方案 | 比较与取舍 |
| --- | --- | --- |
| 开发环境 | Node.js 最新可用 LTS；TypeScript | 相比 Current / 预览版本优先长期支持；执行时解析并记录实际版本，不在本文预填版本号 |
| 工作区 / 依赖 | pnpm Workspace | 相比 npm / Yarn，采用显式 workspace 关联、统一锁与集中依赖规则；不同时维护其他包管理器锁文件 |
| 任务编排 | Turborepo | 当前主要需要任务图、并行和缓存；Nx 的生成器及项目治理能力暂非必要，未来按真实需求重新评估 |
| 轻量 Playground | Next.js App Router + React | 用户指定；使用官方脚手架，不扩展为本轮 Platform 架构 |
| 后端 | NestJS | 用户指定；核心引擎不依赖 NestJS，服务模块 / 数据库 / 部署不因框架选型而冻结 |
| TS / React 库构建 | tsdown；独立 TS 类型检查 | 比单独 tsc 更便于组织库产物；应用保留各自构建链，不用库打包器代替 Nest / Next 编译 |
| 静态检查 / 格式 | ESLint Flat Config + typescript-eslint；Prettier + EditorConfig | 优先现有框架规则和定制能力；Biome 是可评估替代，不以其缺少类型感知能力为排除理由 |
| 单元 / 集成 | Vitest；React Testing Library | 相比另设 Jest，统一测试入口；Nest 仍须正确转换装饰器和元数据，不强制同一转换配置 |
| 浏览器测试 | Playwright | 对照 Cypress 后选择统一浏览器验收；验证真实组件操作，不能只发 Runtime Command |
| 组件 | shadcn/ui | 用户选择定制优先；源码可改但升级与维护由本项目承担。Ant Design 为曾比较的快速业务交付方案；Mantine / MUI 为备选，不同时全面引入 |
| 样式 | Tailwind CSS + CSS Variables；局部 CSS Modules | 主题走语义 Token，复杂局部样式可使用 CSS Modules；不额外建立全仓运行时 CSS-in-JS 体系 |
| 本地反馈 / 提交 | Husky + lint-staged + commitlint | 本地快速反馈，CI 才是最终门禁 |
| 多包版本 | Changesets | 显式声明各包变更影响；不由提交类型自动推断全部版本 |
| CI | GitHub Actions 优先 | 平台待实际仓库托管确认；质量任务通过 pnpm 调用，保持可迁移 |

pnpm 管工作区和依赖，Turborepo 管任务，两者不替代。TS / 库构建、Next / Nest 框架与测试的实际兼容性以初始化联验为准。工具功能依据见 [pnpm 工作区](https://pnpm.io/workspaces)、[Turborepo 任务](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)、[tsdown](https://tsdown.dev/guide/)、[Biome](https://biomejs.dev/linter/)。比较结论是项目取舍，不是工具性能实测。

## 2. 最新依赖与可复现安装 {#engineering-latest}

1. 初始化和主动升级使用 `pnpm create …@latest`、`pnpm dlx …@latest`、`pnpm add …@latest`，不手写依赖版本号或复制旧 package.json。
2. `latest` 指注册源的发布标签，通常代表稳定通道，不等于按发布时间排序的最后一个制品；不默认选择 canary / next / beta，也不保证彼此兼容或模板依赖已最新。
3. 脚手架生成后，先保留其结构、理解配置，再通过 pnpm 更新生成的依赖。遇到 peer 冲突，检查支持矩阵和官方迁移说明，不用 `--force`、忽略 peer 或任意 override 把错误压下去；无法兼容时记录冲突与必要调整，不宣称全部最新版已验证。实施时用户明确允许冲突项按实际 peer 范围自动选择最新兼容稳定版，解析脚本不手写版本号，详见第 10 节。
4. 清单与锁由包管理器实际生成，提交根 `pnpm-lock.yaml`。新检出和 CI 使用 `pnpm install --frozen-lockfile`，不重新执行初始化或 latest 更新。
5. Node / pnpm 的实际版本在执行时记录并固定；CI 使用相同环境。工具版本固定不等于本文预先指定版本，也不代表引擎 / 协议已发布。
6. `workspace:*` 表示内部依赖关系，不是预填第三方版本。React peer 范围等兼容声明根据实际联验设置，不能把 `latest` 当作可发布的兼容承诺。
7. 依赖来源默认官方 npm 注册源；需要镜像时核对同步情况。保存 CLI 实际版本、初始化选项和更新 diff，便于复现源码；临时 dlx 工具的版本不一定进入项目锁，须在实施记录中补充。

参考 [pnpm add](https://pnpm.io/cli/add)、[pnpm update](https://pnpm.io/cli/update)。安装策略保证执行时请求最新标签，工程验收保证可用；脚手架与 latest 本身不能替代兼容和行为验证。

## 3. 工程组织与约束 {#engineering-layout}

现有六包与 Flutter 顶层预留不变。已按下列职责建立实际工程；fixtures 等无实际内容的位置不强制占位：

```text
apps/playground/          Next.js，轻量接入与验证
services/api/             NestJS，工程骨架及启动 / 请求验证
packages/protocol/        可交换协议结构与绑定
packages/compiler/        静态编译与诊断
packages/runtime/         框架无关执行
packages/renderer-react/  通用 React Adapter 与呈现装配
packages/materials-react/ 基础物料、Manifest 与样式交付
packages/pure-functions/  同步确定性函数与签名
tools/config/            共享 TS / ESLint / 测试配置
tools/engineering/       边界及产物检查脚本
tools/docs/              保留已有文档工具
tests/integration/       跨包行为
tests/e2e/               浏览器验收
tests/fixtures/          输入、操作、检查点及明确预期
packages-flutter/        继续预留
```

根工作区匹配 `apps/*`、`services/*`、`packages/*`，不把未来 Dart 目录加入 pnpm，也不把纯配置目录自动声明为包。根、应用、服务和未准备发布的库设为 private。包命名空间属于实施细节，内部安装先用路径 filter，避免在本文虚构已发布包名。

跨包只消费 exports；禁止核心反向导入应用 / 服务、循环和深层源码导入。Compiler 不依赖 Runtime 生产实现，不导入物料 UI；Manifest 与组件实现分入口。Renderer 不强制默认物料或样式。共享配置通过 tools 复用，不新增通用 UI / shared / utils / host-sdk / testkit 包。通过 ESLint 与 dependency-cruiser 检查导入和依赖图，清单边界及打包消费者检查覆盖类型导入和产物入口，不把 Turbo 调度视为边界证明。

## 4. 初始化顺序与命令 {#engineering-bootstrap}

以下为首次初始化流程，从项目根执行；当前仓库已完成这些步骤，不重复执行。命令按小节有前置关系，不是可直接整段无交互执行的一键脚本。执行者先检查工作区和 Git Diff，再调用当前 CLI 的 `--help`；涉及生成器提示的选择按表落实。不要覆盖已有业务文件、重建 Git 或重新生成已有项目。

### 4.1 环境与根清单

Node 使用环境管理器选择最新 LTS（例如已安装 nvm 时执行 `nvm install --lts`）；pnpm 按[官方安装说明](https://pnpm.io/installation)准备。不为首次安装 pnpm 自身制造“必须已有 pnpm”的循环前提，也不在文档中绑定具体 Node / pnpm 版本。已有 pnpm 可按当前官方命令更新，随后记录版本。

```bash
node --version
pnpm --version
pnpm init --init-type module --init-package-manager
```

根清单由 [pnpm init](https://pnpm.io/cli/init)生成，然后补 `private`、项目身份和任务入口，保留命令实际生成的包管理器信息。配置根 `pnpm-workspace.yaml` 的三组匹配后，再执行 workspace 安装。根已有 Git，不运行 git init。根 .gitignore 在已有规则上增量合并，覆盖 node_modules、各类构建 / 测试产物和本地环境文件，保留可提交的 .env.example。

Turborepo 使用已有仓库的接入方式安装，不对已有仓库直接运行 create-turbo；后者生成的是新的示例仓库，会引入与已确认目录不同的示例和配置。工作区、任务图、CI 属于本项目配置，没有合适脚手架时按官方配置接口整合，不伪造初始化命令。

### 4.2 Next.js 与 NestJS 使用官方脚手架

```bash
pnpm create next-app@latest apps/playground --ts --eslint --tailwind --app --src-dir --use-pnpm --skip-install --disable-git
pnpm dlx @nestjs/cli@latest new api --directory services/api --package-manager pnpm --skip-git --skip-install
```

| 生成项目 | 选择 / 整合要求 |
| --- | --- |
| Next.js | 采用 App Router、TS、ESLint、Tailwind；保留当前脚手架的框架配置，不在本轮扩展产品模块 |
| NestJS | 选择 ESM、TypeScript；不连接 Observe 等外部服务；保留并验证框架编译、注入和元数据 |
| 两者 | 使用根工作区锁，不嵌套 Git；生成的同名工具配置整合到已选工程规范，不仅因为默认值不同就改变已确认工具链 |

Nest 当前脚手架可能带其他 Lint 工具，ESM 与 CommonJS 模板的测试配置也可能不同。生成后依据实际清单迁移为 ESLint / Vitest，确认替代配置后再通过 `pnpm remove` 移除不使用的工具；不能同时留两套权威 Lint / 测试任务。CLI 提示与生成内容会演进，实施时记录实际选项。[Next 脚手架](https://nextjs.org/docs/app/api-reference/cli/create-next-app)、[Nest CLI](https://docs.nestjs.com/cli/usages)

### 4.3 六个库使用 tsdown 脚手架

逐个执行下面的交互式脚手架，在目标目录提示中选择对应包路径：

```bash
pnpm create tsdown@latest
```

| 目标 | 模板 / 配置要求 |
| --- | --- |
| packages/protocol、compiler、runtime、pure-functions | TypeScript 库模板，无框架和浏览器全局依赖 |
| packages/renderer-react、materials-react | React 库模板，React 外置，公开类型与必要样式产物 |

每次先查看目标 `.gitkeep`；若生成器要求空目录，仅移除已核实的占位文件，不使用强制覆盖。脚手架支持跳过安装时先跳过；若自动安装，则检查并统一回根锁。不要在根运行库脚手架并接受覆盖根目录。生成示例只作骨架，随后替换为已确认模块职责，不把示例 API 发布为正式协议。[tsdown 脚手架](https://tsdown.dev/guide/getting-started)

### 4.4 工具初始化与依赖安装

先在根运行官方 ESLint 配置生成器，选择 TS、ESM 和 pnpm；生成后按路径拆出核心 / React / Next / Nest 配置。Prettier / TS 共享选项及边界规则是项目配置，沿用脚手架基础再整合。

```bash
pnpm create @eslint/config@latest
pnpm add -Dw turbo@latest typescript@latest @types/node@latest
pnpm add -Dw eslint@latest @eslint/js@latest typescript-eslint@latest eslint-config-prettier@latest
pnpm add -Dw eslint-plugin-react-hooks@latest eslint-plugin-jsx-a11y@latest
pnpm add -Dw prettier@latest husky@latest lint-staged@latest @commitlint/cli@latest @commitlint/config-conventional@latest
pnpm add -Dw @changesets/cli@latest dependency-cruiser@latest
pnpm add -Dw vitest@latest @vitest/coverage-v8@latest
```

上面是首次整合的工具清单，不要求重复安装脚手架已正确声明的包。根共享工具由根配置导入；子包本地配置直接导入的工具、实际运行时依赖必须在对应清单声明，不能依赖偶然提升。以下把库构建依赖声明到六包，把组件测试依赖声明到两个 React 包：

```bash
pnpm --filter './packages/*' add -D tsdown@latest typescript@latest
pnpm --filter './packages/*react' add -D @types/react@latest @types/react-dom@latest
pnpm --filter './packages/*react' add -D @testing-library/react@latest @testing-library/user-event@latest @testing-library/jest-dom@latest jsdom@latest
```

React / ReactDOM 使用脚手架生成的 peer 与开发依赖分工，安装时通过对应包的 `pnpm add …@latest` 补齐，实际兼容范围由联验确定；不把 React 打进库。Nest 若需 SWC，按生成配置与[官方 Vitest / SWC 接入](https://docs.nestjs.com/recipes/swc)补齐：

```bash
pnpm --filter './services/api' add -D vitest@latest @vitest/coverage-v8@latest unplugin-swc@latest @swc/core@latest supertest@latest @types/supertest@latest
```

编译与测试配置必须实际启用 metadata 支持，仅安装 SWC 不等于接入完成。若最新模板已经正确处理，可保留其有效配置并去除冗余步骤。[ESLint 初始化](https://eslint.org/docs/latest/use/getting-started)

### 4.5 组件与样式初始化

```bash
pnpm dlx shadcn@latest init --cwd apps/playground
pnpm dlx shadcn@latest add button input label --cwd apps/playground
```

使用已存在的 Next 项目，不让 shadcn 再生成一套 Monorepo 或额外 UI 包；选择 CSS Variables。实施细化采用当前 CLI 默认的 Base UI / base-nova，已通过按钮、Label、受控输入及三浏览器联验；这只是当前默认组件实现，不扩展为新协议语义。引入图标、类名合并与变体工具时沿用脚手架实际生成的依赖，通过 pnpm 更新，不预先重复安装另一套。

Playground 的页面控件统一使用本地 shadcn/ui 组件（包括 Input、Button、Label），不以物料包的工程样例输入控件充当应用组件库；物料包及独立 CSS 的交付能力继续通过包测试和隔离消费者验证。当前只初始化轻量 UI 基础。默认物料开发时在 materials-react 内按同一基础组织源码及样式，不从 apps 反向导入，不新增公共 UI 包；记录生成来源与本地修改。Tailwind / PostCSS 配置沿用最新 Next 脚手架，避免复制旧版配置样板。[shadcn CLI](https://ui.shadcn.com/docs/cli)

### 4.6 测试、Hook 与版本工具初始化

```bash
pnpm create playwright@latest
pnpm exec playwright install
pnpm exec husky init
pnpm exec changeset init
pnpm exec depcruise --init
```

Playwright 选择 TS、测试目录 `tests/e2e`，已有 CI 时不覆盖；检查其依赖落在工作区根。Husky 的默认 Hook 改为暂存文件检查，commit-msg 使用 commitlint；不要把全仓 build / E2E 放进提交 Hook。Changesets 只建立管理配置，不运行 version / publish，不将脚手架默认包版本解释为正式发布版本。dependency-cruiser 的初始规则须补充本项目边界。[Playwright](https://playwright.dev/docs/intro)、[Husky](https://typicode.github.io/husky/get-started.html)、[Changesets](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)、[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)

### 4.7 模板依赖更新与首次安装收口

所有清单生成并统一以后执行；这是主动升级步骤，不放进常规 install / postinstall。以下是原始全 latest 流程；当前已发现 TS / ESLint 兼容冲突，应使用第 10 节的 `pnpm toolchain:update`，不要直接把冲突项升到不兼容 latest：

```bash
pnpm -w update --latest
pnpm -r update --latest
pnpm install
pnpm list -r --depth 0
pnpm outdated -r
```

根和子包分别更新，审查 diff，确认模板遗留版本范围没有阻止 latest。更新内部 workspace 关系、peer 范围或重大版本时须额外审查。核对 Next / React / ReactDOM / 类型声明、ESLint / 插件、TS / 编译器、Vitest / coverage、Nest / SWC 的兼容；不可用时如实记录，不手写一个旧版本冒充最新。收口后提交唯一锁文件和实际生成清单，再用 frozen install 重验。

内部包通过实际生成的包名添加：`pnpm --filter <消费者路径> add '<实际包名>@workspace:*'`。尖括号是需替换的占位，不直接执行；按已确认依赖图逐项添加，不能全包互相连接。

## 5. pnpm 脚本与任务编排 {#engineering-tasks}

下表脚本现已落地，实际定义以根 package.json 和对应包为准。初始化依赖使用 create / dlx / add；日常任务使用已安装工具的 exec 或 scripts，不在 CI 临时 dlx latest。

| 根入口 | 行为与前置 |
| --- | --- |
| pnpm dev | 直接启动轻量 Playground，通过包名解析工作区源码；不要求预构建库或后端 |
| pnpm dev:api / dev:all | 启动 API / 显式联调，服务端口与环境有独立配置 |
| pnpm build | turbo run build，消费者依赖上游 build |
| pnpm typecheck | turbo run typecheck；依赖公开声明时先完成上游 build；Next 先生成当前框架所需类型 |
| pnpm lint | ESLint，包含分域配置；以零 warning 作为收口目标 |
| pnpm format / format:check | prettier 写入 / 只检查；不与 ESLint 格式规则冲突 |
| pnpm boundaries | 依赖图、禁止导入及清单 / exports 边界检查 |
| pnpm test / test:integration | Vitest 单次运行 / 跨包用例，watch 另设 test:watch |
| pnpm test:e2e | Playwright，CI 使用生产构建，管理服务启动和清理 |
| pnpm packages:check | pack 后隔离安装，验证 JS / d.ts / exports / CSS / 框架外置 |
| pnpm docs:check | 现有 Python 构建 --check；文档环境按 docs/README 准备 |
| pnpm check | format:check、lint、boundaries、typecheck、test、integration、build、packages:check、docs:check；E2E 在 CI 另设必需任务 |

Turborepo 按依赖执行，根聚合脚本不得回调自身形成递归。各库 build 输出 dist，Next 申明 .next 产物且排除可变缓存目录，Nest 申明服务产物。检查配置、锁、环境变量和生成源纳入任务输入；dev 设 persistent 且不缓存，E2E、外部服务和不确定测试首期不缓存。缓存正确性先于远程缓存；冷缓存构建必须通过。dev 不执行库预构建或 tsdown watch；通过 exports 的 development 条件读取源码，由 Next 与 Node 开发加载链监听。单元测试与开发类型检查也不依赖 build；Turbo 的 source 传递节点将上游源码变化纳入缓存键。生产 build 仍按 ^build 构建依赖，不能把开发源码验证代替产物验收。

所有安装 / 初始化入口均由 pnpm 调用；如果后续希望合并为 bootstrap 脚本，包装以上命令并检测已有工程状态，不能每次运行都重建项目或拉取 latest。

## 6. 构建、类型与样式契约 {#engineering-contracts}

- ESM 优先，公开 JS、d.ts 和 Source Map；CJS 仅在出现真实消费者时补充及验证。Next / Nest 各自构建，不能用统一 tsconfig 覆盖框架所需模块解析或装饰器选项。
- TS 开启 strict、noUncheckedIndexedAccess，逐包处理框架必要差异；核心限制 Node / DOM 专有全局，服务与 React 使用各自环境配置。异常 any / ts-ignore 必须有理由和覆盖场景。
- 普通包不跨源码路径 alias 导入，始终经包名及 exports 消费：开发 / 单元与工作区集成测试使用 development 源码入口，生产构建和隔离打包消费者使用默认 dist 入口；生产依赖顺序包括类型产物。Compiler 在 Node 侧不加载 React；已发布表单运行不带 Compiler / Studio / 平台在线依赖。
- React 为 peer，应用负责装配；Manifest 可独立消费。Next 客户端边界只包住需要交互的组件，Runtime 生命周期不放进共享服务端可变单例；不在本轮增加应用状态库。
- 样式以语义 CSS Variables 表达主题和错误状态，Tailwind 用于常规布局 / 变体，CSS Modules 补复杂局部样式；默认物料提供独立 CSS 入口，Host 无需扫描包源码才能正常呈现。
- 物料不默认向 Host 注入全局 Reset；处理 Token 命名、样式范围、Portal 主题继承、层级与 CSS sideEffects。Renderer 不强制默认 CSS；样式依赖属于物料交付。
- 不从 L1 拼接任意 Tailwind 类名；静态变体使用完整可检测类，动态值使用受控 CSS 值。Tailwind 跨包扫描和浏览器范围要显式验证，不能沿用旧版本默认假设。[类检测](https://tailwindcss.com/docs/detecting-classes-in-source-files)、[兼容说明](https://tailwindcss.com/docs/compatibility)
- 不把 React Hook Form / Ant Design Form 等状态系统引入引擎内部替代 Runtime；确认型组件内部状态沿用既有物料契约。

## 7. Git、提交与版本管理 {#engineering-git}

采用主干开发：main + 短生命周期分支 + PR + Squash Merge，不建立长期 develop。分支使用 feat/、fix/、refactor/、docs/、chore/；一次 PR 聚焦可审查目标，大任务拆成可工作增量。主干禁止强推，合并基于当前检查结果；多人时至少一位其他维护者审查，个人阶段保留自审与自动门禁。

Conventional Commits 用英文类型 / scope、可用中文描述：

```text
feat(runtime): 支持数组项移动
fix(renderer-react): 清理改绑前的订阅
chore(tooling): 初始化工作区
```

破坏性变更使用 `!` 或 BREAKING CHANGE，PR 标题同样检查，保证 Squash 后历史有效。commit-msg 由本地 commitlint 检查，CI 校验 PR 标题及必要提交信息；Hook 可绕过，因此不能代替 CI。[规范](https://www.conventionalcommits.org/en/v1.0.0/)、[commitlint](https://commitlint.js.org/guides/local-setup.html)

Changesets 在出现对外库变更时记录影响和理由；内部工具 / 文档改动允许明确无包发布影响。应用 / 服务保持 private；需要维护应用发布身份时另行定义。包版本不替代 L1 / Prepared / 能力锁的独立兼容规则；初始生成版本不表示已发布。发布工作流以后单独授权接入凭证与发布，不把 build 自动等同 npm publish。

## 8. 质量门禁、测试与环境治理 {#engineering-gates}

| 时机 | 检查与标准 |
| --- | --- |
| 编辑器 | 格式化、Lint、类型提示，使用仓库配置 |
| pre-commit | lint-staged 对暂存文件检查 / 格式化，不全仓编译和 E2E |
| commit-msg | commitlint |
| PR 必需检查 | frozen install、格式、Lint、类型、依赖边界、单元 / 集成、构建、产物消费、文档同步 |
| PR 关键链路 | 真实浏览器 E2E，API 启动 / 请求，依赖图受影响范围覆盖消费者；首期规模小先全量执行 |
| 发布前 | 完整回归、Changesets / API / 兼容与制品检查；只有存在真实发布流程才启用发布 |

质量任务失败阻止合并，取消或跳过不等于通过；统一汇总必需结果，避免路径过滤导致必需检查永久 pending 或误通过。Next build 不承担独立 Lint 门禁。CI 优先 GitHub Actions，实际托管未确认时不声称分支保护已设置。部署、数据库、鉴权、Platform 状态管理、完整监控、Storybook 和远程缓存不作为本轮底座前置。

测试分层：模块测试随包；跨包在 tests/integration；React 使用 Testing Library；Nest 使用实际模块注入与 HTTP 验证；Playwright 操作真实 UI。异步结果顺序可控，不靠固定 sleep；记录时区、随机种子和时钟策略。失败保留报告、Trace 和必要截图，避免敏感业务值，重试不能掩盖不稳定用例。覆盖率先采集、按已有核心分支设门槛，不对空包设置虚高百分比。

环境提供 .env.example，启动校验必需变量，区分浏览器公开值与服务秘密；约定端口和退出清理。Node / pnpm 固定执行版本，本地 / CI 一致。安装脚本按需许可；密钥不入库，依赖升级 PR 经过同一门禁，许可证和高风险依赖问题有明确处理记录。CI 的第三方 Action 选择受维护稳定来源，实施时固定实际提交身份，后续自动更新，不在本文预填版本。

现有 Python 文档环境继续按 [维护说明](../README.md)准备；不能由 Node 安装替代。协议样例有变更另跑 run_validation.py，当前工程文档变化不修改样例。

## 9. 实施批次、验收与未决项 {#engineering-acceptance}

| 批次 | 交付 | 必须证明 |
| --- | --- | --- |
| E1 根环境 / 工作区 | CLI 生成根清单、工作区、根工具与锁 | 新检出 frozen install；环境一致且仅有根锁 |
| E2 项目脚手架 | Next、Nest、六包按官方模板生成并整合 | 冷构建、Nest 注入 / HTTP、Next 启动、各库类型与产物正确 |
| E3 UI / 测试 / 约束 | shadcn、Tailwind、Vitest、Playwright、边界、Hook、Changesets | UI 轻量样例、真实输入、跨包 watch、故意违规能被门禁识别 |
| E4 CI / 文档 | 统一脚本、必需任务与开发说明 | 干净环境复跑全部检查，失败证据可定位，初始化记录与锁同步 |

工程底座完成须同时满足：Next 消费一个工作区库；Nest 通过真实依赖注入 / 请求；库更新反馈到应用；隔离 React Host 能加载物料和 CSS，Node 消费 Compiler / Manifest 不加载 React；exports 与声明可用。先用明确标注的工程样例验证，不要求凭空实现完整 L1–L4，也不把模板默认测试通过计为引擎行为验收。

协议结构源后续已确认原生 TS 类型 + JSDoc → 自动生成 JSON Schema，Compiler 使用 Ajv，见 [ADR-FE-015](decisions/ADR-FE-015-protocol-source.md)。具体生成器、严格生成配置与正式最低浏览器 / 库运行环境范围仍需在对应实现前闭合；默认组件基础已按实施细化采用 Base UI，三种当前测试浏览器通过不等于历史版本最低范围已确认。预算、发布平台、Platform / Studio 及各层既有 OD 保持原状态。

当前状态：E1–E4 工程配置与本地验证已完成，远端 CI / 受保护分支尚未运行或配置；不对外发布。核心业务按[既有 T01–T07](governance.md#design-roadmap)准备契约与纵切，不因工程文档存在提升模块完成度。


## 10. 初始化实施记录与日常使用 {#engineering-implementation}

### 已落地范围

根清单使用 pnpm init；Next 使用 create-next-app；Nest 使用 Nest CLI；六个库使用 create-tsdown（四个 minimal、两个 React 模板）；ESLint / Playwright / Husky / Changesets 使用官方初始化器。dependency-cruiser 初始化器识别已有配置后保留本项目规则；没有为它生成第二套配置。移除模板重复 Playground、占位发布身份和不采用的检查工具，保留生成配置并按框架要求整合。

所有包当前 private，根生产入口保持空导出。跨包验证示例在 `./engineering` 子入口；它们只验证工程接入，不定义 Definition / Prepared 或假设生产 Runtime 已实现。materials-react 独立导出 styles.css，使用 tsdown 原生 copy，开发脚本显式监听 src；源样式无需 Host 的 Tailwind 扫描。React 库构建保留 use client，React 本身外置。

脚手架调用的版本 / 选项由执行日志核对：create-next-app 16.4.2、Nest CLI 通过 latest 调用（首次缓存输出 12.0.8，项目 CLI 后续已更新）、create-tsdown 0.23.1、ESLint create-config 3.0.0、create-playwright 1.17.139、shadcn CLI 4.22.1。以下表格是安装后的**事实记录**，不是人工预填的依赖声明；清单与锁由 pnpm 生成。

| 工具 | 本地实际版本 |
| --- | --- |
| Node / pnpm | 24.22.0 / 12.14.0 |
| Next / React | 16.4.2 / 19.3.1 |
| Nest Core | 12.2.0 |
| TS / ESLint | 6.0.3 / 9.39.5 |
| Turborepo / tsdown | 2.11.9 / 0.23.1 |
| Vitest / Playwright Test | 5.0.5 / 1.64.1 |
| Tailwind / Base UI | 4.3.3 / 1.9.0 |

### 实际兼容问题与处理

- 全 latest 首次安装失败：typescript latest 为 7.0.2，而 typescript-eslint 声明支持范围小于 6.1；jsx-a11y 尚不支持 ESLint latest 10。用户明确确认允许按工具 peer 范围自动解析最新兼容稳定版。`tools/engineering/install-toolchain.mjs` 从注册源读取范围与版本，选择 TS / ESLint / 同主版本 @eslint/js，其余请求 latest；不关闭 strictPeerDependencies，不使用强制覆盖。
- Nest 模板的旧 Vitest 与其他包新版本冲突，已统一 latest Vitest / coverage，测试转换显式保留装饰器元数据；单元和实际 HTTP 测试均通过。
- tsdown 的实际输出为 ESM .js / .d.ts，exports 已按产物校正。隔离临时消费者打包安装全部六包，验证 JS、React / 核心类型及独立 CSS；未发布包通过临时 tarball overrides 映射，不能访问工作区源码。
- dependency-cruiser 当前路径插件对无 baseUrl 的 Next alias 解析不同，使用仅供分析的 tools/config/tsconfig.boundaries.json 适配，应用 TS 配置保留脚手架方式。边界正例、核心反向导入和应用绕过 exports 的反例均验证。
- 删除无使用需求的 shadcn CLI 常驻依赖及其额外通用样式导入，保留 CLI 生成的组件、Token 和 Tailwind；后续仍通过 pnpm dlx shadcn@latest 添加组件，并审查生成差异。构建不依赖远程 Google Fonts。
- `pnpm audit --prod --audit-level high` 未发现已知漏洞；全量开发依赖审计仍报告 eslint-config-next → fast-glob / micromatch → braces 的 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，当次审计无补丁版本。未 override 或隐瞒该结果；CI 的阻断审计针对生产依赖，开发工具问题保留跟踪，升级时复查。

### 日常命令

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:api
pnpm check
pnpm test:e2e
```

`pnpm dev` 直接启动 Next，默认应用端口 3000；不预构建六包、不启动库 watch。六包 exports 的 development 条件先于 types / import，指向 src 的公开入口；CSS 也按条件解析到源样式。Next 通过 transpilePackages 编译工作区源码，TypeScript 的 customConditions 与 Vitest 的 resolve.conditions 使用 development。生产应用构建不启用此条件，继续读取 dist。pnpm pack 通过 publishConfig.exports 覆盖为纯产物入口，避免下游应用开发时误找未发布的 src；隔离 tarball 消费同时验证默认与 development 两种条件。此机制依据 [pnpm publishConfig](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/package_json.md#publishconfig)。若本机其他项目占用端口，可执行 `PORT=3210 pnpm dev`；Turbo 显式传递 PORT / API_PORT / HOST。API 默认回环 3001，可用 `API_PORT=3211 pnpm dev:api` 修改。`dev:all` 显式联调；不会隐式连接 Platform 或外部服务。退出使用 Ctrl+C，子任务随 Turbo 清理。

Nest 的 dev / start:dev / start:debug 使用 Node --watch、--conditions=development 和 services/api/dev-loader.mjs。加载器用已安装的 @swc/core 转换 TS / TSX，保留旧式装饰器和元数据，并将源码内部的相对 .js import 解析到对应 .ts；这只用于开发，不接入生产启动。生产仍由 nest build 生成 dist/main.js，再用 Node 执行。Nest 的开发类型检查使用独立 tsconfig.dev.json，生产 tsconfig.build.json 保持产物解析。后端新增工作区依赖仍须在 package.json 正式声明，不能因根工作区能够解析就省略。

E2E 必须先有生产构建，测试启动独立的 Next 3100 / API 3101，拒绝复用已有服务；端口占用时先选择其他测试端口，不终止用户服务。测试已覆盖 Chromium、Firefox、WebKit，shadcn 输入 → 回显 → 清空、组件样式和生产 API 响应。单元与集成另覆盖 React 输入、Renderer 接入、核心包公开源码入口、依赖负例及 Nest 注入 / HTTP；未实现核心机制不计入通过范围。

新环境首次跑浏览器测试前执行：

```bash
pnpm exec playwright install chromium firefox webkit
pnpm build
pnpm test:e2e
```

Python 文档环境仍按 docs/README.md 准备；CI 已配置相同步骤。`pnpm check` 只检查文档同步，不暗中改写生成物；正文变更后先 `pnpm docs:build`。格式化忽略现行设计 / 生成阅读页、Python 工具及框架生成的 next-env.d.ts，保持各自维护体系。

主动升级使用 `pnpm toolchain:update`，不重新运行项目脚手架；查看 diff 与兼容报告，复跑 pnpm check 和浏览器测试后再接受新锁。Git Hook 已接入 lint-staged / commitlint，Changesets 已初始化但无包发布动作。CI 文件使用执行时查询到的最新官方稳定 Action，并固定实际 SHA；Dependabot 提供后续升级 PR 配置。远端 CI、分支保护、PR 审查人数与部署权限仍需在真实托管仓库启用，未声称已运行。

本地验收包含：冷构建、类型检查、Lint / 格式、单元 / 集成、正反依赖边界、frozen install、隔离 tarball / 类型 / CSS 消费、三浏览器 E2E；开发模式实际移走六包 dist 后验证 Next 渲染与跨包源码更新，浏览器验证 CSS 热更新及输入交互；Nest 验证装饰器依赖注入、本地与间接工作区源码修改触发重启，探针均恢复。工程审查发现的 CSS watch、缓存输入与应用源码越界问题已修复及复验。完整引擎语义、最低历史浏览器兼容与 Platform / Studio 仍按既有任务推进。


## 协议包进入开发的基线 {#protocol-development-ready}

2026-10-21 用户确认先按[完整协议基线](l1/08-decisions-release.md#protocol-development-baseline)实施，遇真实消费者问题再演进，不逐字段反复讨论。保持现有工程工具链、三领域与 JSDoc / Schema 派生路线；生成器适配、命名、容器、错误码及构建接入由实现者整理并验证，实际冲突才重开设计。首批是完整类型及对应 Schema / 正反例，不代表 Compiler / Runtime / Flutter 已实现或正式版本已发布。

## Protocol 首批实现与本地交付证据 {#protocol-implementation}

2026-10-21 先将完整设计基线提交为 8eeb321，再在 codex/protocol-contracts 实现。packages/protocol 现有 definition / capability / prepared 公共类型入口、JSDoc 与 10 个自动生成 JSON Schema 根资源，继续 private / 0.0.0；engineering 子入口保留原工程验证用途。Compiler / Runtime 算法、具体物料与纯函数实现不在本轮。

生成器通过 pnpm latest 安装并锁定 ts-json-schema-generator 2.9.0、Ajv 8.20.0；测试 Node 类型为 26.6.5。生成器输出 draft-07，本地 scripts/schema-dialect.mjs 仅转换它实际使用的 definitions / 本地引用 / tuple 为 2020-12，按 Schema 位置递归，不扫描 const / default / examples 普通数据。比较过的 json-schema-migrate 2.0.0 实测未将该输出的 definitions 与方言完整迁移，已移除；这属于实施适配，不新增结构源或通用生成平台。转换有递归 / tuple 等价与 Literal 保留测试，所有根输出经 Ajv2020 严格编译，嵌入 JsonSchema 引用标准 2020-12 meta-schema。

```bash
pnpm --filter @form-engine/protocol schema:generate
pnpm --filter @form-engine/protocol schema:check
pnpm --filter @form-engine/protocol typecheck
pnpm --filter @form-engine/protocol test
pnpm --filter @form-engine/protocol build
```

生成文件集中在包内 schemas，不手改，不让 Prettier 另行重排；schema:check 比较确定性输出。根 pnpm check 在 build 前先执行 protocol:schema:check，避免构建自动刷新文件掩盖未同步的提交。Turbo build 缓存包含 schemas，打包 files / exports 包含三领域类型 / 空运行入口与 Schema 资源；消费类型不加载 Ajv / 生成器，二者只是开发依赖。生产源保持无 Node / UI 依赖，Node 测试使用独立 tsconfig.tests.json。

pnpm check 已实际通过：格式、Lint、边界、全仓构建 / 类型 / 测试、跨包与 HTTP 集成、六包隔离 tarball 消费、文档同步。隔离消费者验证三领域的 JS / .d.ts、Schema 子路径、生产与 development 条件，并通过负类型样例拒绝 Event 作为命令写入目标。包内正反例覆盖递归 ValueSpec、Literal、严格 Union、数组位置、Authoring 隔离、嵌入 Schema、物料 / Host 和 Prepared。未改应用交互，本轮未运行浏览器 E2E；未修改 docs/validation 候选源或将其报告升级为正式契约证据。

完整字段的交叉引用、Scope 绑定、签名兼容、规则前置、计划 ID / 资源闭包、锁与格式装载检查属于 Compiler / Runtime 后续消费验证；结构测试通过不证明这些算法已实现。Prepared 测试对象是手写夹具，不是 Compiler 生成结果。本次首次实施及范围见 [SRC-PROTOCOLIMPLEMENTATION](source-map.md#src-protocolimplementation)。

提交前审查复现并修复两项问题：Authoring bind 改为复用 JsonPointer 约束，拒绝 name / 非法 ~ 转义，注释明确规范化尚未实现；完整检查在构建前拦截失步 Schema。实际临时改动生成文件后验证 pnpm check 提前失败且不重写文件，再恢复原文。Protocol 的 28 个用例通过，最终全仓检查随提交前复验。
