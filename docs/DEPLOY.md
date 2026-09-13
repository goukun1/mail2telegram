
# Deployment Guide

English | [中文](./DEPLOY_CN.md)

This guide installs **mail2telegram 2.0** from scratch. If you are upgrading an existing 1.0 deployment, follow the [Migration Guide](./MIGRATION.md) ([中文](./MIGRATION_CN.md)) instead — it reuses the deploy steps below and adds the data migration.

## 1. Configure Telegram

1. Create a bot with `@BotFather > /newbot` and copy the token.
2. Mini Apps require a privacy policy: `@BotFather > /mybots > (select your bot) > Edit Bot > Edit Privacy Policy`, set it to `https://telegram.org/privacy-tpa`.
3. After deployment, call `https://your-worker-domain/init` once to bind the webhook and set the menu button (repeated in [First run](#6-first-run)).

## 2. Create storage

```bash
npx wrangler d1 create mail2telegram                 # required
npx wrangler r2 bucket create mail2telegram          # optional: attachments
```

Note the D1 **database id** from the output. R2 is optional — without a `BUCKET` binding, mail is stored in D1 without attachment contents.

## 3. Deploy

### Option A — Cloudflare Workers Builds (recommended)

Once the repository is connected, every push to the production branch builds and deploys automatically -- no CLI credentials or CI configuration to maintain.

1. Fork or push this repository to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Connect to Git**, select the repository.
3. Set the build settings:

   | Setting                             | Value                                      |
   |:------------------------------------|:-------------------------------------------|
   | Production branch                   | `master`                                   |
   | Build command                       | `pnpm build`                               |
   | Deploy command                      | `pnpm run deploy`                          |
   | Root directory                      | Leave empty (repository root)              |
   | Non-production branch deploy command | Keep the default (`npx wrangler versions upload`) |

   `pnpm run deploy` injects the resource ids, applies D1 migrations, builds the Mini App and deploys the worker. The `run` is required -- `pnpm deploy` without it collides with pnpm's built-in workspace command.
4. Add the **build variables** (**Settings → Environment variables**; readable during the build only):

   | Build variable                  | Required | Description                                             |
   |:--------------------------------|:---------|:--------------------------------------------------------|
   | `DEPLOY_D1_DATABASE_ID`         | Yes      | D1 database id from `wrangler d1 create`.               |
   | `DEPLOY_D1_DATABASE_NAME`       | No       | D1 database name, default `mail2telegram`.              |
   | `DEPLOY_R2_BUCKET_NAME`         | No       | R2 bucket for attachments. Omit to disable attachments. |
   | `DEPLOY_R2_PREVIEW_BUCKET_NAME` | No       | R2 bucket used for preview deployments.                 |

   `scripts/build-config.mjs` injects these into the generated, gitignored `wrangler.deploy.jsonc`; the tracked `wrangler.jsonc` holds only `local` placeholders, so **never put production ids in it**.
5. **No deploy credential to configure.** Cloudflare generates a deploy token automatically when you connect the repository -- you do not paste a `CLOUDFLARE_API_TOKEN` as in Option B. That token already includes D1 write access, so the D1 migration step authenticates. Only if the migration step fails with `Authentication error [code: 10000]` or `7403` do you need to add `D1 Edit` to it under **My Profile → API Tokens**.
6. **Confirm the binding names**: `DB` (D1), `BUCKET` (R2, when attachments are enabled) and `AI` (Workers AI). `scripts/build-config.mjs` writes them into the generated config, so there is nothing to edit by hand.
7. Under **Settings → Variables and Secrets**, add the runtime variables from [Runtime variables](#4-runtime-variables-and-bindings). Build variables are readable at build time only, not at runtime, so the runtime values must be set here; `keep_vars: true` stops a later deploy from deleting them. Put `TELEGRAM_TOKEN` and `RESEND_API_KEY` in the encrypted **Secrets** section.

### Option B — GitHub Actions

The repository ships [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) as a manual fallback: triggered from the Actions tab, it builds the Mini App, applies D1 migrations and deploys the worker. It deliberately does not run on push, because Workers Builds (Option A) already deploys every push -- running both would deploy twice for one commit.

1. Under the repository's **Settings → Secrets and variables → Actions → Variables**, add:

   | Variable                 | Required | Description                                             |
   |:-------------------------|:---------|:--------------------------------------------------------|
   | `CLOUDFLARE_ACCOUNT_ID`  | Yes      | Account id, from `wrangler whoami` or the dashboard.    |
   | `DEPLOY_D1_DATABASE_ID`  | Yes      | D1 database id from `wrangler d1 create`.               |
   | `DEPLOY_R2_BUCKET_NAME`  | No       | R2 bucket for attachments. Omit to disable attachments. |

2. Create a Cloudflare API token under **My Profile → API Tokens**: start from the **Edit Cloudflare Workers** template and add the `D1 Edit`, `Workers R2 Storage Edit` and `Workers AI Edit` permissions. Add it as the repository **secret** `CLOUDFLARE_API_TOKEN` (Secrets tab).

3. Run the workflow from the **Actions** tab. Use only this option or Workers Builds, not both, so the worker is not deployed twice.

### Option C — Command line

Requirements: Node.js 20.19+ (Vite 7) and pnpm. Log in with `npx wrangler login` first.

```bash
git clone git@github.com:TBXark/mail2telegram.git
cd mail2telegram
pnpm install
```

The tracked `wrangler.jsonc` is public and holds only `local` placeholders, so there is nothing to edit. Pass your resource ids through the `DEPLOY_*` variables and deploy:

```bash
DEPLOY_D1_DATABASE_ID=your-d1-id \
DEPLOY_R2_BUCKET_NAME=mail2telegram \
pnpm run deploy   # applies D1 migrations, builds the Mini App, deploys the worker
```

`DEPLOY_R2_BUCKET_NAME` is optional — omit it to deploy without attachments. `DEPLOY_D1_DATABASE_NAME` defaults to `mail2telegram`.

Set the runtime variables (`DOMAIN`, `TELEGRAM_ID`, `TELEGRAM_TOKEN`, and optionally `RESEND_API_KEY`) afterwards under **Settings → Variables and Secrets** in the dashboard, as in Option A. `keep_vars: true` in `wrangler.jsonc` means later deploys will not delete them.

`scripts/build-config.mjs` resolves the ids into a generated, gitignored `wrangler.deploy.jsonc`; a `local` placeholder binding is skipped instead of deployed.

## 4. Runtime variables and bindings

All behavior is configured in the Mini App; the worker itself only needs a few variables for its Telegram identity and optional API keys.

Location: Workers & Pages → your_worker → Settings → Variables and Secrets. These are **not** set in `wrangler.jsonc`.

| KEY              | Description                                                                                                                                                            |
|:-----------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TELEGRAM_ID`    | Required. Destination chat IDs, comma separated. Get yours from `@userinfobot`. Groups start with `-100`.                                                              |
| `TELEGRAM_TOKEN` | Required. Telegram Bot Token, e.g. `7123456780:AAjkLAbvSgDdfsDdfsaSK0`.                                                                                                |
| `DOMAIN`         | Required. Worker domain, e.g. `project_name.user_name.workers.dev`. Used for webhook and Mini App links.                                                               |
| `WEB_PASSWORD`   | Optional. Password for opening the Mini App in a plain browser outside Telegram. Leave unset or empty to allow only the Telegram Mini App.                              |
| `RESEND_API_KEY` | Optional. Resend API Key, https://resend.com/docs/introduction. Enables replying to emails from Telegram or the Mini App.                                               |
| `DEBUG`          | Optional. When `true`, adds a `Debug` button to pushes.                                                                                                                 |

Everything else lives in **Settings** inside the Mini App: allow/block lists with regex matching, block policy, forwarding, summary options (Workers AI, or an OpenAI-compatible base URL + token, with the model picked from the provider's list or typed manually), the duplicate-notification guard, and mail handling limits (retention and size policy).

If you deployed 1.0 earlier and configured behavior through variables, open **Settings → Bot & Webhook → Import from Environment** in the Mini App to copy them into the stored settings, then remove the variables — see the [Migration Guide](./MIGRATION.md).

Bindings:

| Binding  | Type              | Description                                          |
|:---------|:------------------|:-----------------------------------------------------|
| `DB`     | D1 Database       | Required. Mail history, address lists and settings.  |
| `BUCKET` | R2 Bucket         | Attachments and large email bodies. Optional.        |
| `AI`     | Workers AI        | Optional, for summaries.                             |

`DB` and `BUCKET` are wired up automatically from `DEPLOY_D1_DATABASE_ID` / `DEPLOY_R2_BUCKET_NAME`; you never edit binding ids in `wrangler.jsonc`.

## 5. Configure Cloudflare Email Routing

1. Set up [Cloudflare Email Routing](https://blog.cloudflare.com/introducing-email-routing/) on your domain.
2. In `Email Routing → Routing Rules`, set `Catch-all address` to `Send to a Worker: mail2telegram`.
3. For a backup copy of every mail, enable forwarding in the Mini App and add your backup address. The address must be verified under `Email Routing → Destination addresses`.

## 6. First run

1. Call `https://your-worker-domain/init` once.
2. Send `/start` to your bot and open the Mini App from the menu button.
3. Add white list / block list entries in Settings — everything else can also be tuned there later.

## 7. FAQ

**Do I have to create an R2 bucket?**
No, it's optional. Without `BUCKET`, mail is stored in D1 without attachment contents (large bodies are truncated by the size policy setting).

**Deployment fails with a bindings error?**
`DEPLOY_D1_DATABASE_ID` is required — the build stops with a clear message if it is missing. `DEPLOY_R2_BUCKET_NAME` is optional: without it the R2 binding is omitted automatically, so you never have to edit or delete binding blocks by hand.
