import { describe, expect, test } from 'bun:test'

import { cryptoHash, decryptAes } from './crypto'

// AES passphrase for uuid `uuid1234` and password `password12345`, derived as in `cookieCloudDecrypt`
const cookieCloudKey = 'e44668e7b258adc4'

const cookieCloudPayload = JSON.stringify({
  cookie_data: {
    'bilibili.com': [{ domain: '.bilibili.com', name: 'SESSDATA', value: 'fake-session-value', path: '/' }],
  },
  local_storage_data: { 'laplace.live': { loginSyncOptionName: '拉普拉斯 🍪' } },
})

// Known-answer vectors from crypto-js 4.2.0, which the extension still encrypts with:
// `CryptoJS.AES.encrypt(plainText, secret).toString()`. They pin `decryptAes` to its OpenSSL `Salted__` format now
// that crypto-js is no longer a dependency here.
const vectors = [
  {
    name: 'short ASCII plaintext',
    secret: 'secretText',
    plainText: 'messageText',
    encrypted: 'U2FsdGVkX18FJcvgZv9KNl8fv0qkq8gKGR3zEDxnxIU=',
  },
  // PKCS7 appends a whole padding block
  {
    name: 'block-aligned plaintext',
    secret: 'secretText',
    plainText: 'sixteen byte msg',
    encrypted: 'U2FsdGVkX19KyjqGgCM3doRpFY+b+oJLHXRhOaHVWkskgoX2NVv4MP2k4zulaEuI',
  },
  {
    name: 'multi-block upload payload with multi-byte UTF-8',
    secret: cookieCloudKey,
    plainText: cookieCloudPayload,
    encrypted:
      'U2FsdGVkX19fhfCPlHeiFpiR2DprwTI195IRbx8zZEUAiScSZdhfArMCEDtxDAILc7ZJ4Vw9GttychuB20Qoa7AGFeYWYVNJJjPBytbBsCq7Y0OeSH89PvSmEkHU1fEV74iNMZD02KCgPwxVJODn/eg5/MBHM8hz3gIm197TWo6SjIqyfHkCDWxcg7A/oHeQj4MioJSE/+s2cXQTePNsvVkHSlMLCXjZxrW55I0tMW4WPtqRIyDVYGcstF0bkuzQibnI3nt9hKrC0p0YANv5qWG3457js2BwNen/wn51/u0=',
  },
]

describe('cryptoHash', () => {
  test('md5 of uuid-password yields the CookieCloud passphrase', () => {
    expect(cryptoHash('uuid1234-password12345', { algorithm: 'md5' }).substring(0, 16)).toBe(cookieCloudKey)
  })
})

describe('decryptAes', () => {
  test.each(vectors)('decrypts crypto-js output: $name', ({ secret, plainText, encrypted }) => {
    expect(decryptAes(encrypted, secret)).toBe(plainText)
  })
})
