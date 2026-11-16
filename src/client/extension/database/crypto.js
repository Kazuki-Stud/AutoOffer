import { db } from './database.js';

// ---------------------------------------------------------------------------
// Device identity + encryption of secrets at rest (Web Crypto, AES-GCM-256).
//
// - pseudonymous_id : random UUID, generated here, never derived from the browser/hardware.
// - secret_key      : NON-EXTRACTABLE CryptoKey stored in IndexedDB. It cannot be exported,
//                     so JSON exports/backups of the database never contain a usable key.
//
// Scope of protection (be honest in the thesis): this keeps platform credentials, the AI API
// key and the server token out of clear text in the stored data, dumps and exports. It does
// NOT protect against code running in the same origin (e.g. a compromised extension page).
// ---------------------------------------------------------------------------
const DEVICE_ROW_ID = 'device';
let pending = null;

export function ensureDeviceState() {
  if (!pending) {
    pending = (async () => {
      let row = await db.local_device_state.get(DEVICE_ROW_ID);
      if (!row) {
        const secret_key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        row = { id: DEVICE_ROW_ID, pseudonymous_id: crypto.randomUUID(), secret_key, auth_token_enc: null, last_synced_at: null };
        await db.local_device_state.add(row);
      }
      return row;
    })().catch((e) => { pending = null; throw e; });
  }
  return pending;
}

export async function encryptSecret(plain) {
  const { secret_key } = await ensureDeviceState();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secret_key, new TextEncoder().encode(plain));
  return { v: 1, iv, data };
}

export async function decryptSecret(envelope) {
  const { secret_key } = await ensureDeviceState();
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.iv }, secret_key, envelope.data);
  return new TextDecoder().decode(buf);
}

export async function setAuthToken(token) {
  await ensureDeviceState();
  await db.local_device_state.update(DEVICE_ROW_ID, { auth_token_enc: await encryptSecret(token) });
}
export async function getAuthToken() {
  const row = await ensureDeviceState();
  const fresh = await db.local_device_state.get(row.id);
  return fresh?.auth_token_enc ? decryptSecret(fresh.auth_token_enc) : null;
}

export async function saveCredentials({ id, profile_id, platform_id, account_identifier, secret }) {
  const record = {
    id: id ?? crypto.randomUUID(), profile_id, platform_id, account_identifier,
    credentials_enc: await encryptSecret(secret), updated_at: new Date().toISOString(),
  };
  await db.platform_credentials.put(record);
  return record.id;
}
export async function readCredentials(id) {
  const rec = await db.platform_credentials.get(id);
  return rec?.credentials_enc ? decryptSecret(rec.credentials_enc) : null;
}

export async function saveAiConfiguration({ id, provider_name, api_endpoint, api_key, model_name, is_active = 0 }) {
  const now = new Date().toISOString();
  const existing = id ? await db.ai_configurations.get(id) : null;
  const record = {
    id: id ?? crypto.randomUUID(), provider_name, api_endpoint: api_endpoint ?? null,
    api_key_enc: await encryptSecret(api_key), model_name, is_active: is_active ? 1 : 0,
    created_at: existing?.created_at ?? now, updated_at: now,
  };
  await db.ai_configurations.put(record);
  return record.id;
}
export async function readAiApiKey(id) {
  const rec = await db.ai_configurations.get(id);
  return rec?.api_key_enc ? decryptSecret(rec.api_key_enc) : null;
}

/** Run once after upgrading from v5: encrypts rows flagged by the upgrade, then removes the clear text. */
export async function migrateLegacySecrets() {
  const creds = await db.platform_credentials.filter((c) => c.needs_encryption === 1).toArray();
  for (const c of creds) {
    const credentials_enc = await encryptSecret(String(c.credentials_data));
    await db.platform_credentials.update(c.id, { credentials_enc, credentials_data: undefined, needs_encryption: 0 });
  }
  const configs = await db.ai_configurations.filter((a) => a.needs_encryption === 1).toArray();
  for (const a of configs) {
    const api_key_enc = await encryptSecret(String(a.api_key));
    await db.ai_configurations.update(a.id, { api_key_enc, api_key: undefined, needs_encryption: 0 });
  }
  return { credentials: creds.length, ai_configurations: configs.length };
}
