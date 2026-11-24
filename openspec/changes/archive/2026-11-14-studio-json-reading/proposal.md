## Why
用户逐页 review 后要求配置粘贴和读取格式化、可逐层阅读，允许保存时去掉空白。现有接近16KiB配置在格式化后超限，只读历史保持单行，无法正常阅读。
## What Changes
依照 docs/design/platform-studio.md#authoring-pages，分离阅读与传输格式，提供文本/层级模式，保留原token语义及无效原文；浏览历史保留当前缓冲。其余页面本轮只审查，不声称已修复全部UX问题。
