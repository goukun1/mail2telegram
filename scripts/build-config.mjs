/**
 * Injects deployment ids from Cloudflare Workers Builds build variables into a
 * gitignored `wrangler.deploy.jsonc`.
 *
 * Required:
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

const databaseId = process.env.DEPLOY_D1_DATABASE_ID;
if (!databaseId) {
    fail('DEPLOY_D1_DATABASE_ID is required');
}

const databaseName = process.env.DEPLOY_D1_DATABASE_NAME || 'mail2telegram';
config.d1_databases = [
    {
        binding: 'DB',
        database_name: databaseName,
        database_id: databaseId,
    },
];

const bucketName = process.env.DEPLOY_R2_BUCKET_NAME;
if (bucketName) {
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
const kvNamespaceId = process.env.DEPLOY_KV_NAMESPACE_ID;
if (kvNamespaceId) {
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
console.log(`[build-config] wrote ${targetPath} from ${sourcePath} (d1=${databaseName}, r2=${bucketName || 'disabled'}, kv=${kvNamespaceId || 'disabled'})`);
