import { Bee, Utils } from '@ethersphere/bee-js'
import { join } from 'path'
import { SepaTreeNode } from '../src'
import { loadAllNodes } from '../src/node'
import type { Reference } from '../src/types'
import { referenceToHex } from '../src/utils'
import { commonMatchers, getSampleMantarayNode } from './utils'

commonMatchers()
const beeUrl = process.env.BEE_API_URL || 'http://localhost:1633'
const bee = new Bee(beeUrl)

const hexToBytes = (hexString: string): Reference => {
  return Utils.Hex.hexToBytes(hexString)
}

const saveFunction = async (data: Uint8Array): Promise<Reference> => {
  const hexRef = await bee.uploadData(process.env.BEE_POSTAGE, data)

  return hexToBytes(hexRef)
}

const loadFunction = async (address: Reference): Promise<Uint8Array> => {
  return bee.downloadData(Utils.Hex.bytesToHex(address))
}

/** Uploads the testpage directory with bee-js and return back its root manifest data */
const beeTestPageManifestData = async (): Promise<Uint8Array> => {
  const contentHash = await bee.uploadFilesFromDirectory(process.env.BEE_POSTAGE, join(__dirname, 'testpage'), {
    pin: true,
    indexDocument: 'index.html',
  })

  return bee.downloadData(contentHash) //only download its manifest
}

it('should serialize/deserialize the same as Bee', async () => {
  const { node, paths } = getSampleMantarayNode()
  const ref = await node.save(saveFunction)
  const refString = referenceToHex(ref)
  const dataAgain = await bee.downloadData(refString)
  const nodeAgain = new SepaTreeNode()
  nodeAgain.deserialize(dataAgain)
  await loadAllNodes(loadFunction, nodeAgain)
  expect(Object.keys(nodeAgain.forks)).toStrictEqual(Object.keys(node.forks))
})
