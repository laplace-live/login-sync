import assert from 'node:assert'
import CryptoJS from 'crypto-js'

import { decryptAes, encryptAes } from './lib/crypto'

const secret = 'secretText'
const plainText = 'messageText'

const encrypted = CryptoJS.AES.encrypt(plainText, secret, {
  mode: CryptoJS.mode.CBC,
  padding: CryptoJS.pad.Pkcs7,
})
// const encrypted = encryptAes(plainText, secret)
const encryptedText = encrypted.toString()
console.log('encrypted', encryptedText)

const decryptedText = decryptAes(encryptedText, secret)
console.log('decrypted', decryptedText)

assert.equal(plainText, decryptedText)
