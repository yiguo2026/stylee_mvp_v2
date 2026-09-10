import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const srcRoot = new URL('../../../', import.meta.url);
const platform = new URL('./platform.mjs', import.meta.url).href;
const reactNative = new URL('./reactNative.mjs', import.meta.url).href;
const icon = new URL('./icon.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'react-native') return { url: reactNative, shortCircuit: true };
  if (specifier.startsWith('@expo/vector-icons/')) return { url: icon, shortCircuit: true };
  if (specifier === '@/design-system') {
    return { url: new URL('./designSystem.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (new Set([
    'expo-router', '@/lib/webStylePreferenceRuntime', '@/lib/accountScopeRuntime',
    '@/components/Toast', '@/lib/supabase', '@/stores/userStore',
  ]).has(specifier)) return { url: platform, shortCircuit: true };
  const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), srcRoot)
    : specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
  if (candidate) {
    for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
      const url = new URL(candidate.href + suffix);
      if (existsSync(fileURLToPath(url)) && statSync(fileURLToPath(url)).isFile()) {
        return { url: url.href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(srcRoot.href) && /\.tsx?$/u.test(new URL(url).pathname)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(await readFile(new URL(url), 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
    };
  }
  return nextLoad(url, context);
}
