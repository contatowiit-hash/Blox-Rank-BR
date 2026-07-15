import "server-only";

const PASSWORD_ALGORITHM = "PBKDF2";
const PASSWORD_HASH_NAME = "SHA-256";
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const MINIMUM_PASSWORD_ITERATIONS = 310_000;
const MAXIMUM_PASSWORD_ITERATIONS = 2_000_000;
const SESSION_VERSION = 1;
const SESSION_TOKEN_PREFIX = "v1";

export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AdminSessionPayload {
  version: 1;
  actorDiscordId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytesToBase64Url(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const maximumLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function copiedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    PASSWORD_ALGORITHM,
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_ALGORITHM,
      hash: PASSWORD_HASH_NAME,
      salt: copiedArrayBuffer(salt),
      iterations,
    },
    passwordKey,
    PASSWORD_HASH_BYTES * 8,
  );
  return new Uint8Array(derived);
}

interface ParsedPasswordHash {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const [algorithm, iterationsValue, saltValue, hashValue, extra] = encodedHash.split("$");
  if (
    algorithm !== PASSWORD_HASH_PREFIX ||
    iterationsValue === undefined ||
    saltValue === undefined ||
    hashValue === undefined ||
    extra !== undefined ||
    !/^\d{6,7}$/u.test(iterationsValue)
  ) {
    return null;
  }

  const iterations = Number(iterationsValue);
  const salt = base64UrlToBytes(saltValue);
  const hash = base64UrlToBytes(hashValue);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MINIMUM_PASSWORD_ITERATIONS ||
    iterations > MAXIMUM_PASSWORD_ITERATIONS ||
    salt === null ||
    salt.length < PASSWORD_SALT_BYTES ||
    salt.length > 64 ||
    hash === null ||
    hash.length !== PASSWORD_HASH_BYTES
  ) {
    return null;
  }
  return { iterations, salt, hash };
}

export function isSupportedAdminPasswordHash(encodedHash: string): boolean {
  return parsePasswordHash(encodedHash) !== null;
}

export async function hashAdminPassword(
  password: string,
  iterations = MINIMUM_PASSWORD_ITERATIONS,
): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new RangeError("A senha administrativa deve ter entre 12 e 256 caracteres.");
  }
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MINIMUM_PASSWORD_ITERATIONS ||
    iterations > MAXIMUM_PASSWORD_ITERATIONS
  ) {
    throw new RangeError("A quantidade de iterações PBKDF2 não é segura.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePasswordHash(password, salt, iterations);
  return [
    PASSWORD_HASH_PREFIX,
    String(iterations),
    bytesToBase64Url(salt),
    bytesToBase64Url(hash),
  ].join("$");
}

export async function verifyAdminPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (password.length < 1 || password.length > 256) {
    return false;
  }
  const parsed = parsePasswordHash(encodedHash);
  if (parsed === null) {
    return false;
  }
  const candidate = await derivePasswordHash(password, parsed.salt, parsed.iterations);
  return constantTimeEqual(candidate, parsed.hash);
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: PASSWORD_HASH_NAME },
    false,
    ["sign", "verify"],
  );
}

function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,20}$/u.test(value);
}

export async function createAdminSessionToken(
  actorDiscordId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; payload: AdminSessionPayload }> {
  if (!isDiscordId(actorDiscordId)) {
    throw new TypeError("O ID do administrador é inválido.");
  }
  if (secret.length < 32) {
    throw new TypeError("O segredo de sessão não é seguro.");
  }
  const payload: AdminSessionPayload = {
    version: SESSION_VERSION,
    actorDiscordId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ADMIN_SESSION_TTL_SECONDS,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signedValue = `${SESSION_TOKEN_PREFIX}.${encodedPayload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await importSessionKey(secret),
      new TextEncoder().encode(signedValue),
    ),
  );
  return {
    token: `${signedValue}.${bytesToBase64Url(signature)}`,
    payload,
  };
}

export async function verifyAdminSessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AdminSessionPayload | null> {
  if (secret.length < 32 || token.length > 2_048) {
    return null;
  }
  const [version, encodedPayload, encodedSignature, extra] = token.split(".");
  if (
    version !== SESSION_TOKEN_PREFIX ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    extra !== undefined
  ) {
    return null;
  }
  const signature = base64UrlToBytes(encodedSignature);
  const payloadBytes = base64UrlToBytes(encodedPayload);
  if (signature === null || signature.length !== 32 || payloadBytes === null) {
    return null;
  }

  const signedValue = `${version}.${encodedPayload}`;
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    await importSessionKey(secret),
    copiedArrayBuffer(signature),
    new TextEncoder().encode(signedValue),
  );
  if (!validSignature) {
    return null;
  }

  try {
    const raw = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<AdminSessionPayload>;
    if (
      raw.version !== SESSION_VERSION ||
      !isDiscordId(raw.actorDiscordId) ||
      !Number.isSafeInteger(raw.issuedAt) ||
      !Number.isSafeInteger(raw.expiresAt) ||
      typeof raw.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{20,64}$/u.test(raw.nonce) ||
      raw.issuedAt! > nowSeconds + 60 ||
      raw.expiresAt! <= nowSeconds ||
      raw.expiresAt! - raw.issuedAt! !== ADMIN_SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return raw as AdminSessionPayload;
  } catch {
    return null;
  }
}
