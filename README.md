
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

**mail2telegram** is a Telegram bot for receiving email. It combines instant push notifications with a Telegram Mini App: every incoming email is pushed to your chat with quick action buttons, while the full history, attachments and every setting live in the Mini App.

<img width="100%" alt="Telegram Mini App: push notification, inbox, message reader and iPad split view" src="doc/miniapp_screens.png">



## How it works

```
Email ──▶ Telegram push with quick action buttons
      └─▶ Mini App inbox (history, attachments, settings)
```

- **Push notifications** carry quick action buttons per email: `Preview`, `Summary` and `Open`.
- **Mini App inbox** lists history per folder, renders HTML in a sandbox, downloads attachments, replies through Resend, and manages all settings.
- **Settings in the Mini App** include white/black lists with regex matching, an address tester, block policy, forwarding, AI summary options and mail handling limits.

## Installation

Deployment is documented in the [Migration & Deployment Guide](doc/MIGRATION.md) ([中文](doc/MIGRATION_CN.md)), which covers fresh installs of 2.0 and the upgrade path from 1.0.

The short version: create a D1 database (plus an optional R2 bucket and KV namespace), connect the repository to Cloudflare Workers Builds with `pnpm build` / `pnpm run deploy` and the `DEPLOY_*` build variables (or keep the real ids in your gitignored `wrangler.jsonc` and run `pnpm run deploy` locally), then point the Email Routing catch-all at the worker and call `/init` once.

## Configuration

All behavior is configured in the Mini App. The worker itself only needs a few variables for its Telegram identity and optional API keys. If you deployed an earlier version and configured behavior through variables, open **Settings → Bot & Webhook → Import from Environment** in the Mini App to copy them into the stored settings, then remove the variables.

Location: Workers & Pages → your_worker → Settings → Variables and Secrets.

| KEY              | Description                                                                                                                                                            |
|:-----------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TELEGRAM_ID`    | Required. Destination chat IDs, comma separated. Get yours from `@userinfobot`. Groups start with `-100`.                                                              |
| `TELEGRAM_TOKEN` | Required. Telegram Bot Token, e.g. `7123456780:AAjkLAbvSgDdfsDdfsaSK0`.                                                                                                |
| `DOMAIN`         | Required. Worker domain, e.g. `project_name.user_name.workers.dev`. Used for webhook and Mini App links.                                                               |
| `RESEND_API_KEY` | Optional. Resend API Key, https://resend.com/docs/introduction. Enables replying to emails from Telegram or the Mini App.                                               |
| `DEBUG`          | Optional. When `true`, adds a `Debug` button to pushes.                                                                                                                 |

Everything else lives in **Settings** inside the Mini App: allow/block lists with regex matching, block policy, forwarding, summary options (Workers AI model, or an OpenAI-compatible API key, endpoint and model), the duplicate-notification guard, and mail handling limits (retention and size policy).

Bindings:

| Binding  | Type              | Description                                          |
|:---------|:------------------|:-----------------------------------------------------|
| `DB`     | D1 Database       | Required. Mail history, address lists and settings.  |
| `BUCKET` | R2 Bucket         | Attachments and large email bodies. Optional.        |
| `AI`     | Workers AI        | Optional, for summaries.                             |
| `KV`     | KV Namespace      | Optional, remembers which chats ran `/start`.        |

## Telegram Mini App

Open the Mini App from the bot with `/start`. The first `/start` from a chat also binds the webhook and points the bot menu button at the worker, so later opens can use the menu button directly. Everything below is managed inside the Mini App:

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

(Preview)(Summary)(Open)
```

1. `Preview` shows the plain text body directly in the chat, limited to 4096 characters.
2. `Summary` appears when a summary backend is enabled in Settings (Workers AI, or an OpenAI compatible key).
3. `Open` launches the Mini App straight to this message's detail page. Telegram only allows Mini App buttons in private chats, so group notifications omit it.

Reply to any pushed message in Telegram to answer the sender through Resend.

### Address lists

Rules are managed in the Mini App. A rule matches either an exact address (case-insensitive) or a regular expression. The white list takes precedence over the block list, so an allow rule can override a broad block rule for the same address.

### Attachments

Attachments are stored in R2 and listed in the reader, where they can be downloaded. If no `BUCKET` binding is configured, mail is still stored without attachment contents.

### Retention

Mail older than the retention setting is not part of the notification cache, but the full history remains until you delete it from the Mini App.

## Development

```bash
pnpm install
pnpm dev            # Vite dev server on :5173 + wrangler dev on :8787
pnpm build          # typecheck and build the Mini App into dist/client
pnpm test           # parseEmail unit test
pnpm lint           # eslint --fix
pnpm screenshots    # regenerate the README images in doc/ from mock data
```

Local D1 migrations:

```bash
pnpm db:migrate:local
```

The Mini App normally requires a valid Telegram `initData` signature. For local development, run `wrangler dev` with a `.dev.vars` file containing `DEV_BYPASS_AUTH=true` and open `http://localhost:5173/?debug`. The `?platform=ios` query parameter previews the phone layout in a desktop browser. Never set `DEV_BYPASS_AUTH` in a deployed worker.

## License

**mail2telegram** is released under the MIT license. [See LICENSE](LICENSE) for details.
