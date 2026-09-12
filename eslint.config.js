import antfu, { imports, javascript, jsdoc, node, typescript } from '@antfu/eslint-config';

/** @type {import('eslint-flat-config-utils').FlatConfigComposer} */
const config = antfu(
    {
        type: 'app',
        stylistic: {
            indent: 4,
            quotes: 'single',
            semi: true,
            // @ts-ignore
            braceStyle: '1tbs',
        },
        markdown: false,
        typescript: true,
        ignores: [
            '.github/**',
            '.idea/**',
            '.vscode/**',
            '.wrangler/**',
            'build/**',
            'dist/**',
            'node_modules/**',
        ],
    },
    imports,
    jsdoc,
    typescript,
    javascript,
    node,
    {
        rules: {
            'jsdoc/no-undefined-types': 'off',
            'jsdoc/require-returns-description': 'off',
            'jsdoc/require-property-description': 'off',
            'jsdoc/require-param-description': 'off',
            'node/prefer-global/process': 'off',
            'node/prefer-global/buffer': 'off',
            'eslint-comments/no-unlimited-disable': 'off',
            'padding-line-between-statements': 'off',
            'no-console': 'off',
            'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            // Compact inline ternaries are idiomatic in JSX conditional rendering.
            'style/multiline-ternary': 'off',
            // The React Hooks plugin is not part of the base config, but the
            // disables are still referenced in hooks and pages.
            'react-hooks/exhaustive-deps': 'off',
        },
    },
);

export default config;
