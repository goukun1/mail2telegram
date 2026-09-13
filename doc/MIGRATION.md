
# Migration & Deployment Guide

English | [中文](./MIGRATION_CN.md)

This guide covers two scenarios:

- **Upgrading from 1.0 to 2.0** — what changed and how to migrate safely.
- **Deploying 2.0 from scratch** — the full installation flow.

## 1. What changed in 2.0

| Area | 1.0 | 2.0 |
|:-----------------------|:---------------------------------------|:-------------------------------------------------|
| `DB` binding           | KV Namespace                           | **D1 Database**                                   |
| Mail history           | Not stored (only pushed to Telegram)   | Stored in D1, browsable in the Mini App inbox     |
| Attachments            | Not supported                          | Stored in R2, downloadable from the reader        |
| Mini App               | Single settings page (`/tma`)          | Full inbox: folders, search, star, reply, settings|
| White / black lists    | KV, managed in the old Mini App        | D1, managed in the new Mini App                   |
| Runtime settings       | Environment variables only             | Configured in the Mini App (stored in D1); legacy variables can be imported with one click |
| Push buttons           | `Preview` `Summary` `Text` `HTML`      | `Preview` `Summary` `Open` (deep link into the Mini App) |
| Optional bindings      | `AI`                                   | `AI`, `BUCKET` (R2), `KV`                         |
| Build                  | esbuild                                | Vite (Mini App built into `dist/client`)          |
| Deployment             | `wrangler deploy` or copy-paste script | Workers Builds (`pnpm run deploy`) or CLI with D1 migrations |

What stays the same: your bot token, the Email Routing catch-all configuration, the push message layout, replying to a push to answer the sender, and all AI summary options.

### About your data

**There is no automatic data migration.** 1.0 kept only two durable things in KV — the white list and the block list. Everything else (preview cache, guardian keys, chat mappings) was short-lived cache that 2.0 does not need. Concretely:

- **White / black lists** — not carried over automatically. Keep (or set) the `WHITE_LIST` / `BLOCK_LIST` variables for the new deployment, then use **Settings → Bot & Webhook → Import from Environment** in the Mini App to copy them into the stored lists — or re-enter the entries by hand (Step 5).
- **Mail history** — starts empty. 1.0 never stored mail, so there is nothing to bring over. Mail received after the upgrade accumulates in D1.
- **Old KV namespace** — can be deleted once the new deployment is verified.

### The copy-paste deployment is gone

In 1.0 you could paste a prebuilt `index.js` into the Cloudflare dashboard. In 2.0 the frontend must be compiled (Vite) and uploaded together with the worker, so deployment now requires either **Cloudflare Workers Builds** (recommended, no local tooling) or the **command line**.

## 2. Upgrading from 1.0 (step by step)

### Step 0 — Record your current settings

Before touching anything, write down:

1. White list and block list entries — open the old Mini App (bot menu button) and copy them, or read them from your `WHITE_LIST` / `BLOCK_LIST` variables.
2. All worker variables: `TELEGRAM_ID`, `TELEGRAM_TOKEN`, `DOMAIN`, `FORWARD_LIST`, `BLOCK_POLICY`, `MAIL_TTL`, AI options (`WORKERS_AI_MODEL` or `OPENAI_API_KEY` etc.), `GUARDIAN_MODE`, `RESEND_API_KEY`, `DEBUG`.

### Step 1 — Create the new storage

Using Wrangler (or the Cloudflare dashboard):

```bash
npx wrangler d1 create mail2telegram                 # required
npx wrangler r2 bucket create mail2telegram          # optional: attachments
npx wrangler kv namespace create mail2telegram       # optional: first-time /start memory
```

Note the D1 **database id** from the output.

### Step 2 — Deploy 2.0

Pick one of the two methods in [Section 3](#3-deploying-20). Both automatically apply the D1 migrations and replace the old bindings — the KV namespace bound as `DB` is unbound and `DB` now points to the D1 database. You do not need to edit bindings by hand in the dashboard.

Keep the same worker name (`mail2telegram`) and the same `TELEGRAM_TOKEN` / `TELEGRAM_ID` / `DOMAIN`, so the webhook and Email Routing keep working.

### Step 3 — Verify Email Routing

The catch-all rule survives the upgrade. In `Email Routing → Routing Rules`, confirm `Catch-all address` still points to `Send to a Worker: mail2telegram`. If you deployed under a new worker name, update it here.

### Step 4 — Rebind the webhook

Call the init endpoint once (or just send `/start` to the bot — the first `/start` rebinds it too):

```
https://your-worker-domain/init
```

This refreshes the webhook, registers `/start` and points the bot menu button at the new Mini App. The privacy policy you set in 1.0 (`https://telegram.org/privacy-tpa`) is still valid.

### Step 5 — Restore lists and review settings

Open the Mini App (`/start` → menu button):

1. **Settings → Bot & Webhook → Import from Environment** — copies your old variables (block policy, forwarding, mail limits, summary options, white/black lists) into the Mini App's stored settings.
2. **Settings → White list / Block list** — check the imported entries, or re-enter the ones you recorded in Step 0. Use the address tester to confirm the patterns still match.
3. Review forwarding, block policy, mail retention and summary options — anything not covered by an old variable keeps its default.

### Step 6 — Cleanup

After a few days of verified operation:

- Delete the old KV namespace (it only held lists and expired caches).
- Remove the migrated variables (`WHITE_LIST`, `BLOCK_LIST`, `BLOCK_POLICY`, `MAIL_TTL`, `MAX_EMAIL_SIZE*`, `FORWARD_LIST`, `GUARDIAN_MODE`, `OPENAI_API_KEY` and the other AI summary options) from the worker — the Mini App settings are now the source of truth. Keep `TELEGRAM_TOKEN`, `TELEGRAM_ID`, `DOMAIN` and `RESEND_API_KEY`.

### Rollback

If you need to go back to 1.0: redeploy the `master` branch with your old configuration, and bind `DB` back to the old KV namespace (dashboard → Settings → Bindings, or the old `wrangler.jsonc`). 2.0 never writes to KV-as-`DB`, and 1.0 never writes to D1, so the two versions do not corrupt each other. Mail received while on 2.0 stays in D1 and will not appear in 1.0.

## 3. Deploying 2.0

### 0. Configure Telegram

1. Create a bot with `@BotFather > /newbot` and copy the token.
2. Mini Apps require a privacy policy: `@BotFather > /mybots > (select your bot) > Edit Bot > Edit Privacy Policy`, set it to `https://telegram.org/privacy-tpa`.
3. After deployment, call `https://your-worker-domain/init` once to bind the webhook and set the menu button.

### 1. Create storage

```bash
npx wrangler d1 create mail2telegram
npx wrangler r2 bucket create mail2telegram          # optional
npx wrangler kv namespace create mail2telegram       # optional
```

Note the D1 database id.

### 2. Deploy

#### Option A — Cloudflare Workers Builds (recommended)

1. Fork or push this repository to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Connect to Git**, select the repository.
3. Set the commands:
   - **Build command**: `pnpm build`
   - **Deploy command**: `pnpm run deploy`
4. Add the **build variables**:

   | Build variable                  | Required | Description                                             |
   |:--------------------------------|:---------|:--------------------------------------------------------|
   | `DEPLOY_D1_DATABASE_ID`         | Yes      | D1 database id from `wrangler d1 create`.               |
   | `DEPLOY_D1_DATABASE_NAME`       | No       | D1 database name, default `mail2telegram`.              |
   | `DEPLOY_R2_BUCKET_NAME`         | No       | R2 bucket for attachments. Omit to disable attachments. |
   | `DEPLOY_R2_PREVIEW_BUCKET_NAME` | No       | R2 bucket used for preview deployments.                 |
   | `DEPLOY_KV_NAMESPACE_ID`        | No       | KV namespace id for first-time `/start` memory.         |

   `pnpm run deploy` injects these into a generated, gitignored `wrangler.deploy.jsonc`, applies D1 migrations, builds the Mini App and deploys. (`pnpm deploy` without `run` collides with pnpm's built-in workspace command.)
5. Under **Settings → Variables and Secrets**, add the runtime variables from the README's [Configuration](../README.md#configuration) table. Put `TELEGRAM_TOKEN` and `RESEND_API_KEY` in the encrypted **Secrets** section.

#### Option B — GitHub Actions

The repository ships [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). On every push to `master` (or a manual run from the Actions tab) it builds the Mini App, applies D1 migrations and deploys the worker.

1. Under the repository's **Settings → Secrets and variables → Actions → Variables**, add:

   | Variable                 | Required | Description                                             |
   |:-------------------------|:---------|:--------------------------------------------------------|
   | `CLOUDFLARE_ACCOUNT_ID`  | Yes      | Account id, from `wrangler whoami` or the dashboard.    |
   | `DEPLOY_D1_DATABASE_ID`  | Yes      | D1 database id from `wrangler d1 create`.               |
   | `DEPLOY_R2_BUCKET_NAME`  | No       | R2 bucket for attachments. Omit to disable attachments. |
   | `DEPLOY_KV_NAMESPACE_ID` | No       | KV namespace id for first-time `/start` memory.         |

2. Create a Cloudflare API token under **My Profile → API Tokens**: start from the **Edit Cloudflare Workers** template and add the `D1 Edit`, `Workers R2 Storage Edit` and `Workers AI Edit` permissions. Add it as the repository **secret** `CLOUDFLARE_API_TOKEN` (Secrets tab).

3. Push to `master`. If you also connected Cloudflare Workers Builds, disable one of the two so the worker is not deployed twice.

#### Option C — Command line

Requirements: Node.js 20.19+ (Vite 7) and pnpm. Log in with `npx wrangler login` first.

```bash
git clone git@github.com:TBXark/mail2telegram.git
cd mail2telegram
pnpm install
cp wrangler.example.jsonc wrangler.jsonc
```

Edit `wrangler.jsonc`:

- `d1_databases[0].database_id` — your D1 database id (required).
- `r2_buckets[0].bucket_name` — your bucket name; **delete the whole `r2_buckets` block if you don't want attachments**.
- `kv_namespaces[0].id` — your KV namespace id; **delete the whole `kv_namespaces` block if you don't need it**.
- `vars` — fill in `DOMAIN`, `TELEGRAM_ID` and `TELEGRAM_TOKEN`; everything else is configured in the Mini App after deployment.

Then:

```bash
pnpm run deploy   # applies D1 migrations, builds the Mini App, deploys the worker
```

`scripts/build-config.mjs` copies the ids above into a generated `wrangler.deploy.jsonc`. `DEPLOY_*` environment variables (used by CI) take precedence over the values in `wrangler.jsonc`; a `local` placeholder binding is skipped instead of deployed.

### 3. Configure Cloudflare Email Routing

1. Set up [Cloudflare Email Routing](https://blog.cloudflare.com/introducing-email-routing/) on your domain.
2. In `Email Routing → Routing Rules`, set `Catch-all address` to `Send to a Worker: mail2telegram`.
3. For a backup copy of every mail, enable forwarding in the Mini App and add your backup address. The address must be verified under `Email Routing → Destination addresses`.

### 4. First run

1. Call `https://your-worker-domain/init` once.
2. Send `/start` to your bot and open the Mini App from the menu button.
3. Add white list / block list entries in Settings — everything else can also be tuned there later.

## 4. Variables: 1.0 vs 2.0

In 2.0 all behavior settings live in the Mini App. The legacy variables below are still honored as initial defaults — **Settings → Bot & Webhook → Import from Environment** copies them into the stored settings, after which you can delete them.

| Variable | 1.0 | 2.0 |
|:--------------------------|:---------------------------------------|:--------------------------------------------------|
| `TELEGRAM_ID` / `TELEGRAM_TOKEN` / `DOMAIN` | same | same |
| `FORWARD_LIST` | backup addresses | same; also seeds the Mini App forwarding setting |
| `BLOCK_POLICY` | env only | env is the default; editable in the Mini App |
| `MAIL_TTL` | expiry of the `Text` / `HTML` web links | obsolete — 2.0 keeps mail in D1 until Auto Cleanup (or Clear Mail) removes it; the variable is ignored |
| `AUTO_CLEANUP_DAYS` | — | optional initial value (days) for the daily mail cleanup cron; defaults to 7, 0 keeps mail forever; editable in the Mini App under Mail Handling |
| `GUARDIAN_MODE` | KV-based dedup (extra KV writes) | obsolete — 2.0 always suppresses a repeated `Message-ID` in D1; the variable is ignored |
| `MAX_EMAIL_SIZE` / `MAX_EMAIL_SIZE_POLICY` | same | same; size is also stored per mail |
| `WORKERS_AI_MODEL` / `OPENAI_*` / `SUMMARY_TARGET_LANG` | same | Moved into the Mini App settings, including the API key; importing copies the legacy values |
| `RESEND_API_KEY` | reply from Telegram | reply from Telegram and the Mini App |
| `WHITE_LIST` / `BLOCK_LIST` | merged with KV lists | optional seed for the D1 lists; manage entries in the Mini App |
| `DEBUG` | adds a `Debug` button | same |
| — | `Text` / `HTML` push buttons | removed; replaced by `Open` (deep link into the Mini App) |

Bindings:

| Binding | 1.0 | 2.0 |
|:--------|:-------------------|:------------------------------------------|
| `DB`    | KV Namespace       | **D1 Database** (run the migrations!)      |
| `BUCKET`| —                  | R2 Bucket, optional: attachments & large bodies |
| `AI`    | Workers AI, optional | same                                     |
| `KV`    | —                  | KV Namespace, optional: first-time `/start` memory |

## 5. FAQ

**Will my old emails show up in the Mini App?**
No. 1.0 did not store mail, so the inbox starts empty and fills up from the moment you deploy 2.0.

**Do I have to create an R2 bucket?**
No, it's optional. Without `BUCKET`, mail is stored in D1 without attachment contents (large bodies are truncated by the size policy setting).

**Do I have to create the KV namespace?**
No. It only remembers which chats already completed the first-time `/start` setup prompt. Without it, that prompt simply appears again next time.

**Can I keep the same bot and Email Routing setup?**
Yes. Keep `TELEGRAM_TOKEN`, `TELEGRAM_ID` and `DOMAIN` unchanged, redeploy, then call `/init` once.

**Deployment fails with a bindings error?**
If you deploy manually, an empty `database_id` / `bucket_name` / KV `id` in `wrangler.jsonc` is invalid — fill in real ids or delete the optional binding block entirely. The Workers Builds path avoids this by omitting unconfigured bindings automatically.

**Where did the `Text` / `HTML` buttons go?**
2.0 replaces the temporary web pages with the Mini App. The `Open` button deep-links into the message's detail page, which has a sandboxed HTML view, a plain text toggle and attachments.
