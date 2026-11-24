## Implementation
JSON 使用既有 token 格式化器，readOnly 派生格式化值，编辑模式切换只在文本变化时更新；FormEditor 按去空白后的内容判断是否失效检查结果，格式化不制造未保存语义。

表单工作台使用 studio-immersive 占满页面宽度，移除全局侧栏 / 顶栏及账号操作；原返回 leave 防护和工作台配置 / 历史 / 发布标签保留。检查面板保留新标签页目录参考链接，不抢占编辑区。

分类元数据由工程资产文件与包身份生成，通过目录 API 展示。用途 category 与实现 implementation 分开；当前 React 与 JavaScript，选项从真实返回条目派生。未接入框架不显示空壳条目，未知分类明确标注。文档版本不匹配时整组元数据不沿用。

物料详情附带已安装 0.1.0 契约对应的独立示例，使用既有 checkWebConfig 编译、PreviewRuntime 渲染，涵盖所有 14 项当前物料。Runtime 种子数据独立、重置通过 key 重建并 dispose 旧实例，Host 请求 / 按钮事件使用现有模拟能力。未来版本不自动套用旧示例，无示例明确提示。暂无制品上传或 Vue / Flutter Runtime 实现，分类扩展不宣称这些实现已存在。

全局 header 与 hover 样式限制到 Studio 外壳，避免污染物料。短 JSON 自适应高度，长内容区域内滚动。发布名称已有行为沿用，本轮验证长名称显示与各页面宽高。

## Review and evidence
独立 reviewer 只读审查分类版本一致性、格式化副作用、导航和预览生命周期；已修复过期元数据、无变化时清除检查结果及固定高度覆盖问题。最终执行结果记录在 tasks.md。
