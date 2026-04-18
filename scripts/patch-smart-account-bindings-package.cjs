#!/usr/bin/env node
/**
 * After `stellar contract bindings typescript --overwrite`, restore npm package
 * metadata so clash-frontend can depend on `smart-account-kit-bindings` (file:).
 */
const fs = require('fs');

const pkgPath = process.argv[2];
if (!pkgPath) {
  console.error('Usage: patch-smart-account-bindings-package.cjs <package.json path>');
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
Object.assign(j, {
  name: 'smart-account-kit-bindings',
  version: '0.1.3',
  description:
    'Generated from contracts/oz-smart-account WASM; replaces npm 0.1.x for stellar-accounts 0.7 ContextRule layout.',
  type: 'module',
  main: './dist/index.js',
  exports: './dist/index.js',
  typings: 'dist/index.d.ts',
  scripts: {
    build: 'tsc',
    prepare: 'npm run build',
  },
  dependencies: {
    '@stellar/stellar-sdk': '^14.1.1',
    buffer: '6.0.3',
  },
  devDependencies: {
    typescript: '^5.6.2',
  },
});
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n');
