# 空白地热搜榜

一个适合 GitHub Pages 的静态小站：匿名投稿、人工审核上榜、无评论、只有点赞和踩。

## 文件

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：搜索、排序、投稿、点赞/踩
- `config.js`：投稿和投票接口配置
- `data/hotlist.json`：已审核热搜内容

## 发布到 GitHub Pages

1. 把这些文件放进你的 GitHub 仓库。
2. 进入仓库 `Settings` -> `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. 分支选择 `main`，目录选择 `/root`。
5. 保存后等待 GitHub 生成 `https://你的用户名.github.io/仓库名/`。

如果仓库名是 `你的用户名.github.io`，网址会是 `https://你的用户名.github.io/`。

## 审核上榜

站点只渲染 `data/hotlist.json` 里的内容。收到投稿后，把你同意上榜的条目添加到这个文件，再推送到 GitHub。

新增条目格式：

```json
{
  "id": "unique-id",
  "title": "热搜标题",
  "project": "企划名",
  "summary": "一句话概要",
  "tags": ["招募", "活动"],
  "approvedAt": "2026-07-11T12:00:00+08:00"
}
```

`likes`、`dislikes`、`heat`、`trend` 都不用手填。页面会把未投票的新热搜当作 0 净热，默认排序按 `点赞 - 踩`，点赞排序按纯点赞数。

从 Supabase Table Editor 复制出来的投稿通常会长这样：

```json
{
  "idx": 0,
  "id": "b72c7c88-081b-45ba-8a9f-f6bb76992445",
  "title": "设计师的恶趣味",
  "project": "空白地",
  "summary": "希望大家喜欢设计师给大家的礼物～",
  "tags": ["#设计师", "#空白地"],
  "link": null,
  "reason": "给站主看的审核理由",
  "client_id": "anon_xxx",
  "status": "pending",
  "created_at": "2026-07-11 16:22:29.454855+00"
}
```

复制进 `data/hotlist.json` 时，只保留 `id`、`title`、`project`、`summary`、`tags`，把 `created_at` 改名为 `approvedAt` 就够了。页面也会自动处理标签开头的 `#`。

## 投稿和点赞配置

GitHub Pages 只能托管静态文件，不能自己保存投稿或全站点赞数据。当前站点已经预留接口：

```js
window.OC_HOT_CONFIG = {
  SUPABASE_URL: "https://eaxlrsrnkowanpukvmbt.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
  SUBMISSION_ENDPOINT: "",
  VOTE_ENDPOINT: "",
  OWNER_EMAIL: "",
  SITE_NAME: "空白地热搜榜"
};
```

- `SUPABASE_URL`：Supabase 项目的 Project URL。
- `SUPABASE_PUBLISHABLE_KEY`：Supabase 的 publishable key，可放在浏览器中。
- `SUBMISSION_ENDPOINT`：填 Formspree、Getform、Make Webhook、Cloudflare Worker 等可以接收 JSON 的地址。
- `VOTE_ENDPOINT`：填你自己的投票接口地址；不填时点赞/踩只保存在访问者本机。
- `OWNER_EMAIL`：不配置投稿接口时，可填你的收件邮箱，表单会打开邮件草稿。

配置了 Supabase 后，点赞/踩会通过 `cast_vote` 同步到所有访问者，投稿会通过 `submit_hot_item` 进入 Supabase 的待审核表。

所有投稿 payload 都是匿名结构，不包含用户名字段。不要在表单里要求玩家填写真实身份信息。

## 图片

这个站点没有生成或引用 AI 图片。`assets/oc-trend-banner.png` 当前未被页面使用。
