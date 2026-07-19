import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (value) => Buffer.from(value).toString('base64');
const fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

async function deriveKey(passphrase, salt, usages) {
  const material = await webcrypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function encryptFeed(feed, passphrase) {
  if (!passphrase || passphrase.length < 16) throw new Error('Passphrase must be at least 16 characters');
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(feed))
  );
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: 150000,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  };
}

export async function decryptFeed(payload, passphrase) {
  const key = await deriveKey(passphrase, fromBase64(payload.salt), ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath] = process.argv;
  const passphrase = process.env.AUTO_FEED_PASSPHRASE;
  if (!inputPath || !outputPath || !passphrase) {
    throw new Error('Usage: AUTO_FEED_PASSPHRASE=... node scripts/auto-feed-crypto.js input.json output.json');
  }
  const feed = JSON.parse(await readFile(inputPath, 'utf8'));
  const encrypted = await encryptFeed(feed, passphrase);
  await writeFile(outputPath, `${JSON.stringify(encrypted, null, 2)}\n`);
}
