---
title: 审核与治理
description: 控制室、Issue 队列、链接健康检查与维护者权限。
order: 4
updated: 2026-11-22
---

# 审核与治理

管理工具是一个直接调用 GitHub API 的静态页面。没有独立数据库，也没有服务端会话。维护者使用 GitHub 登录，写操作使用维护者自己的令牌，并完整记录在仓库审计日志中。

从账号菜单打开 **控制室**，或访问 `/en/admin/` / `/zh/admin/`。

## 谁算维护者？

UI 会调用 `GET /repos/{owner}/{repo}`，只有令牌具有 `push`、`maintain` 或 `admin` 权限时才显示管理操作。每次写入都由 GitHub API 本身再次检查。把某人写进 `PUBLIC_ADMIN_LOGINS` 不会授予权限，只影响界面提示。

如果仓库属于组织，具有写权限团队的成员可以审核。控制室可以合并 Pull Request，但仍然应该先审阅。

## 队列

| 标签页 | 标签 | 用途 |
| --- | --- | --- |
| 举报 | `dataset-report`、`report` | 失效链接、错误元数据、许可证或隐私问题 |
| 更正 | `dataset-correction` | 结构化元数据更正 |
| 数据健康 | `link-health`、`data-error` | 自动化可达性与 Schema 告警 |
| Pull Request | 任意开放 PR | 数据集提交、更正与封面处理 |

卡片显示 Issue 标题、作者、时间与标签。维护者可以评论、关闭/重新打开 Issue，并 squash 合并 PR。非维护者可以查看公开队列，但不能写入。

## 链接健康

定时的 `link-health.yml` 工作流会检查 `access.links` 与 `usage.examples` 中的每个 URL。

- 使用带超时与浏览器 UA 的 HEAD/GET 请求。
- 持续 DNS 失败、4xx 与 5xx 会被报告。
- GitHub API 与部分站点会拦截自动检查，这类情况标记为“需人工检查”，而不是失败。
- 链接失效时，创建或更新 `link-health` Issue，并列出受影响的 slug。
- 重复告警会合并到一个开放 Issue。

工作流不会自动删除条目。一个镜像失效时，可能仍有其他下载可用，由维护者决定。

## 审核清单

- 许可证是否覆盖归档中的所有文件？
- `redistributionPermitted` 与访问类型是否一致？
- 封面是否有权展示？
- 版本、episode 数、大小与时长是否合理？
- 已知限制是否具体、诚实？
- 下载链接是否无需私有凭据即可访问？
- JSON 是否通过校验？
- 三个隐私问题是否都已回答？

## Reactions 与评论

每个已发布数据集都有对应的 GitHub Issue，用于 Reactions。定时社区工作流把 reaction 与评论数快照到 `data/community/stats.json`，静态展示在页面上。已登录用户可以添加或移除真实的 👍；未登录用户会被送到 GitHub 操作。

评论使用 Giscus 和 GitHub Discussions。需要由站点维护者通过 `.env.example` 中列出的仓库变量配置 Giscus。未配置时，页面显示指向 Discussions 的回退链接。

## 审核原则

1. **数据归作者所有。** 目录是路标，不是重新托管平台。
2. **不静默删除。** 使用弃用与历史记录。
3. **隐私优先于方便。** 同意不明确时，限制访问。
4. **署名不可省略。** 第三方地图、模组与建筑必须注明。
5. **自动化只提议，人类负责合并。**
