---
title: 数据契约
description: JSON Schema、标签词表、Mwarecorder 数据流布局与加载约定。
order: 2
updated: 2026-11-22
---

# 数据契约

目录只存储元数据 JSON，不托管数据本体。一个条目应该让新用户足以判断这份数据是否值得下载，以及如何加载。

权威 Schema 位于 [`schemas/dataset.schema.json`](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/blob/main/schemas/dataset.schema.json)。每个 Pull Request 和每次构建都会执行校验。

## 双语字段

标题、短描述、使用说明与历史记录都是对象：

```json
{
  "title": {
    "en": "Skyblock Dawn — Builder Starter Pack",
    "zh": "空岛晨曦 · 建造入门数据集"
  }
}
```

至少需要一种语言。如果当前语言缺失，网站会回退到另一种，并显示 **“该内容暂无中文翻译”** 提示。slug、License、格式和标签使用受控 slug，而不是自由文本。

## 标签词表

[`data/tags.json`](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/blob/main/data/tags.json) 是以下字段的唯一事实来源：

- 格式、环境、校验状态与数据流；
- 任务、维度、训练用途与质量标注；
- License、访问类型、链接类型与贡献者角色。

标签存 slug，通过双语显示名呈现。这样避免同义词泛滥（`imitation learning`、`imitation-learning`、`IL`……），也让 URL 筛选保持稳定。

## Mwarecorder 布局

Mwarecorder format 2.0 的 episode：

```text
episode_YYYYMMDD_HHMMSS/
  metadata.json
  state.jsonl
  action.jsonl
  event.jsonl
  frames.jsonl
  frames/
    frame_000001.jpg
    ...
  summary.json
```

所有记录共享 `sample_tick`。tick `t` 的训练样本可以组合 `frames.jsonl` 映射的帧、`t` 时刻的状态与动作，以及同一 tick 的事件。

标准转换器输出 `observations.npy`、`actions.npy`、`dones.npy`、`sample_ticks.npy` 与对齐元数据。校验器会检查结构、对齐、维度切换、帧存在性与 summary 计数。请在 **校验状态** 中填写校验结果，并在 **已知限制** 中说明例外。

## 非 Mwarecorder 格式

| 格式 | 需要链接什么 | 需要说明什么 |
| --- | --- | --- |
| 回放 / Demo | `.mcpr` 或渲染归档 | Minecraft / ReplayMod 版本、抽帧方式 |
| 原始视频 | MP4/MKV 或帧归档 | 分辨率、FPS、HUD/裁剪、没有动作标签 |
| 自定义数据集 | HDF5、NPZ、Parquet、WebDataset… | Schema、划分文件、通道、对齐假设 |

对于自定义格式，最好在 **如何加载** 中提供简短加载示例。这经常决定一份数据是被真的使用，还是被收藏后遗忘。

## 访问与合规

访问类型只能三选一：

- **公开下载**：公开链接，且许可证明确允许复用。
- **申请访问**：提供申请链接或联系方式，不要链接到私有令牌。
- **受限**：仅预览，或需要满足特定条件。

请如实回答隐私三问：

1. 数据是否包含玩家个人数据（名字、聊天、皮肤、账号标识）？
2. 是否包含第三方内容（地图、模组、音乐、他人的建筑）？
3. 你是否有权再分发？

公开下载时第三个问题必须为 `true`。如果不是，请改为申请或受限访问。

## 版本、弃用与替代

`history` 数组记录发布与更正。数据集被替代时：

```json
"deprecation": {
  "status": "superseded",
  "replacedBy": "the-new-dataset-slug",
  "note": {
    "en": "Use the new verified version instead.",
    "zh": "请使用新的已校验版本。"
  }
}
```

网站会显示提示条，并直接链接到替代者。弃用记录不会被删除，以保证可复现性，但不会再进入精选位置。

## 大小与日期格式

`scale.bytes` 是字节数，`scale.durationSeconds` 是秒数。UI 使用 `Intl.NumberFormat` 格式化。请存真实数值，不要存 “~30 GB” 这样的预格式化字符串。日期使用 `YYYY-MM-DD`。

## 本地校验

```bash
pnpm validate:data
pnpm build
```

第一条检查 JSON Schema、标签词表、封面尺寸、2 MB 限制与弃用关系引用。第二条还会运行 `astro check`，然后生成网站。
