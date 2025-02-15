import fs   from 'fs/promises'
import path from 'path'

import { Buff }    from '@cmdcode/buff-utils'
import { KeyPair } from '@cmdcode/crypto-utils'

import { Script, Tap, Tx } from '../../../src/index.js'

const ec     = new TextEncoder()
const seckey = KeyPair.generate()
const pubkey = seckey.pub.rawX
const fpath  = path.join(process.cwd(), '/test')
const data   = await fs.readFile(path.join(fpath, '/image.png')).then(e => new Uint8Array(e))
const chksum = (await fs.readFile(path.join(fpath, '/checksum'))).toString()

const mimetype = ec.encode('image/png')
const recvAddr = '51206364d5d918f22e75d4e2dea50ec28792829d0b4546b9bc8a02d4b3965f638000'

const script = [ pubkey, 'OP_CHECKSIG', 'OP_0', 'OP_IF', ec.encode('ord'), '01', mimetype, 'OP_0', data, 'OP_ENDIF' ]

const hexscript = Buff.raw(Script.encode(script, false)).hex
const decscript = Script.decode(hexscript)

//if (hexscript !== chksum) throw new Error('Script does not match checksum!')

console.log('Script:', decscript)
console.log(Script.decode(chksum))