import bcrypt from "bcryptjs";

/** bcrypt work factor. Raise over time; existing hashes keep working. */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, cost);
}

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password. When the account does not exist (`hash` is null) it still does a
 * full bcrypt comparison, so response time does not reveal which emails are registered.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword("not-a-real-password");
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
