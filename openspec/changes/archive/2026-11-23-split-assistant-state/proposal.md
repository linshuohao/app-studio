# 分离会话和草稿

## Why

旧会话行同时承载聊天、诊断、候选和手工工作稿。删除会话会删除草稿，且 API 每轮必须重放和解释 Agent 历史，造成生命周期、版本与维护职责耦合。

## What Changes

依据 ADR-FE-036 迁移全量会话、工作稿与交付记录，切换 Agent、API 和 Studio 读写路径。

## Impact

两个独立 PostgreSQL 数据域、内部调用、Studio 创建和已保存表单入口、离线迁移与验收。
