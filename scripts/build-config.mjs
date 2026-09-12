/**
 * Injects deployment ids into a gitignored `wrangler.deploy.jsonc`.
 *
 * Each value resolves in order:
 *   1. the DEPLOY_* environment variable (how CI builds inject ids),
 *   2. the binding already present in the source config (handy for manual
 *      deploys: keep the real ids in your gitignored `wrangler.jsonc`).
 * The `local` placeholder used for `wrangler dev` state means "not configured":
 * a missing D1 id fails the build, missing R2/KV bindings are omitted.
 *
 * Required for CI:
 *   DEPLOY_D1_DATABASE_ID
 * Optional (defaults below):
 *   DEPLOY_D1_DATABASE_NAME   (default: mail2telegram)
 *   DEPLOY_R2_BUCKET_NAME     (omit to remove the R2 binding)
 *   DEPLOY_R2_PREVIEW_BUCKET_NAME
 *   DEPLOY_KV_NAMESPACE_ID    (omit to remove the KV binding)
 *
 * Usage: node scripts/build-config.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// `wrangler.jsonc` is gitignored, so CI builds fall back to the tracked template.
const sourcePath = existsSync(`${root}wrangler.jsonc`)
    ? `${root}wrangler.jsonc`
    : `${root}wrangler.example.jsonc`;
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

// `local` (and an empty value) marks a `wrangler dev` placeholder binding.
function isPlaceholder(value) {
    return !value || value === 'local';
}

const databaseId = process.env.DEPLOY_D1_DATABASE_ID
    || config.d1_databases?.[0]?.database_id;
if (isPlaceholder(databaseId)) {
    fail('DEPLOY_D1_DATABASE_ID is required (or set a real d1_databases[0].database_id in the config)');
}

// `DEV_BYPASS_AUTH` disables Mini App signature validation and must never
// reach a deployed worker, even if it was added to the local config.
if (config.vars && Object.hasOwn(config.vars, 'DEV_BYPASS_AUTH')) {
    delete config.vars.DEV_BYPASS_AUTH;
    console.warn('[build-config] removed DEV_BYPASS_AUTH from deploy vars (local-only setting)');
}

const databaseName = process.env.DEPLOY_D1_DATABASE_NAME
    || config.d1_databases?.[0]?.database_name
    || 'mail2telegram';
config.d1_databases = [
    {
        binding: 'DB',
        database_name: databaseName,
        database_id: databaseId,
    },
];

const bucketName = process.env.DEPLOY_R2_BUCKET_NAME
    || config.r2_buckets?.find(item => item.binding === 'BUCKET')?.bucket_name;
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

// KV remembers which chats already finished the first-time setup prompt.
const kvNamespaceId = process.env.DEPLOY_KV_NAMESPACE_ID
    || config.kv_namespaces?.find(item => item.binding === 'KV')?.id;
if (!isPlaceholder(kvNamespaceId)) {
    config.kv_namespaces = [
        {
            binding: 'KV',
            id: kvNamespaceId,
        },
    ];
} else {
    delete config.kv_namespaces;
}

writeFileSync(targetPath, `${JSON.stringify(config, null, 4)}\n`);
console.log(`[build-config] wrote ${targetPath} from ${sourcePath} (d1=${databaseName}, r2=${!isPlaceholder(bucketName) ? bucketName : 'disabled'}, kv=${!isPlaceholder(kvNamespaceId) ? kvNamespaceId : 'disabled'})`);
