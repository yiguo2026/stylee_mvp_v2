#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const guardedPaths = ['src/app', 'src/components'];
const requestedBase = process.env.DESIGN_SYSTEM_BASE || process.argv[2];

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isCommit(ref) {
  if (!ref || /^0+$/.test(ref)) return false;
  try {
    git(['rev-parse', '--verify', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function chooseBase() {
  if (isCommit(requestedBase)) return requestedBase;
  if (isCommit('origin/main') && git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') {
    return 'origin/main';
  }
  if (isCommit('HEAD^')) return 'HEAD^';
  return null;
}

const base = chooseBase();
if (!base) {
  console.log('Design System check skipped: no comparison base is available.');
  process.exit(0);
}

const diff = execFileSync(
  'git',
  ['diff', '--unified=0', base, '--', ...guardedPaths],
  { encoding: 'utf8' },
);

const rules = [
  {
    id: 'raw-color',
    message: 'Use ds.color.semantic.* instead of a raw color.',
    pattern: /#[\da-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/,
  },
  {
    id: 'legacy-token',
    message: 'Use @/design-system semantic tokens instead of Colors/Spacing/Radius/Shadow.',
    pattern: /\b(?:Colors|Spacing|Radius|Shadow)\./,
  },
  {
    id: 'raw-radius',
    message: 'Use ds.radius.* or a component token instead of a numeric border radius.',
    pattern: /\bborderRadius\s*:\s*-?\d/,
  },
  {
    id: 'raw-spacing',
    message: 'Use ds.space.*, ds.layout.*, or a component token instead of numeric spacing.',
    pattern: /\b(?:padding|paddingHorizontal|paddingVertical|gap|rowGap|columnGap)\s*:\s*-?\d/,
  },
];

const violations = [];
let currentFile = '';
let newLine = 0;

for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) {
    currentFile = line.slice(6);
    continue;
  }

  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }

  if (line.startsWith('+') && !line.startsWith('+++')) {
    const source = line.slice(1);
    if (!source.includes('ds-exception:')) {
      for (const rule of rules) {
        if (rule.pattern.test(source)) {
          violations.push({
            file: currentFile,
            line: newLine,
            rule,
            source: source.trim(),
          });
        }
      }
    }
    newLine += 1;
  } else if (!line.startsWith('-')) {
    newLine += 1;
  }
}

if (violations.length > 0) {
  console.error(`Design System check failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} [${violation.rule.id}] ${violation.rule.message}`,
    );
    console.error(`  ${violation.source}\n`);
  }
  console.error(
    'If an exception is intentional, add `// ds-exception: <reason>` on the same line and explain it in the PR.',
  );
  process.exit(1);
}

console.log(`Design System check passed against ${base}.`);
