
# 迁移部署指南

[English](./MIGRATION.md) | 中文

本指南覆盖两种场景：

- **从 1.0 升级到 2.0** —— 变化点与安全的迁移步骤。
- **从零部署 2.0** —— 完整的安装流程。

## 1. 2.0 有哪些变化

| 范围 | 1.0 | 2.0 |
|:-----------------------|:---------------------------------------|:-------------------------------------------------|
| `DB` 绑定              | KV Namespace                           | **D1 Database**                                   |
| 邮件历史               | 不保存（只推送到 Telegram）            | 保存到 D1，可在 Mini App 收件箱中浏览             |
| 附件                   | 不支持                                 | 存到 R2，阅读页可下载                             |
| Mini App               | 单一设置页（`/tma`）                   | 完整收件箱：文件夹、搜索、星标、回信、设置        |
| 白名单 / 黑名单        | KV，在旧 Mini App 中管理               | D1，在新 Mini App 中管理                          |
| 运行参数               | 仅环境变量                             | 在 Mini App 中配置（存于 D1）；旧变量可一键导入   |
| 推送按钮               | `Preview` `Summary` `Text` `HTML`      | `Preview` `Summary` `Open`（深链到 Mini App 详情页）|
| 可选绑定               | `AI`                                   | `AI`、`BUCKET`（R2）、`KV`                        |
| 构建                   | esbuild                                | Vite（Mini App 构建到 `dist/client`）             |
| 部署                   | `wrangler deploy` 或复制粘贴脚本       | Workers Builds（`pnpm deploy`）或命令行 + D1 迁移 |

保持不变的部分：Bot Token、Email Routing 的 catch-all 配置、推送消息版式、回复推送即可回信，以及全部 AI 摘要选项。

### 关于你的数据

**没有自动的数据迁移。** 1.0 在 KV 中只有两样持久数据 —— 白名单和黑名单，其余（预览缓存、guardian 键、会话映射）都是短命缓存，2.0 并不需要。具体来说：

- **白名单 / 黑名单** —— 不会自动迁移。新部署保留（或设置）`WHITE_LIST` / `BLOCK_LIST` 变量，然后在 Mini App 中通过 **Settings → Bot & Webhook → Import from Environment** 一键导入到存储名单；也可以在第 5 步手动重新录入。
- **邮件历史** —— 从空开始。1.0 本来就不保存邮件，没有历史可迁移。升级后收到的邮件会持续累积在 D1 中。
- **旧的 KV 命名空间** —— 新部署验证正常后即可删除。

### 复制粘贴部署方式已移除

1.0 可以把预编译的 `index.js` 粘贴到 Cloudflare 控制台。2.0 的前端必须经过 Vite 编译并与 Worker 一起上传，因此部署只能通过 **Cloudflare Workers Builds**（推荐，无需本地环境）或 **命令行**。

## 2. 从 1.0 升级（分步操作）

### 第 0 步 —— 记录当前设置

动手前先记下：

1. 白名单和黑名单条目 —— 打开旧 Mini App（机器人菜单按钮）复制出来，或从 `WHITE_LIST` / `BLOCK_LIST` 变量中读取。
2. 全部 Worker 变量：`TELEGRAM_ID`、`TELEGRAM_TOKEN`、`DOMAIN`、`FORWARD_LIST`、`BLOCK_POLICY`、`MAIL_TTL`、AI 相关（`WORKERS_AI_MODEL` 或 `OPENAI_API_KEY` 等）、`GUARDIAN_MODE`、`RESEND_API_KEY`、`DEBUG`。

### 第 1 步 —— 创建新存储

使用 Wrangler（或 Cloudflare 控制台）：

```bash
npx wrangler d1 create mail2telegram                 # 必需
npx wrangler r2 bucket create mail2telegram          # 可选：附件
npx wrangler kv namespace create mail2telegram       # 可选：记录首次 /start
```

记下输出中的 D1 **database id**。

### 第 2 步 —— 部署 2.0

按[第 3 节](#3-部署-20)选择一种部署方式。两种方式都会自动应用 D1 迁移并替换旧绑定 —— 原来绑定在 `DB` 上的 KV 命名空间会被解绑，`DB` 改为指向 D1 数据库。不需要去控制台手动改绑定。

请保持 Worker 名称（`mail2telegram`）以及 `TELEGRAM_TOKEN` / `TELEGRAM_ID` / `DOMAIN` 不变，Webhook 和 Email Routing 就能继续工作。

### 第 3 步 —— 确认 Email Routing

catch-all 规则在升级过程中不受影响。在 `Email Routing → Routing Rules` 中确认 `Catch-all address` 仍指向 `Send to a Worker: mail2telegram`。如果换了新的 Worker 名称，在这里更新。

### 第 4 步 —— 重新绑定 Webhook

访问一次 init 端点（或直接给机器人发 `/start`，首次 `/start` 也会重新绑定）：

```
https://你的-worker-域名/init
```

这一步会刷新 Webhook、注册 `/start`，并把机器人菜单按钮指向新 Mini App。1.0 时设置过的隐私政策（`https://telegram.org/privacy-tpa`）继续有效。

### 第 5 步 —— 恢复名单并检查设置

打开 Mini App（`/start` → 菜单按钮）：

1. **Settings → Bot & Webhook → Import from Environment** —— 一键把旧变量（阻断策略、转发、邮件限制、摘要选项、白名单/黑名单）迁移到 Mini App 的存储配置中。
2. **Settings → White list / Block list** —— 检查导入的条目，或重新录入第 0 步记录的内容，并用地址测试功能确认规则仍然匹配。
3. 检查转发、阻断策略、邮件保留时间和摘要选项 —— 旧变量未覆盖的项会保持默认值。

### 第 6 步 —— 清理

新版本稳定运行几天后：

- 删除旧的 KV 命名空间（里面只有名单和已过期的缓存）。
- 把已迁移的变量（`WHITE_LIST`、`BLOCK_LIST`、`BLOCK_POLICY`、`MAIL_TTL`、`MAX_EMAIL_SIZE*`、`FORWARD_LIST`、`GUARDIAN_MODE`、`OPENAI_API_KEY` 及其他 AI 摘要相关）从 Worker 中移除 —— Mini App 的设置现在是唯一配置来源。保留 `TELEGRAM_TOKEN`、`TELEGRAM_ID`、`DOMAIN` 和 `RESEND_API_KEY`。

### 回滚

如需退回 1.0：用旧配置重新部署 `master` 分支，并把 `DB` 重新绑定到旧的 KV 命名空间（控制台 → Settings → Bindings，或使用旧的 `wrangler.jsonc`）。2.0 从不写 KV-as-`DB`，1.0 也从不写 D1，两个版本不会互相破坏数据。注意 2.0 期间收到的邮件保存在 D1 中，回退后在 1.0 里看不到。

## 3. 部署 2.0

### 0. 配置 Telegram

1. 使用 `@BotFather > /newbot` 创建机器人并复制 Token。
2. Mini App 需要设置隐私政策：`@BotFather > /mybots > (选择你的机器人) > Edit Bot > Edit Privacy Policy`，设置为 `https://telegram.org/privacy-tpa`。
3. 部署完成后，访问一次 `https://你的-worker-域名/init` 绑定 Webhook 并设置菜单按钮。

### 1. 创建存储

```bash
npx wrangler d1 create mail2telegram
npx wrangler r2 bucket create mail2telegram          # 可选
npx wrangler kv namespace create mail2telegram       # 可选
```

记下 D1 database id。

### 2. 部署

#### 方式 A —— Cloudflare Workers Builds（推荐）

1. Fork 或推送本仓库到 GitHub。
2. 在 Cloudflare 控制台进入 **Workers & Pages → Create → Workers → Connect to Git**，选择该仓库。
3. 设置命令：
   - **Build command**: `pnpm build`
   - **Deploy command**: `pnpm deploy`
4. 添加 **build variables**：

   | Build variable                  | 必填 | 说明                                       |
   |:--------------------------------|:-----|:-------------------------------------------|
   | `DEPLOY_D1_DATABASE_ID`         | 是   | `wrangler d1 create` 得到的 D1 数据库 id。 |
   | `DEPLOY_D1_DATABASE_NAME`       | 否   | D1 数据库名，默认 `mail2telegram`。        |
   | `DEPLOY_R2_BUCKET_NAME`         | 否   | 存放附件的 R2 存储桶，省略则不启用附件。   |
   | `DEPLOY_R2_PREVIEW_BUCKET_NAME` | 否   | 预览部署使用的 R2 存储桶。                 |
   | `DEPLOY_KV_NAMESPACE_ID`        | 否   | 记录首次 `/start` 的 KV 命名空间 id。      |

   `pnpm deploy` 会把这些变量注入生成的（已 gitignore 的）`wrangler.deploy.jsonc`，应用 D1 迁移，构建 Mini App 并部署。
5. 在 **Settings → Variables and Secrets** 中，按 README 的[配置](../README_CN.md#配置)一表添加运行参数。`TELEGRAM_TOKEN`、`RESEND_API_KEY` 请放入加密的 **Secrets** 区域。

#### 方式 B —— GitHub Actions

仓库自带 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)：每次推送到 `master`（或在 Actions 页手动触发）都会自动构建 Mini App、应用 D1 迁移并部署 Worker。

1. 在仓库 **Settings → Secrets and variables → Actions → Variables** 中添加：

   | 变量                     | 必填 | 说明                                       |
   |:-------------------------|:-----|:-------------------------------------------|
   | `CLOUDFLARE_ACCOUNT_ID`  | 是   | 通过 `wrangler whoami` 或控制台获取。      |
   | `DEPLOY_D1_DATABASE_ID`  | 是   | `wrangler d1 create` 得到的 D1 数据库 id。 |
   | `DEPLOY_R2_BUCKET_NAME`  | 否   | 存放附件的 R2 存储桶，省略则不启用附件。   |
   | `DEPLOY_KV_NAMESPACE_ID` | 否   | 记录首次 `/start` 的 KV 命名空间 id。      |

2. 在 Cloudflare **My Profile → API Tokens** 创建 API Token：以 **Edit Cloudflare Workers** 模板为基础，追加 `D1 Edit`、`Workers R2 Storage Edit`、`Workers AI Edit` 权限。然后把它作为仓库 **Secret** `CLOUDFLARE_API_TOKEN` 添加（Secrets 页）。

3. 推送到 `master` 即可。如果同时接入了 Cloudflare Workers Builds，请停用其中一个，避免重复部署。

#### 方式 C —— 命令行

环境要求：Node.js 20.19+（Vite 7）和 pnpm。先执行 `npx wrangler login` 登录。

```bash
git clone git@github.com:TBXark/mail2telegram.git
cd mail2telegram
pnpm install
cp wrangler.example.jsonc wrangler.jsonc
```

编辑 `wrangler.jsonc`：

- `d1_databases[0].database_id` —— 你的 D1 数据库 id（必填）。
- `r2_buckets[0].bucket_name` —— 存储桶名；**不需要附件就整段删除 `r2_buckets`**。
- `kv_namespaces[0].id` —— KV 命名空间 id；**不需要就整段删除 `kv_namespaces`**。
- `vars` —— 填写 `DOMAIN`、`TELEGRAM_ID`、`TELEGRAM_TOKEN` 即可；其余配置部署后在 Mini App 中完成。

然后执行：

```bash
npx wrangler d1 migrations apply DB --remote   # 建表
pnpm build                                     # 类型检查 + 构建 Mini App
npx wrangler deploy
```

### 3. 配置 Cloudflare Email Routing

1. 在你的域名上启用 [Cloudflare Email Routing](https://blog.cloudflare.com/introducing-email-routing/)。
2. 在 `Email Routing → Routing Rules` 中，将 `Catch-all address` 的动作设为 `Send to a Worker: mail2telegram`。
3. 如需备份所有邮件，在 Mini App 中开启转发并添加备份地址。该地址需要在 `Email Routing → Destination addresses` 中完成验证。

### 4. 首次运行

1. 访问一次 `https://你的-worker-域名/init`。
2. 给机器人发送 `/start`，通过菜单按钮打开 Mini App。
3. 在设置中录入白名单 / 黑名单 —— 其余参数之后也都可以在 Mini App 中调整。

## 4. 变量对比：1.0 vs 2.0

2.0 的所有行为配置都在 Mini App 中。下列旧变量仍然作为初始默认值生效 —— 通过 **Settings → Bot & Webhook → Import from Environment** 一键迁移到存储配置后即可删除。

| 变量 | 1.0 | 2.0 |
|:--------------------------|:---------------------------------------|:--------------------------------------------------|
| `TELEGRAM_ID` / `TELEGRAM_TOKEN` / `DOMAIN` | 相同 | 相同 |
| `FORWARD_LIST`            | 备份地址                               | 相同；同时作为 Mini App 转发设置的初始值          |
| `BLOCK_POLICY`            | 仅环境变量                             | 环境变量为默认值，可在 Mini App 中修改            |
| `MAIL_TTL`                | `Text` / `HTML` 网页链接的过期时间     | Mini App 中显示的默认保留时间；开启自动清理后，每日定时任务会按保留天数修剪 D1 历史 |
| `AUTO_CLEANUP_DAYS`       | —                                      | 可选的每日清理保留天数初始值；默认 7 天，0 表示永久保留；可在 Mini App 的 Mail Handling 中修改 |
| `GUARDIAN_MODE`           | 基于 KV 去重（消耗 KV 写入）          | 基于 D1 去重（无额外开销）；默认关闭，可在 Mini App 修改 |
| `MAX_EMAIL_SIZE` / `MAX_EMAIL_SIZE_POLICY` | 相同 | 相同；邮件大小同时入库 |
| `WORKERS_AI_MODEL` / `OPENAI_*` / `SUMMARY_TARGET_LANG` | 相同 | 移入 Mini App 设置（含 API Key）；导入时会复制旧值 |
| `RESEND_API_KEY`          | 在 Telegram 中回信                     | 在 Telegram 和 Mini App 中回信                    |
| `WHITE_LIST` / `BLOCK_LIST` | 与 KV 中的名单合并                   | 仅作为 D1 名单的初始值；条目请在 Mini App 中管理  |
| `DEBUG`                   | 推送增加 `Debug` 按钮                  | 相同                                              |
| —                         | `Text` / `HTML` 推送按钮               | 已移除；由 `Open`（深链到 Mini App）替代          |

绑定对比：

| 绑定    | 1.0                | 2.0                                        |
|:--------|:-------------------|:-------------------------------------------|
| `DB`    | KV Namespace       | **D1 Database**（记得执行迁移！）          |
| `BUCKET`| —                  | R2 Bucket，可选：附件与超大正文            |
| `AI`    | Workers AI，可选   | 相同                                       |
| `KV`    | —                  | KV Namespace，可选：记录首次 `/start`      |

## 5. 常见问题

**旧邮件会出现在 Mini App 里吗？**
不会。1.0 没有保存邮件，收件箱从空开始，从部署 2.0 起逐步累积。

**必须创建 R2 存储桶吗？**
不必，可选。不配置 `BUCKET` 时邮件仍存入 D1，只是不包含附件内容（超大正文按大小策略设置截断）。

**必须创建 KV 命名空间吗？**
不必。它只用于记住哪些会话完成过首次 `/start` 引导。没有它，引导提示下次会重新出现而已。

**能继续用原来的机器人和 Email Routing 配置吗？**
可以。保持 `TELEGRAM_TOKEN`、`TELEGRAM_ID` 和 `DOMAIN` 不变，重新部署后访问一次 `/init` 即可。

**部署时报绑定相关错误？**
手动部署时，`wrangler.jsonc` 中空的 `database_id` / `bucket_name` / KV `id` 是非法值 —— 要么填真实 id，要么整段删除对应的可选绑定。Workers Builds 方式会自动省略未配置的绑定，不会遇到这个问题。

**`Text` / `HTML` 按钮去哪了？**
2.0 用 Mini App 取代了临时网页。`Open` 按钮直接深链到该邮件的详情页，那里有沙箱 HTML 视图、纯文本切换和附件下载。
