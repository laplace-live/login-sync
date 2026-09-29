import type { Credentials } from './credentials.js'
import type { ProtocolVersion } from './detect.js'
import type { LoginSyncPayload } from './payload.js'

import { assertCredentials } from './credentials.js'
import { detectVersion } from './detect.js'
import { LoginSyncError } from './errors.js'
import { toPayload } from './payload.js'
import { decryptV1, encryptV1, v1Passphrase } from './v1.js'
import { decryptV2, encryptV2, padV2 } from './v2.js'

export interface EncryptOptions {
  /**
   * The format to write. Required on purpose: readers can only open versions they already know, so moving a writer to
   * a new version is a rollout decision, never a default that shifts under an SDK upgrade.
   */
  version: ProtocolVersion
}

export interface DecryptResult {
  /** The version the blob was written in, e.g. to track a migration */
  version: ProtocolVersion
  payload: LoginSyncPayload
}

export async function encrypt(
  payload: LoginSyncPayload,
  credentials: Credentials,
  options: EncryptOptions
): Promise<string> {
  assertCredentials(credentials)
  // Refuse to write what no reader would accept, and write the checked copy: a missing or null `local_storage_data`
  // goes out as `{}`. `toPayload` is shallow, so a nested `toJSON`, such as a Date's, can still change what gets
  // serialized; checking the JSON as a reader parses it catches that
  const json = JSON.stringify(toPayload(payload))
  toPayload(JSON.parse(json))
  switch (options?.version) {
    case 1:
      return encryptV1(json, v1Passphrase(credentials))
    case 2:
      return encryptV2(padV2(json), credentials)
    default:
      throw new LoginSyncError('unsupported_version', `cannot write protocol version ${String(options?.version)}`)
  }
}

/** Decrypts a blob in any supported version, detected from its prefix. */
export async function decrypt(blob: string, credentials: Credentials): Promise<DecryptResult> {
  assertCredentials(credentials)
  const version = detectVersion(blob)
  const json = version === 1 ? await decryptV1(blob, v1Passphrase(credentials)) : await decryptV2(blob, credentials)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (cause) {
    // v1 has no integrity check, so text that isn't JSON most likely means a wrong key that slipped past PKCS#7. v2 is
    // authenticated, so there it can only have come from the writer
    throw new LoginSyncError(version === 1 ? 'bad_credentials' : 'malformed', `v${version} plaintext is not JSON`, {
      cause,
    })
  }
  return { version, payload: toPayload(parsed) }
}
