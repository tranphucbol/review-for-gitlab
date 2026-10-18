// Resolves the `@shared/` alias of vite.config.shared.js for eslint-plugin-import,
// then defers to its node resolver.
const path = require('path');
const nodeResolver = require('eslint-import-resolver-node');

const SHARED_ALIAS = '@shared/';
const SHARED_DIR = path.join(__dirname, 'shared');

exports.interfaceVersion = 2;

exports.resolve = (source, file, config) =>
  nodeResolver.resolve(
    source.startsWith(SHARED_ALIAS)
      ? path.join(SHARED_DIR, source.slice(SHARED_ALIAS.length))
      : source,
    file,
    config,
  );
