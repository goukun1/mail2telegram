
<h1 align="center">
mail2telegram
</h1>

<p align="center">
    <br> <a href="../README.md">English</a> | 中文
</p>
<p align="center">
    <em>在 Telegram 中收邮件：即时推送通知 + Mini App 收件箱。</em>
</p>

![](./social_preview.png)

**mail2telegram** 是一个在 Telegram 中收邮件的机器人，结合了即时推送通知与 Telegram Mini App：每封新邮件都会带着快捷操作按钮推送到你的聊天，完整历史、附件和全部设置都在 Mini App 中管理。

<img width="100%" alt="Telegram Mini App：推送通知、收件箱、阅读器与 iPad 分栏视图" src="miniapp_screens.png">

## 工作原理

```
邮件 ──▶ Telegram 推送（快捷操作按钮）
    └─▶ Mini App 收件箱（历史、附件、设置）
```

- **推送通知**为每封邮件提供快捷按钮：`Preview`、`Summary`、`Open`。
- **Mini App 收件箱**按文件夹浏览历史、沙箱渲染 HTML、下载附件、通过 Resend 回信，并管理全部设置。
- **Mini App 设置**包含支持正则匹配的白/黑名单、地址测试、阻断策略、转发、AI 摘要选项和邮件处理限制。

## 安装

部署流程见[迁移部署指南](./MIGRATION_CN.md)（[English](./MIGRATION.md)），包含 2.0 的全新安装以及从 1.0 升级的完整步骤。

简版流程：创建 D1 数据库（可选 R2 存储桶和 KV 命名空间），将仓库接入 Cloudflare Workers Builds 并配置 `pnpm build` / `pnpm deploy` 与 `DEPLOY_*` 构建变量，然后把 Email Routing 的 catch-all 指向该 Worker，最后访问一次 `/init`。

## 配置

所有行为都在 Mini App 中配置，Worker 本身只需要少量变量来标识机器人和可选的 API Key。如果你部署过旧版本、习惯用变量配置行为，在 Mini App 中打开 **Settings → Bot & Webhook → Import from Environment**，一键把变量迁移到配置里，之后即可删除这些变量。

位置：Workers & Pages → 你的 worker → Settings → Variables and Secrets。

| KEY              | 说明                                                                                                  |
|:-----------------|:------------------------------------------------------------------------------------------------------|
| `TELEGRAM_ID`    | 必填。推送目标 Chat ID，多个用英文逗号分隔。可通过 `@userinfobot` 获取，群组以 `-100` 开头。            |
| `TELEGRAM_TOKEN` | 必填。Telegram Bot Token，例如 `7123456780:AAjkLAbvSgDdfsDdfsaSK0`。                                   |
| `DOMAIN`         | 必填。Worker 域名，例如 `project_name.user_name.workers.dev`，用于 Webhook 与 Mini App 链接。          |
| `RESEND_API_KEY` | 可选。Resend API Key，https://resend.com/docs/introduction。启用后可在 Telegram 或 Mini App 中回信。   |
| `DEBUG`          | 可选。为 `true` 时推送会增加 `Debug` 按钮。                                                            |

其余全部在 Mini App 的 **Settings** 中管理：支持正则的白名单/黑名单、阻断策略、转发、摘要选项（Workers AI 模型，或 OpenAI 兼容的 API Key、接口地址、模型）、摘要语言、重复通知拦截，以及邮件处理限制（保留时间与大小策略）。

Bindings：

| Binding  | 类型         | 说明                                    |
|:---------|:-------------|:----------------------------------------|
| `DB`     | D1 Database  | 必需。邮件历史、地址名单、设置。        |
| `BUCKET` | R2 Bucket    | 附件与超大正文，可选。                  |
| `AI`     | Workers AI   | 可选，用于摘要。                        |
| `KV`     | KV Namespace | 可选，记录哪些会话执行过 `/start`。     |

## Telegram Mini App

在机器人中通过 `/start` 打开 Mini App。某个会话首次 `/start` 时会同时绑定 Webhook 并把机器人菜单按钮指向本 Worker，之后可直接用菜单按钮打开。以下内容全部在 Mini App 中管理：

- **收件箱** — 文件夹（Inbox / Spam / Trash / Sent）、搜索、未读与星标筛选，通过 “Load more” 加载更多历史。
- **阅读页** — 沙箱 HTML 视图与纯文本切换、附件、星标/已读/删除、AI 摘要与回复。
- **设置** — 白名单、黑名单、地址测试、阻断策略、转发、摘要选项以及邮件处理限制。

Mini App 使用 `TELEGRAM_TOKEN` 校验 Telegram `initData`，并限制为 `TELEGRAM_ID` 中的用户，无法作为普通网页打开。

手机端使用原生底部标签栏与导航栈；桌面端（macOS、Telegram Desktop）与宽屏会自动切换为 iPad 风格的侧栏 + 列表 + 阅读窗格三栏布局。

## 使用

推送消息结构保持不变：

```
[Subject]

-----------
From : [sender]
To   : [recipient]

(Preview)(Summary)(Open)
```

1. `Preview` 直接在聊天中显示纯文本正文，最多 4096 字符。
2. 在 Settings 中启用了摘要后端（Workers AI 或 OpenAI 兼容 Key）后可用 `Summary`。
3. `Open` 直接打开 Mini App 中该邮件的详情页。Telegram 只允许在私聊中使用 Mini App 按钮，因此群组推送会省略该按钮。

在 Telegram 中回复任意推送消息即可通过 Resend 给发件人回信。

### 地址名单

规则统一在 Mini App 中管理。规则匹配精确地址（不区分大小写）或正则表达式。白名单优先于黑名单，因此一条白名单规则可以覆盖同一地址的宽泛黑名单规则。

### 附件

附件存放在 R2，并在阅读页中列出、可下载。未配置 `BUCKET` 时，邮件仍会保存，只是不包含附件内容。

### 保留策略

超过保留时间设置的邮件不再作为通知缓存，但完整历史会一直保留，直到你在 Mini App 中删除。

## 开发

```bash
pnpm install
pnpm dev            # Vite 开发服务器 :5173 + wrangler dev :8787
pnpm build          # 类型检查并构建 Mini App 到 dist/client
pnpm test           # parseEmail 单元测试
pnpm lint           # eslint --fix
pnpm screenshots    # 用 mock 数据重新生成 doc/ 下的 README 截图
```

本地 D1 迁移：

```bash
pnpm db:migrate:local
```

Mini App 正常需要有效的 Telegram `initData` 签名。本地开发时，在 `.dev.vars` 中加入 `DEV_BYPASS_AUTH=true` 再运行 `wrangler dev`，然后打开 `http://localhost:5173/?debug`。加 `?platform=ios` 可在桌面浏览器中预览手机端布局。切勿在部署的 worker 中设置 `DEV_BYPASS_AUTH`。

## License

**mail2telegram** 基于 MIT 协议发布，详见 [LICENSE](LICENSE)。
