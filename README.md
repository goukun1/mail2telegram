
<h1 align="center">
mail2telegram
</h1>

<p align="center">
    <br> English | <a href="doc/README_CN.md">中文</a>
</p>
<p align="center">
    <em>Receive email in Telegram: instant push notifications plus a Mini App inbox.</em>
</p>


![](./doc/social_preview.png)

**mail2telegram** is a Cloudflare Workers project built on Email Routing. Inbound mail is parsed, pushed to Telegram with quick action buttons, and stored so you can browse the full history from a Telegram Mini App. The Mini App also manages the white list, block list and every runtime setting.

The frontend is a React Mini App using [Konsta UI](https://konstaui.com) for iOS/iPadOS styling and the native Telegram Mini Apps controls. Mail history and settings live in **Cloudflare D1**; attachments and large bodies live in **R2**.

<details>
<summary>Click to view the demo.</summary>
<img style="max-width: 600px;" alt="image" src="doc/example.png">
</details>



## How it works

```
Email Routing ──▶ Worker email() ──▶ parse ──▶ D1 (mail + settings) ──▶ Telegram push
                                                └─▶ R2 (attachments, large bodies)

Telegram Mini App ──▶ Worker fetch() ──▶ /api/* (validated initData) ──▶ D1 / R2
```

- **Push notifications** keep the original four buttons per email: `Preview`, `Summary`, `Text`, `HTML`.
- **Mini App inbox** lists history per folder, renders HTML in a sandbox, downloads attachments, replies through Resend, and manages all settings.
- **Settings in the Mini App** include white/black lists with regex matching, an address tester, block policy, forwarding, AI summary options and mail handling limits.

## Installation

### 0. Configure Telegram

1. Create a bot to obtain a token, use `@BotFather > /newbot`, create a bot and then copy the token.
2. To use Telegram Mini Apps, you must set a privacy policy. Visit `@BotFather > /mybots > (select one) > Edit Bot > Edit Privacy Policy` and set it to the Telegram Mini Apps default: `https://telegram.org/privacy-tpa`.
3. After deployment, call `https://project_name.user_name.workers.dev/init` to bind the webhook and register the commands.

### 1. Create storage

Create the D1 database and, for attachments, an R2 bucket. You can use Wrangler or the Cloudflare dashboard:

```bash
npx wrangler d1 create mail2telegram
npx wrangler r2 bucket create mail2telegram
```

Note the database id, you will need it for the deployment step below.

### 2. Deploy with Cloudflare Workers Builds (recommended)

This project follows the [Sink](https://docs.sink.cool/deployment/workers) pattern: production resource ids are injected from **build variables** so they never land in the tracked `wrangler.jsonc`.

1. Fork or push this repository to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Workers → Connect to Git** and select the repository.
3. Set the build command and deploy command:
   - **Build command**: `pnpm build`
   - **Deploy command**: `pnpm deploy`
4. Add the following **build variables**:

   | Build variable                    | Required | Description                                                      |
   |:----------------------------------|:---------|:-----------------------------------------------------------------|
   | `DEPLOY_D1_DATABASE_ID`           | Yes      | D1 database id from `wrangler d1 create`.                        |
   | `DEPLOY_D1_DATABASE_NAME`         | No       | D1 database name, defaults to `mail2telegram`.                   |
   | `DEPLOY_R2_BUCKET_NAME`           | No       | R2 bucket for attachments. Omit to disable attachments.          |
   | `DEPLOY_R2_PREVIEW_BUCKET_NAME`   | No       | R2 bucket used for preview deployments.                          |

`pnpm deploy` runs `scripts/build-config.mjs`, applies D1 migrations and deploys with the generated, gitignored `wrangler.deploy.jsonc`.

5. Add the runtime variables and secrets below under **Settings → Variables and Secrets**. Put secrets (`TELEGRAM_TOKEN`, `RESEND_API_KEY`, `OPENAI_API_KEY`) in the encrypted secrets section.

### 3. Deploy manually (alternative)

```bash
git clone git@github.com:TBXark/mail2telegram.git
cd mail2telegram
pnpm install
cp wrangler.example.jsonc wrangler.jsonc   # fill in bindings and variables
pnpm db:migrate:remote                     # or: npx wrangler d1 migrations apply DB --remote
pnpm build && npx wrangler deploy
```

### 4. Configure Cloudflare Email Routing

1. Follow the official tutorial to configure [Cloudflare Email Routing](https://blog.cloudflare.com/introducing-email-routing/).
2. In `Email Routing → Routing Rules`, set the `Catch-all address` action to `Send to a Worker: mail2telegram`.
3. To keep a backup copy, add your address to `FORWARD_LIST`. Addresses must be verified under `Email Routing → Destination addresses`.

## Configuration

Location: Workers & Pages → your_worker → Settings → Variables and Secrets.

| KEY                       | Description                                                                                                                                                                                                                                                                            |
|:--------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TELEGRAM_ID`             | Destination chat IDs, comma separated. Get yours with the bot's `/id` command. Groups start with `-100`.                                                                                                                                                                                |
| `TELEGRAM_TOKEN`          | Telegram Bot Token, e.g. `7123456780:AAjkLAbvSgDdfsDdfsaSK0`.                                                                                                                                                                                                                         |
| `DOMAIN`                  | Worker domain, e.g. `project_name.user_name.workers.dev`. Used for webhook and Mini App links.                                                                                                                                                                                         |
| `FORWARD_LIST`            | Optional backup addresses, comma separated. Also seeds the forwarding setting in the Mini App.                                                                                                                                                                                         |
| `BLOCK_POLICY`            | Comma separated subset of `reject,forward,telegram`. `reject` rejects the message, `forward` skips backup forwarding, `telegram` skips the Telegram push. Default `telegram`. Editable in the Mini App.                                                                                  |
| `MAIL_TTL`                | Mail retention in seconds, default one day. Editable in the Mini App.                                                                                                                                                                                                                  |
| `MAX_EMAIL_SIZE`          | Maximum email size in bytes before `MAX_EMAIL_SIZE_POLICY` applies. Default `524288`.                                                                                                                                                                                                  |
| `MAX_EMAIL_SIZE_POLICY`   | One of `unhandled`, `truncate`, `continue`. Default `truncate`.                                                                                                                                                                                                                        |
| `WORKERS_AI_MODEL`        | Workers AI model id. When the `AI` binding is present and this is set, summaries use Workers AI.                                                                                                                                                                                       |
| `OPENAI_API_KEY`          | Enables summaries through an OpenAI compatible API when Workers AI is not configured.                                                                                                                                                                                                  |
| `OPENAI_COMPLETIONS_API`  | Custom chat completions endpoint, default `https://api.openai.com/v1/chat/completions`.                                                                                                                                                                                                |
| `OPENAI_CHAT_MODEL`       | Custom model name, default `gpt-4o-mini`.                                                                                                                                                                                                                                              |
| `SUMMARY_TARGET_LANG`     | Summary language, default `english`.                                                                                                                                                                                                                                                   |
| `GUARDIAN_MODE`           | Skips duplicate notifications for the same `Message-ID`. Default off.                                                                                                                                                                                                                  |
| `RESEND_API_KEY`          | Resend API Key, https://resend.com/docs/introduction. Enables replying to emails from Telegram or the Mini App.                                                                                                                                                                        |
| `WHITE_LIST` / `BLOCK_LIST` | Optional JSON arrays of exact addresses or regular expressions. They seed the Mini App lists; manage entries from the Mini App instead.                                                                                                                                             |
| `DEBUG`                   | When `true`, adds a `Debug` button to pushes.                                                                                                                                                                                                                                          |

Bindings:

| Binding  | Type              | Description                                          |
|:---------|:------------------|:-----------------------------------------------------|
| `DB`     | D1 Database       | Mail history, address lists, settings, Telegram map. |
| `BUCKET` | R2 Bucket         | Attachments and large email bodies. Optional.        |
| `AI`     | Workers AI        | Optional, for summaries.                             |

## Telegram Mini App

Open the Mini App from the bot with `/start`, or jump directly to a section with `/white` and `/block`. Everything below is managed inside the Mini App:

- **Inbox** — folders (Inbox / Spam / Trash / Sent), search, unread and starred filters, pull through history with "Load more".
- **Reader** — sandboxed HTML view with a plain text toggle, attachments, star/read/delete, AI summary and reply.
- **Settings** — white list, block list, address tester, block policy, forwarding, summary options and mail handling limits.

The Mini App is protected by Telegram `initData` validation against `TELEGRAM_TOKEN`, restricted to the IDs in `TELEGRAM_ID`. It cannot be opened as a normal web page.

On phones the app uses a native tab bar and navigation stack. On desktop clients (macOS, Telegram Desktop) and wide viewports it switches to an iPad-style split view with a sidebar, list and reading pane.

## Usage

The push message structure is unchanged:

```
[Subject]

-----------
From : [sender]
To   : [recipient]

(Preview)(Summary)(Text)(HTML)
```

1. `Preview` shows the plain text body directly in the chat, limited to 4096 characters.
2. `Summary` is available when Workers AI or an OpenAI key is configured.
3. `Text` opens the plain text body in a web page.
4. `HTML` opens the rich text body in a web page.

Reply to any pushed message in Telegram to answer the sender through Resend.

### Address lists

Rules are stored in D1 and can be entered from the Mini App. A rule matches either an exact address (case-insensitive) or a regular expression. The white list takes precedence over the block list, so an allow rule can override a broad block rule for the same address.

### Attachments

Attachments are stored in R2 and listed in the reader, where they can be downloaded. If no `BUCKET` binding is configured, mail is still stored without attachment contents.

### Retention

Mail older than `MAIL_TTL` is not part of the notification cache, but the D1 history remains until you delete it from the Mini App.

## Development

```bash
pnpm install
pnpm dev            # Vite dev server on :5173 + wrangler dev on :8787
pnpm build          # typecheck and build the Mini App into dist/client
pnpm test           # parseEmail unit test
pnpm lint           # eslint --fix
```

Local D1 migrations:

```bash
pnpm db:migrate:local
```

The Mini App normally requires a valid Telegram `initData` signature. For local development, run `wrangler dev` with a `.dev.vars` file containing `DEV_BYPASS_AUTH=true` and open `http://localhost:5173/?debug`. The `?platform=ios` query parameter previews the phone layout in a desktop browser. Never set `DEV_BYPASS_AUTH` in a deployed worker.

## License

**mail2telegram** is released under the MIT license. [See LICENSE](LICENSE) for details.
