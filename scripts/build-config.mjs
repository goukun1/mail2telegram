/**
 * Injects deployment ids into a gitignored `wrangler.deploy.jsonc`.
 *
 * Reads the tracked, public `wrangler.jsonc`, which holds provisionable
 * placeholders instead of real resource ids. Each value resolves in order:
 *   1. the DEPLOY_* environment variable (how CI and manual deploys inject ids),
 *   2. the binding already present in the config.
 * The provisionable default means "not configured": an empty D1 id fails the
 * build, and a missing R2 binding is dropped.
 *
 * A config that already carries a real D1 id and no DEPLOY_D1_DATABASE_ID has
 * been provisioned for this deployment -- by a Deploy to Cloudflare button, or
 * by editing real ids in the config yourself -- so its bindings are used as-is.
 * That is what keeps a button-provisioned R2 bucket bound.
 *
 * Required:
 *   DEPLOY_D1_DATABASE_ID (or a real d1_databases[0].database_id in the config)
 * Optional (defaults below):
 *   DEPLOY_D1_DATABASE_NAME   (default: mail2telegram)
 *   DEPLOY_R2_BUCKET_NAME     (manual deploys omit it to disable attachments)
 *   DEPLOY_R2_PREVIEW_BUCKET_NAME
 *
 * Runtime variables (TELEGRAM_ID, TELEGRAM_TOKEN; DOMAIN is optional) are not
 * handled here; set them in the dashboard under Settings → Variables and
 * Secrets.
 *
 * Usage: node scripts/build-config.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = `${root}wrangler.jsonc`;
const targetPath = `${root}wrangler.deploy.jsonc`;

function fail(message) {
    console.error(`[build-config] ${message}`);
    process.exit(1);
}

function stripJsonComments(input) {
    let output = '';
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        const next = input[i + 1];
        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false;
                output += char;
            }
            continue;
        }
        if (inBlockComment) {
            if (char === '*' && next === '/') {
                inBlockComment = false;
                i += 1;
            }
            continue;
        }
        if (!inString && char === '/' && next === '/') {
            inLineComment = true;
            i += 1;
            continue;
        }
        if (!inString && char === '/' && next === '*') {
            inBlockComment = true;
            i += 1;
            continue;
        }
        // Inside a string an escaped quote (`\\"`) must not toggle the string,
        // so copy the escape sequence verbatim.
        if (inString && char === '\\') {
            output += char + (next ?? '');
            i += 1;
            continue;
        }
        if (char === '"' && input[i - 1] !== '\\') {
            inString = !inString;
        }
        output += char;
    }
    return output;
}

let config;
try {
    config = JSON.parse(stripJsonComments(readFileSync(sourcePath, 'utf8')));
} catch (error) {
    fail(`failed to read ${sourcePath}: ${error.message}`);
}

// `local` (and an empty value) marks a provisionable placeholder binding.
function isPlaceholder(value) {
    return !value || value === 'local';
}

const explicitDatabaseId = process.env.DEPLOY_D1_DATABASE_ID;
const configDatabaseId = config.d1_databases?.[0]?.database_id;
const databaseId = explicitDatabaseId || configDatabaseId;
if (isPlaceholder(databaseId)) {
    // This message is read from a CI log, so name the fix and show which
    // DEPLOY_* variables did arrive (names only) to point at the missing one.
    const seen = Object.keys(process.env)
        .filter(key => key.startsWith('DEPLOY_'))
        .toSorted();
    fail(
        'DEPLOY_D1_DATABASE_ID is required (or set a real d1_databases[0].database_id in the config).\n' +
            '  On Cloudflare Workers Builds, add it under Settings -> Build -> Build variables and secrets.\n' +
            '  GitHub repository variables are a different store and are not visible here.\n' +
            (seen.length > 0
                ? `  DEPLOY_* variables currently set: ${seen.join(', ')}`
                : '  No DEPLOY_* variables are set in this environment.'),
    );
}

// Real ids already in the config with no DEPLOY_* override mean the resources
// were provisioned for this deployment (Deploy to Cloudflare button, or real
// ids edited in by hand). Such a config is deployed verbatim so provisioned
// optional bindings are not dropped; otherwise only explicitly requested ones
// are added.
const provisioned = !explicitDatabaseId && !isPlaceholder(configDatabaseId);

const databaseName = process.env.DEPLOY_D1_DATABASE_NAME || config.d1_databases?.[0]?.database_name || 'mail2telegram';
// Rebuilt from scratch, so carry migrations_dir across: it now lives in the
// server package, and dropping it would send `d1 migrations apply` looking in
// the repo-root `migrations/` directory, which no longer exists.
const migrationsDir = config.d1_databases?.[0]?.migrations_dir;
config.d1_databases = [
    {
        binding: 'DB',
        database_name: databaseName,
        database_id: databaseId,
        ...(migrationsDir ? { migrations_dir: migrationsDir } : {}),
    },
];

const bucketName =
    process.env.DEPLOY_R2_BUCKET_NAME ||
    (provisioned ? config.r2_buckets?.find(item => item.binding === 'BUCKET')?.bucket_name : undefined);
if (!isPlaceholder(bucketName)) {
    const bucket = {
        binding: 'BUCKET',
        bucket_name: bucketName,
    };
    if (process.env.DEPLOY_R2_PREVIEW_BUCKET_NAME) {
        bucket.preview_bucket_name = process.env.DEPLOY_R2_PREVIEW_BUCKET_NAME;
    }
    config.r2_buckets = [bucket];
} else {
    delete config.r2_buckets;
}

writeFileSync(targetPath, `${JSON.stringify(config, null, 4)}\n`);
console.log(
    `[build-config] wrote ${targetPath} from ${sourcePath} (d1=${databaseName}, r2=${!isPlaceholder(bucketName) ? bucketName : 'disabled'})`,
);
