const srcRoot = new URL('../../../', import.meta.url);
const supabaseFixture = new URL('./supabaseFixture.ts', import.meta.url).href;
const typesFixture = new URL('./typesFixture.ts', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/supabase') {
    return { url: supabaseFixture, shortCircuit: true };
  }
  if (specifier === '@/types') {
    return { url: typesFixture, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return {
      url: new URL(`${specifier.slice(2)}.ts`, srcRoot).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
