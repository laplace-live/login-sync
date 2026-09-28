import { LoginSyncError } from './errors.js'

export const utf8 = new TextEncoder()

/** Throws on invalid UTF-8 instead of substituting U+FFFD, so a wrong key can't decode into plausible text. */
export const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // `String.fromCharCode` takes a byte per argument; chunk so a multi-megabyte payload can't overflow the call stack.
  // `Reflect.apply` passes the typed array as is, where spreading it walks an iterator, several times slower
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += Reflect.apply(String.fromCharCode, null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// ES2026's `Uint8Array.fromBase64` skips the binary-string round trip and accepts exactly what `atob` does.
// TypeScript's lib doesn't declare it yet and Node 24 lacks it, so it's detected rather than assumed
interface NativeBase64 {
  fromBase64(text: string): Uint8Array<ArrayBuffer>
}

function hasNativeBase64(ctor: object): ctor is NativeBase64 {
  return 'fromBase64' in ctor && typeof ctor.fromBase64 === 'function'
}

const typedArray: object = Uint8Array

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string
  try {
    if (hasNativeBase64(typedArray)) return typedArray.fromBase64(text)
    binary = atob(text)
  } catch (cause) {
    throw new LoginSyncError('malformed', 'blob is not valid base64', { cause })
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
