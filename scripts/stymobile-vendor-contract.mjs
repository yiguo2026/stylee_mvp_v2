import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EXPECTED_SOURCE_COMMIT = 'a2c1342878aa5fcd1ad21651085d319bda19a3e1';
export const EXPECTED_SOURCE_TREE = '03814cceb1084c94c33898d1e315c035a441d045';
export const EXPECTED_PACKAGE_NAMES = Object.freeze([
  '@stymobile/contracts',
  '@stymobile/core',
  '@stymobile/api-client',
]);

const VENDOR_DIRECTORY = join('vendor', 'stymobile', EXPECTED_SOURCE_COMMIT);
const EXPECTED_PROVENANCE = Object.freeze({
  schema_version: 2,
  source: Object.freeze({
    repository: 'https://github.com/fitzw/stymobile',
    commit: EXPECTED_SOURCE_COMMIT,
    tree: EXPECTED_SOURCE_TREE,
  }),
  toolchain: Object.freeze({
    node: '22.22.1',
    npm: '11.12.1',
    commands: Object.freeze([
      'npm ci --ignore-scripts --no-audit --no-fund --offline',
      'npm run build',
      'npm pack --ignore-scripts --json ./packages/contracts ./packages/core ./packages/api-client',
    ]),
  }),
  packages: Object.freeze([
    Object.freeze({
      name: '@stymobile/contracts',
      version: '0.3.0',
      dependencies: Object.freeze({}),
      file: 'stymobile-contracts-0.3.0.tgz',
      size: 3828,
      unpacked_size: 11505,
      shasum: '6e3938f2d63ffb1b132047ab5cc426b6e338134d',
      integrity:
        'sha512-lb0Zrd8Z9A4qchX3zkeaBVTz500l18uhzhXS5mUHg37EKvooNSiYbQ3/n6ArGBiDeeO1PZhs3UIaFeJ7+UQs+w==',
      tarball_sha256: '1749daf8244819cf25753c74c8fb00e4a3b1481153c86b66fb15107b33e0fd3e',
      source_manifest_sha256: '8e535015bfa9788dfc1ce77e49309de7b244894cde9544aa7fa89f747c7d9e3c',
      files: Object.freeze([
        'README.md',
        'dist/auth.d.ts',
        'dist/auth.js',
        'dist/command-result.d.ts',
        'dist/command-result.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/style-preferences.d.ts',
        'dist/style-preferences.js',
        'package.json',
      ]),
    }),
    Object.freeze({
      name: '@stymobile/core',
      version: '0.3.0',
      dependencies: Object.freeze({ '@stymobile/contracts': '0.3.0' }),
      file: 'stymobile-core-0.3.0.tgz',
      size: 4921,
      unpacked_size: 18086,
      shasum: '4c5044289ad39e9294344bb4e8d4637f955e5871',
      integrity:
        'sha512-bTr5m4dBv5LBQrnjycwUc6B2zapGaGIDbhJK6fG5WipQp/qyjjPVs4n2vI6DaR9Xf24Mjd7KjDtb/i6CjbuL6g==',
      tarball_sha256: 'd1f1ad8c765ad7e6143192778de96ec90ae26f56f9eaf755e907542732f341f7',
      source_manifest_sha256: '3e318728aaaeaa3acb926810e084da032b22fc97e37dfcc132653eb4e23c1ded',
      files: Object.freeze([
        'README.md',
        'dist/account-scope.d.ts',
        'dist/account-scope.js',
        'dist/entity-revision.d.ts',
        'dist/entity-revision.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/scoped-command.d.ts',
        'dist/scoped-command.js',
        'dist/scoped-read.d.ts',
        'dist/scoped-read.js',
        'dist/style-preference-aggregate.d.ts',
        'dist/style-preference-aggregate.js',
        'package.json',
      ]),
    }),
    Object.freeze({
      name: '@stymobile/api-client',
      version: '0.2.1',
      dependencies: Object.freeze({
        '@stymobile/contracts': '0.3.0',
        '@stymobile/core': '0.3.0',
      }),
      file: 'stymobile-api-client-0.2.1.tgz',
      size: 19813,
      unpacked_size: 85875,
      shasum: 'c20e8bb6c6c987a6fe156e34277c350ed6e4e279',
      integrity:
        'sha512-RfEZlJL7YUC5N9Wf5cn1Jb/Q2liEANkDUbSruUZUOlGTk9ICUrE+ocT4fBoGjmNl+Eao8hsTPAJOJsaOKY0PSg==',
      tarball_sha256: 'eb89413a29a011003dc6ca0637403d60c0c0191a0e63496ae374d50c9dd997cf',
      source_manifest_sha256: '76096ee165fec8f081a2614f392465cd266e3a47556d3c2c4731c60481e8648f',
      files: Object.freeze([
        'README.md',
        'dist/auth-controller.d.ts',
        'dist/auth-controller.js',
        'dist/auth-flight.d.ts',
        'dist/auth-flight.js',
        'dist/auth-port.d.ts',
        'dist/auth-port.js',
        'dist/auth-profile.d.ts',
        'dist/auth-profile.js',
        'dist/auth-validation.d.ts',
        'dist/auth-validation.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/style-preference-controller.d.ts',
        'dist/style-preference-controller.js',
        'dist/style-preference-decode.d.ts',
        'dist/style-preference-decode.js',
        'dist/style-preference-port.d.ts',
        'dist/style-preference-port.js',
        'dist/supabase-auth-decode.d.ts',
        'dist/supabase-auth-decode.js',
        'dist/supabase-auth-port.d.ts',
        'dist/supabase-auth-port.js',
        'dist/supabase-auth-types.d.ts',
        'dist/supabase-auth-types.js',
        'dist/supabase-style-preference-port.d.ts',
        'dist/supabase-style-preference-port.js',
        'package.json',
      ]),
    }),
  ]),
});

const sensitiveArtifactPath =
  /(^|\/)(?:\.env(?:\..*)?|credentials\.json|[^/]+\.(?:p8|p12|pfx|pem|key|jks|keystore|mobileprovision|provisionprofile|cer))$/i;
const prohibitedArtifactPath = /(^|\/)(?:tests?|src|signing)(\/|$)|(^|\/)\.tsbuildinfo$/i;
const errorIdentifiers = new Set([
  'artifact_dependency_mismatch',
  'artifact_file_list_mismatch',
  'artifact_manifest_invalid',
  'artifact_manifest_mismatch',
  'artifact_must_be_regular_file',
  'artifact_path_invalid',
  'artifact_prohibited_path',
  'artifact_sensitive_path',
  'artifact_tar_invalid',
  'artifact_unpacked_size_mismatch',
  'compiler_path_invalid',
  'isolated_consumer_failed',
  'lockfile_dependency_mismatch',
  'lockfile_integrity_mismatch',
  'lockfile_invalid',
  'lockfile_package_mismatch',
  'lockfile_resolution_mismatch',
  'package_list_mismatch',
  'package_manifest_invalid',
  'package_resolution_mismatch',
  'provenance_invalid',
  'provenance_mismatch',
  'provenance_path_invalid',
  'repository_manifest_must_be_regular_file',
  'repository_root_invalid',
  'schema_version_mismatch',
  'source_commit_mismatch',
  'source_manifest_mismatch',
  'source_repository_mismatch',
  'source_tree_mismatch',
  'tarball_integrity_mismatch',
  'tarball_sha256_mismatch',
  'tarball_shasum_mismatch',
  'tarball_size_mismatch',
  'third_stymobile_package',
  'toolchain_mismatch',
  'vendor_verification_failed',
]);

function fail(identifier) {
  throw new Error(identifier);
}

function isBeneath(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '' && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

async function requireRegularFile(path, identifier = 'artifact_must_be_regular_file') {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isFile()) fail(identifier);
    return status;
  } catch (error) {
    if (error instanceof Error && error.message === identifier) throw error;
    fail(identifier);
  }
}

async function readJson(path, identifier) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail(identifier);
  }
}

function bytewiseSort(paths) {
  return [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

async function runFile(command, args, options, identifier) {
  try {
    return await execFileAsync(command, args, { ...options, shell: false });
  } catch {
    fail(identifier);
  }
}

function assertSafeArtifactPath(path) {
  if (
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/u.test(path) ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '' || segment === '.')
  ) {
    fail('artifact_path_invalid');
  }
  if (sensitiveArtifactPath.test(path)) fail('artifact_sensitive_path');
  if (prohibitedArtifactPath.test(path)) fail('artifact_prohibited_path');
}

function assertExactProvenance(provenance) {
  if (provenance?.schema_version !== 2) fail('schema_version_mismatch');
  if (provenance?.source?.repository !== EXPECTED_PROVENANCE.source.repository) {
    fail('source_repository_mismatch');
  }
  if (provenance?.source?.commit !== EXPECTED_SOURCE_COMMIT) fail('source_commit_mismatch');
  if (provenance?.source?.tree !== EXPECTED_SOURCE_TREE) fail('source_tree_mismatch');
  if (!isDeepStrictEqual(provenance?.toolchain, EXPECTED_PROVENANCE.toolchain)) {
    fail('toolchain_mismatch');
  }
  if (
    !Array.isArray(provenance?.packages) ||
    !isDeepStrictEqual(
      provenance.packages.map((entry) => entry?.name),
      EXPECTED_PACKAGE_NAMES,
    )
  ) {
    fail('package_list_mismatch');
  }
  if (!isDeepStrictEqual(provenance, EXPECTED_PROVENANCE)) fail('provenance_mismatch');
}

export async function verifyStymobilePackageArtifact({ packageRecord, tarballPath }) {
  const status = await requireRegularFile(tarballPath);
  assertSafeArtifactPath(packageRecord.file);
  if (status.size !== packageRecord.size) fail('tarball_size_mismatch');

  const bytes = await readFile(tarballPath);
  const shasum = createHash('sha1').update(bytes).digest('hex');
  if (shasum !== packageRecord.shasum) fail('tarball_shasum_mismatch');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== packageRecord.tarball_sha256) fail('tarball_sha256_mismatch');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (integrity !== packageRecord.integrity) fail('tarball_integrity_mismatch');

  const { stdout: listing } = await runFile(
    'tar',
    ['-tzf', tarballPath],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    'artifact_tar_invalid',
  );
  const paths = listing.split(/\r?\n/u).filter(Boolean).map((archivePath) => {
    if (!archivePath.startsWith('package/')) fail('artifact_path_invalid');
    const normalized = archivePath.slice('package/'.length);
    assertSafeArtifactPath(normalized);
    return normalized;
  });
  if (!isDeepStrictEqual(bytewiseSort(paths), packageRecord.files)) {
    fail('artifact_file_list_mismatch');
  }

  let unpackedSize = 0;
  let sourceManifest;
  for (const path of paths) {
    const { stdout } = await runFile(
      'tar',
      ['-xOf', tarballPath, `package/${path}`],
      { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 },
      'artifact_tar_invalid',
    );
    unpackedSize += stdout.length;
    if (path === 'package.json') sourceManifest = stdout;
  }
  if (unpackedSize !== packageRecord.unpacked_size) fail('artifact_unpacked_size_mismatch');
  if (!sourceManifest) fail('artifact_manifest_invalid');
  if (createHash('sha256').update(sourceManifest).digest('hex') !== packageRecord.source_manifest_sha256) {
    fail('source_manifest_mismatch');
  }

  let packageManifest;
  try {
    packageManifest = JSON.parse(sourceManifest.toString('utf8'));
  } catch {
    fail('artifact_manifest_invalid');
  }
  if (
    packageManifest.name !== packageRecord.name ||
    packageManifest.version !== packageRecord.version ||
    packageManifest.private !== true ||
    packageManifest.license !== 'UNLICENSED'
  ) {
    fail('artifact_manifest_mismatch');
  }
  if (!isDeepStrictEqual(packageManifest.dependencies ?? {}, packageRecord.dependencies)) {
    fail('artifact_dependency_mismatch');
  }
}

function stymobileNames(record, sections) {
  return sections.flatMap((section) => Object.keys(record?.[section] ?? {}))
    .filter((name) => name.startsWith('@stymobile/'));
}

function assertNoUnexpectedStymobile(packageManifest, lockfile) {
  const allowed = new Set(EXPECTED_PACKAGE_NAMES);
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const rootManifestNames = stymobileNames(packageManifest, sections);
  const rootLockNames = stymobileNames(lockfile.packages?.[''], sections);
  if (
    rootManifestNames.some((name) => !allowed.has(name)) ||
    rootLockNames.some((name) => !allowed.has(name)) ||
    stymobileNames(packageManifest, sections.slice(1)).length !== 0 ||
    stymobileNames(lockfile.packages?.[''], sections.slice(1)).length !== 0
  ) {
    fail('third_stymobile_package');
  }

  const allowedPaths = new Set(EXPECTED_PACKAGE_NAMES.map((name) => `node_modules/${name}`));
  const installedPaths = Object.keys(lockfile.packages ?? {})
    .filter((path) => /(^|\/)node_modules\/@stymobile\//u.test(path));
  if (installedPaths.some((path) => !allowedPaths.has(path))) fail('third_stymobile_package');

  for (const [path, record] of Object.entries(lockfile.packages ?? {})) {
    if (path === '' || allowedPaths.has(path)) continue;
    if (stymobileNames(record, sections).length !== 0) fail('third_stymobile_package');
  }
}

function verifyRepositoryManifests(packageManifest, lockfile) {
  const expectedDependencies = Object.fromEntries(
    EXPECTED_PROVENANCE.packages.map((record) => [record.name, `file:${VENDOR_DIRECTORY}/${record.file}`]),
  );
  for (const [name, expectedResolution] of Object.entries(expectedDependencies)) {
    if (packageManifest.dependencies?.[name] !== expectedResolution) fail('package_resolution_mismatch');
    if (lockfile.packages?.['']?.dependencies?.[name] !== expectedResolution) {
      fail('lockfile_resolution_mismatch');
    }
    const installed = lockfile.packages?.[`node_modules/${name}`];
    const expectedRecord = EXPECTED_PROVENANCE.packages.find((record) => record.name === name);
    if (installed?.version !== expectedRecord.version || installed?.resolved !== expectedResolution) {
      fail('lockfile_resolution_mismatch');
    }
    if (installed.integrity !== expectedRecord.integrity) fail('lockfile_integrity_mismatch');
    const expectedInstalled = {
      version: expectedRecord.version,
      resolved: expectedResolution,
      integrity: expectedRecord.integrity,
      license: 'UNLICENSED',
      ...(Object.keys(expectedRecord.dependencies).length > 0
        ? { dependencies: expectedRecord.dependencies }
        : {}),
    };
    if (!isDeepStrictEqual(installed.dependencies ?? {}, expectedRecord.dependencies)) {
      fail('lockfile_dependency_mismatch');
    }
    if (!isDeepStrictEqual(installed, expectedInstalled)) fail('lockfile_package_mismatch');
  }
  if (
    packageManifest.engines?.node !== '22.x' ||
    packageManifest.engines?.npm !== '11.12.1' ||
    lockfile.packages?.['']?.engines?.node !== '22.x' ||
    lockfile.packages?.['']?.engines?.npm !== '11.12.1'
  ) {
    fail('toolchain_mismatch');
  }
  assertNoUnexpectedStymobile(packageManifest, lockfile);
}

function isolatedEnvironment(consumerRoot) {
  const environment = {};
  for (const name of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  environment.npm_config_cache = join(consumerRoot, 'npm-cache');
  environment.npm_config_offline = 'true';
  environment.npm_config_userconfig = join(consumerRoot, '.npmrc');
  environment.npm_config_globalconfig = join(consumerRoot, '.npmrc-global');
  return environment;
}

async function verifyInstalledPath(consumerRoot, packageName) {
  const installedPath = await realpath(join(consumerRoot, 'node_modules', ...packageName.split('/')));
  if (!isBeneath(consumerRoot, installedPath)) fail('isolated_consumer_failed');
}

function assertIsolatedMetadataValue(value, consumerRoot, repositoryRoot) {
  if (typeof value === 'string') {
    if (value.includes(repositoryRoot) || /^https?:\/\//u.test(value)) {
      fail('isolated_consumer_failed');
    }
    if (value.startsWith('file:')) {
      const fileResolution = value.slice('file:'.length);
      if (
        isAbsolute(fileResolution) ||
        /^[A-Za-z]:[\\/]/u.test(fileResolution) ||
        fileResolution.includes('\\') ||
        fileResolution.split('/').includes('..') ||
        !isBeneath(consumerRoot, resolve(consumerRoot, fileResolution))
      ) {
        fail('isolated_consumer_failed');
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertIsolatedMetadataValue(entry, consumerRoot, repositoryRoot);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      assertIsolatedMetadataValue(entry, consumerRoot, repositoryRoot);
    }
  }
}

async function verifyIsolatedDependencyMetadata(consumerRoot, repositoryRoot) {
  const [packageManifest, lockfile] = await Promise.all([
    readJson(join(consumerRoot, 'package.json'), 'isolated_consumer_failed'),
    readJson(join(consumerRoot, 'package-lock.json'), 'isolated_consumer_failed'),
  ]);
  const expectedDependencies = Object.fromEntries(
    EXPECTED_PROVENANCE.packages.map((record) => [record.name, `file:artifacts/${record.file}`]),
  );
  if (!isDeepStrictEqual(packageManifest.dependencies, expectedDependencies)) {
    fail('isolated_consumer_failed');
  }
  if (!isDeepStrictEqual(lockfile.packages?.['']?.dependencies, expectedDependencies)) {
    fail('isolated_consumer_failed');
  }
  const expectedLockPaths = ['', ...EXPECTED_PACKAGE_NAMES.map((name) => `node_modules/${name}`)];
  if (!isDeepStrictEqual(bytewiseSort(Object.keys(lockfile.packages ?? {})), bytewiseSort(expectedLockPaths))) {
    fail('isolated_consumer_failed');
  }
  for (const record of EXPECTED_PROVENANCE.packages) {
    const installed = lockfile.packages[`node_modules/${record.name}`];
    const expectedInstalled = {
      version: record.version,
      resolved: `file:artifacts/${record.file}`,
      integrity: record.integrity,
      license: 'UNLICENSED',
      ...(Object.keys(record.dependencies).length > 0
        ? { dependencies: record.dependencies }
        : {}),
    };
    if (!isDeepStrictEqual(installed, expectedInstalled)) fail('isolated_consumer_failed');
  }
  assertIsolatedMetadataValue(packageManifest, consumerRoot, repositoryRoot);
  assertIsolatedMetadataValue(lockfile, consumerRoot, repositoryRoot);
}

async function verifyIsolatedConsumer(repositoryRoot, tarballPaths) {
  if (process.versions.node.split('.')[0] !== '22') fail('toolchain_mismatch');
  const consumerRoot = await mkdtemp(join(tmpdir(), 'stylee-stymobile-consumer-'));
  try {
    const consumerRealRoot = await realpath(consumerRoot);
    const artifactDirectory = join(consumerRoot, 'artifacts');
    await mkdir(artifactDirectory);
    const artifactDirectoryStatus = await lstat(artifactDirectory);
    const artifactRealRoot = await realpath(artifactDirectory);
    if (
      artifactDirectoryStatus.isSymbolicLink() ||
      !artifactDirectoryStatus.isDirectory() ||
      !isBeneath(consumerRealRoot, artifactRealRoot)
    ) {
      fail('isolated_consumer_failed');
    }
    const consumerTarballPaths = [];
    for (let index = 0; index < tarballPaths.length; index += 1) {
      const record = EXPECTED_PROVENANCE.packages[index];
      const localTarballPath = join(artifactDirectory, record.file);
      await copyFile(tarballPaths[index], localTarballPath);
      const localStatus = await requireRegularFile(localTarballPath, 'isolated_consumer_failed');
      const localRealPath = await realpath(localTarballPath);
      if (localStatus.size !== record.size || !isBeneath(artifactRealRoot, localRealPath)) {
        fail('isolated_consumer_failed');
      }
      await verifyStymobilePackageArtifact({
        packageRecord: record,
        tarballPath: localTarballPath,
      });
      consumerTarballPaths.push(`./artifacts/${record.file}`);
    }
    await writeFile(join(consumerRoot, 'package.json'), '{"name":"stymobile-consumer","private":true,"type":"module"}\n');
    await writeFile(join(consumerRoot, '.npmrc'), '');
    await writeFile(join(consumerRoot, '.npmrc-global'), '');
    const environment = isolatedEnvironment(consumerRoot);
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const { stdout: npmVersion } = await runFile(
      npmCommand,
      ['--version'],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 1024 },
      'toolchain_mismatch',
    );
    if (npmVersion.trim() !== '11.12.1') fail('toolchain_mismatch');
    await runFile(
      npmCommand,
      ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...consumerTarballPaths],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      'isolated_consumer_failed',
    );
    await Promise.all(EXPECTED_PACKAGE_NAMES.map((name) => verifyInstalledPath(consumerRealRoot, name)));
    await verifyIsolatedDependencyMetadata(consumerRealRoot, repositoryRoot);

    const runtimeProbe = join(consumerRoot, 'runtime-probe.mjs');
    await writeFile(
      runtimeProbe,
      [
        "import { STYLE_PREFERENCE_V1_OPTIONS } from '@stymobile/contracts';",
        "import { createAccountScope } from '@stymobile/core';",
        "import { createStylePreferenceController } from '@stymobile/api-client';",
        "const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';",
        "const operationId = '10000000-0000-4000-8000-000000000001';",
        'const server = { accountId, status: "unseen", catalogVersion: "stylee-style-v1", revision: null, selected: [], options: STYLE_PREFERENCE_V1_OPTIONS };',
        'const selected = { ...server, status: "selected", revision: 1, selected: [STYLE_PREFERENCE_V1_OPTIONS[1]] };',
        'const scope = createAccountScope();',
        'scope.replaceAccount(accountId);',
        'let pendingWrites = 0; let replacements = 0; let queries = 0;',
        'const pendingStore = { read: async () => null, write: async () => { pendingWrites += 1; }, remove: async () => undefined };',
        'const port = {',
        '  read: async () => server,',
        '  replace: async request => { replacements += 1; return { schema_version: 1, operation_id: request.operation_id, request_id: "request", server_time: "2026-09-06T08:00:00.000Z", entity_revision: 1, state: "succeeded", result: selected, error: null }; },',
        '  query: async () => { queries += 1; throw new Error("unexpected_query"); },',
        '};',
        'const valid = createStylePreferenceController({ port, pendingStore, scope, createOperationId: () => operationId });',
        'await valid.load(); valid.toggle("minimalist"); await valid.save();',
        'if (valid.getSnapshot().message !== "preference_saved" || pendingWrites !== 1 || replacements !== 1 || queries !== 0) throw new Error("valid_probe_failed");',
        'pendingWrites = 0; replacements = 0; queries = 0;',
        'const invalid = createStylePreferenceController({ port, pendingStore, scope, createOperationId: () => "not-a-uuid" });',
        'await invalid.load(); invalid.toggle("minimalist"); await invalid.save();',
        'if (invalid.getSnapshot().message !== "preference_save_failed" || pendingWrites !== 0 || replacements !== 0 || queries !== 0) throw new Error("invalid_probe_failed");',
        '',
      ].join('\n'),
    );
    await runFile(
      process.execPath,
      [runtimeProbe],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      'isolated_consumer_failed',
    );

    const typeProbe = join(consumerRoot, 'type-probe.ts');
    await writeFile(
      typeProbe,
      [
        "import { STYLE_PREFERENCE_V1_OPTIONS, type StylePreferenceControllerSnapshot } from '@stymobile/contracts';",
        "import { createAccountScope, type AccountScope } from '@stymobile/core';",
        "import { createStylePreferenceController, type PendingPreferenceStore, type StylePreferencePort } from '@stymobile/api-client';",
        'const scope: AccountScope = createAccountScope();',
        'const port = {} as StylePreferencePort;',
        'const pendingStore = {} as PendingPreferenceStore;',
        'const controller = createStylePreferenceController({ port, pendingStore, scope, createOperationId: () => "10000000-0000-4000-8000-000000000001" });',
        'const snapshot: StylePreferenceControllerSnapshot = controller.getSnapshot();',
        'void [STYLE_PREFERENCE_V1_OPTIONS, snapshot];',
        '',
      ].join('\n'),
    );
    const typescriptCompiler = await realpath(resolve(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'));
    if (!isBeneath(repositoryRoot, typescriptCompiler)) fail('compiler_path_invalid');
    await requireRegularFile(typescriptCompiler, 'isolated_consumer_failed');
    await runFile(
      process.execPath,
      [
        typescriptCompiler,
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        typeProbe,
      ],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      'isolated_consumer_failed',
    );
  } catch (error) {
    if (
      error instanceof Error &&
      ['isolated_consumer_failed', 'compiler_path_invalid', 'toolchain_mismatch'].includes(error.message)
    ) {
      throw error;
    }
    fail('isolated_consumer_failed');
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
}

async function verifyStymobileVendorInternal({ repositoryRoot, runConsumer }) {
  let root;
  try {
    root = await realpath(repositoryRoot);
  } catch {
    fail('repository_root_invalid');
  }

  const provenancePath = resolve(root, VENDOR_DIRECTORY, 'provenance.json');
  if (!isBeneath(root, provenancePath)) fail('provenance_path_invalid');
  await requireRegularFile(provenancePath);
  if (!isBeneath(root, await realpath(provenancePath))) fail('provenance_path_invalid');

  const provenance = await readJson(provenancePath, 'provenance_invalid');
  assertExactProvenance(provenance);

  const tarballPaths = provenance.packages.map((packageRecord) =>
    resolve(dirname(provenancePath), packageRecord.file),
  );
  for (let index = 0; index < tarballPaths.length; index += 1) {
    const tarballPath = tarballPaths[index];
    if (!isBeneath(root, tarballPath)) fail('artifact_path_invalid');
    await requireRegularFile(tarballPath);
    if (!isBeneath(root, await realpath(tarballPath))) fail('artifact_path_invalid');
    await verifyStymobilePackageArtifact({
      packageRecord: provenance.packages[index],
      tarballPath,
    });
  }

  const packagePath = resolve(root, 'package.json');
  const lockfilePath = resolve(root, 'package-lock.json');
  await requireRegularFile(packagePath, 'repository_manifest_must_be_regular_file');
  await requireRegularFile(lockfilePath, 'repository_manifest_must_be_regular_file');
  const [packageManifest, lockfile] = await Promise.all([
    readJson(packagePath, 'package_manifest_invalid'),
    readJson(lockfilePath, 'lockfile_invalid'),
  ]);
  verifyRepositoryManifests(packageManifest, lockfile);

  if (runConsumer) await verifyIsolatedConsumer(root, tarballPaths);

  return Object.freeze({
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    sourceTree: EXPECTED_SOURCE_TREE,
    packages: EXPECTED_PACKAGE_NAMES,
  });
}

export async function verifyStymobileVendor({ repositoryRoot, runConsumer = true }) {
  try {
    return await verifyStymobileVendorInternal({ repositoryRoot, runConsumer });
  } catch (error) {
    if (error instanceof Error && errorIdentifiers.has(error.message)) throw error;
    fail('vendor_verification_failed');
  }
}
