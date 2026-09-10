import { installWebPrivateResetters } from './accountScopeRuntime.ts';

type Resetters = Parameters<typeof installWebPrivateResetters>[0];
const validResetters: Resetters = [() => undefined];
// @ts-expect-error private resetters must be synchronous
const invalidResetters: Resetters = [async () => undefined];
void [validResetters, invalidResetters];
