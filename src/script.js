import { Stream } from './bytes.js'
import { isValidCode } from './validate.js'
import { getOpName, getOpCode } from './codes.js'
import { toBase58 } from './format/base58.js'
import { bytesToHex, hexToBytes } from './convert.js'
import { sha256 } from './crypto.js'
import { Bech32 } from './format/bech32.js'

const scriptRegex = {
  p2pkh: /^76a914(?<hash>\w{40})88ac$/,
  p2sh: /^a914(?<hash>\w{40})87$/,
  p2wpkh: /^0014(?<hash>\w{40})$/,
  p2wsh: /^0020(?<hash>\w{64})$/,
  p2tr: /^0120(?<hash>\w{64})$/
}

export function decodeScript (script, opt) {
  const stream = new Stream(script)

  const stack = []

  let word; let wordType; let wordSize; let count = 0

  while (count < stream.length) {
    word = stream.read(1, { format: 'number' })
    wordType = getWordType(word)
    count++
    switch (wordType) {
      case 'varint':
        stack.push(stream.read(word, { format: 'hex' }))
        count += word
        break
      case 'pushdata1':
        wordSize = stream.read(1, { format: 'number' })
        stack.push(stream.read(wordSize, { format: 'hex' }))
        count += wordSize + 1
        break
      case 'pushdata2':
        wordSize = stream.read(2, { format: 'number' })
        stack.push(stream.read(wordSize, { format: 'hex' }))
        count += wordSize + 2
        break
      case 'pushdata4':
        wordSize = stream.read(4, { format: 'number' })
        stack.push(stream.read(wordSize, { format: 'hex' }))
        count += wordSize + 4
        break
      case 'opcode':
        if (!isValidCode(word)) {
          throw new Error(`Invalid OPCODE: ${word}`)
        }
        stack.push(formatCode(word, opt))
        break
      default:
        throw new Error(`Word type undefined: ${word}`)
    }
  }

  return stack
}

function getWordType (word) {
  switch (true) {
    case (word === 0):
      return 'opcode'
    case (word >= 1 && word <= 75):
      return 'varint'
    case (word === 76):
      return 'pushdata1'
    case (word === 77):
      return 'pushdata2'
    case (word === 78):
      return 'pushdata4'
    case (word <= 185):
      return 'opcode'
    default:
      throw new Error(`Invalid word range: ${word}`)
  }
}

function formatCode (code, opt = {}) {
  const { format = 'asm' } = opt
  switch (format) {
    case 'asm':
      return getOpName(code)
    case 'hex':
      return code.toString(16).padStart(2, '0')
    case 'num':
      return code
    default:
      return code
  }
}

function getScriptType (script) {
  for (const p in scriptRegex) {
    if (scriptRegex[p].test(script)) {
      return p
    }
  }
  return 'unknown'
}

export function getScriptSigMeta (script) {
  const scriptAsm = decodeScript(script)

  let scriptType, validSig

  if (scriptAsm.length === 1) {
    scriptType = 'p2sh-' + getScriptType(script)
  }

  if (scriptAsm.length === 2) {
    validSig = checkScriptSig(scriptAsm)
    scriptType = (validSig)
      ? 'p2pkh'
      : 'unknown'
  }

  return {
    scriptType,
    scriptAsm,
    validSig
  }
}

export function getScriptPubMeta (script) {
  const scriptType = getScriptType(script)

  return {
    scriptType,
    scriptAsm: decodeScript(script),
    payAddress: getPayAddress(script, scriptType)
  }
}

export function getWitScriptMeta (witness, meta = {}) {
  const { scriptType } = meta
  if (witness.length > 2) {
    const redeemScript = witness.at(-1)
    if (!scriptType) meta.scriptType = 'p2wsh'
    meta.redeemAsm = decodeScript(redeemScript)
    meta.redeemHash = getScriptHash(redeemScript)
    meta.templateHash = getTemplateHash(redeemScript)
  } else {
    if (!scriptType) meta.scriptType = 'p2wpkh'
    meta.validSig = checkScriptSig(witness)
  }
  return meta
}

function getPayAddress (script, scriptType) {
  const regex = scriptRegex[scriptType]
  const { hash } = script.match(regex).groups

  switch (true) {
    case (scriptType === 'p2pkh'):
      return toBase58(hash)
    case (scriptType.startsWith('p2sh')):
      return toBase58(hash)
    case (scriptType.startsWith('p2w')):
      return Bech32.encode('bcrt', hexToBytes(hash))
    case (scriptType === 'p2tr'):
      return Bech32.encode('tr', hexToBytes(hash), 1)
    default:
      return null
  }
}

function checkScriptSig (scriptAsm) {
  // const [signature, pubkey] = scriptAsm
  // also need to get sighash of tx
  return null
}

export async function getScriptHash (script, fmt = 'segwit') {
  if (fmt === 'p2sh') {
    return // bytesToHex(await ripemd160(script))
  }
  return bytesToHex(await sha256(script))
}

export async function getTemplateHash (script) {
  const scriptAsm = decodeScript(script)
  const template = scriptAsm.map(word => {
    word = convertCode(word)
    if (isValidCode(word)) {
      return word
    }
    return 0x01
  })

  return bytesToHex(await sha256(Uint8Array.from(template)))
}

export function convertCode (word) {
  /** Check if the word is a valid opcode,
   *  and return its integer value.
   */
  if (
    typeof (word) === 'string' &&
    word.startsWith('OP_')
  ) {
    return Number(getOpCode(word))
  }
  return word
}
