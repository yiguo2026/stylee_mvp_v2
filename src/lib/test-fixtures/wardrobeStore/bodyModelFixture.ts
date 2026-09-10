type SelfieHandler = (accountId: string) => Promise<string | null>;

let selfieHandler: SelfieHandler = async (accountId) => {
  throw new Error(`unconfigured synthetic selfie read: ${accountId}`);
};

export function setSyntheticSelfieHandler(handler: SelfieHandler): undefined {
  selfieHandler = handler;
  return undefined;
}

export async function loadSelfie(accountId: string): Promise<string | null> {
  return selfieHandler(accountId);
}
