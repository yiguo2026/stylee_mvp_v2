export interface LoginAttempt<S> {
  readonly session: S | null;
  readonly errorMessage: string | null;
}

export type PasswordSignIn<S> = (email: string, password: string) => Promise<LoginAttempt<S>>;

function usernameToEmail(username: string): string {
  const encoded = [...username.trim()].map((c) => (
    c >= 'A' && c <= 'Z' ? '~' + c.toLowerCase() : c
  )).join('');
  return `${encoded}@users.stylee.app`;
}

function legacyUsernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@users.stylee.app`;
}

function classifyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('too many') || m.includes('rate limit')) {
    return { errorMessage: '尝试次数过多，请稍后再试', rateLimited: true, credentials: false };
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) {
    return { errorMessage: '网络连接失败，请检查网络', rateLimited: false, credentials: false };
  }
  if (m.includes('api key') || m.includes('apikey') || m.includes('unauthorized')
    || m.includes('401') || m.includes('not configured')
    || (m.includes('service') && m.includes('disabled'))) {
    return { errorMessage: '登录服务暂不可用，请稍后再试', rateLimited: false, credentials: false };
  }
  if (m.includes('invalid login credentials') || m.includes('invalid password')
    || m.includes('invalid credentials')) {
    return { errorMessage: '账号或密码错误', rateLimited: false, credentials: true };
  }
  if (m.includes('email not confirmed')) {
    return { errorMessage: '账号未验证', rateLimited: false, credentials: false };
  }
  return { errorMessage: '登录失败，请稍后再试', rateLimited: false, credentials: false };
}

export async function signInUsername<S>(input: Readonly<{
  username: string;
  password: string;
  signIn: PasswordSignIn<S>;
}>): Promise<Readonly<{
  session: S | null;
  errorMessage: string | null;
  rateLimited: boolean;
}>> {
  const attempt = async (email: string): Promise<LoginAttempt<S>> => {
    try {
      return await input.signIn(email, input.password);
    } catch (error) {
      return { session: null, errorMessage: error instanceof Error ? error.message : '' };
    }
  };
  const encoded = usernameToEmail(input.username);
  const legacy = legacyUsernameToEmail(input.username);
  let result = await attempt(encoded);
  if (result.errorMessage !== null && classifyError(result.errorMessage).credentials && encoded !== legacy) {
    result = await attempt(legacy);
  }
  if (result.errorMessage !== null) {
    const { errorMessage, rateLimited } = classifyError(result.errorMessage);
    return { session: null, errorMessage, rateLimited };
  }
  return {
    session: result.session,
    errorMessage: result.session === null ? '登录失败，请重试' : null,
    rateLimited: false,
  };
}
