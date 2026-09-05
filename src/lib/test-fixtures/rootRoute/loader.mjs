import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const srcRoot = new URL('../../../', import.meta.url);
const fixture = new URL('./platform.mjs', import.meta.url).href;
const platformModules = new Set([
  'expo-router', 'expo-status-bar', 'expo-splash-screen', 'expo-font',
  '@expo-google-fonts/playfair-display', '@expo-google-fonts/inter',
  '@/lib/supabase', '@/lib/webAuthRuntime', '@/stores/userStore', '@/stores/importStore',
  '@/components/ErrorBoundary', '@/components/Toast', 'react-native',
]);

export async function resolve(specifier, context, nextResolve) {
  if (platformModules.has(specifier) || specifier.startsWith('@expo/vector-icons/')) {
    return { url: fixture, shortCircuit: true };
  }
  if (specifier === '@/design-system') {
    return { url: new URL('./designSystem.mjs', import.meta.url).href, shortCircuit: true };
  }
  const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), srcRoot)
    : specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
  if (candidate) {
    for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
      const url = new URL(candidate.href + suffix);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(srcRoot.href) && /\.tsx?$/u.test(url)) {
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(await readFile(new URL(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText };
  }
  return nextLoad(url, context);
}
