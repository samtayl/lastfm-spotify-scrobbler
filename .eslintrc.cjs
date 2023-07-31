module.exports = {
  root: true,
  extends: [
    '@samtayl',
    '@samtayl/import',
    '@samtayl/node',
  ],
  env: {
    es2024: true,
  },
  parserOptions: {
    ecmaVersion: '2024',
    sourceType: 'module',
  },
  rules: {
    camelcase: [
      'warn',
      {
        allow: [
          'grant_type',
          'refresh_token',
          'api_key',
        ],
      },
    ],
    'node/no-unsupported-features/es-syntax': [
      'error',
      {
        ignores: [
          'modules',
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
      },
      rules: {
        'node/no-unsupported-features/es-syntax': [
          'error',
          {
            ignores: [],
          },
        ],
      },
    },
  ],
};
