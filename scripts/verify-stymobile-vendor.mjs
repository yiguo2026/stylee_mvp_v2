import { fileURLToPath } from 'node:url';

import { verifyStymobileVendor } from './stymobile-vendor-contract.mjs';

function repositoryRootFromArguments(arguments_) {
  if (arguments_.length === 0) return fileURLToPath(new URL('..', import.meta.url));
  if (arguments_.length === 2 && arguments_[0] === '--repository-root' && arguments_[1] !== '') {
    return arguments_[1];
  }
  throw new Error('invalid_arguments');
}

try {
  const result = await verifyStymobileVendor({
    repositoryRoot: repositoryRootFromArguments(process.argv.slice(2)),
  });
  process.stdout.write(`Verified stymobile vendor: ${result.sourceCommit} ${result.packages.join(' ')}\n`);
} catch (error) {
  const identifier =
    error instanceof Error && /^[a-z][a-z0-9_]*$/u.test(error.message)
      ? error.message
      : 'vendor_verification_failed';
  process.stderr.write(`${identifier}\n`);
  process.exitCode = 1;
}
