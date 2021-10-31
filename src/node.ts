import { Bytes, MarshalVersion, MetadataMapping, NodeType, Reference, StorageLoader, StorageSaver } from './types'
import {
  bytesToString,
  checkReference,
  equalBytes,
  findIndexOfArray,
  flattenBytesArray,
  fromBigEndian,
  keccak256Hash,
  stringToBytes,
  toBigEndianFromUint16
} from './utils'

const PATH_SEPARATOR = '/'
const PATH_SEPARATOR_BYTE = 47

type ForkMapping = { [key: string]: SepaTreeFork }

const nodeForkSizes = {
  nodeType: 1,
  prefixLength: 1,
  /** Bytes length before `reference` */
  preReference: 32,
  metadata: 2,
  header: (): number => nodeForkSizes.nodeType + nodeForkSizes.prefixLength, // 2
  prefixMaxSize: (): number => nodeForkSizes.preReference - nodeForkSizes.header(), // 30
} as const

const nodeHeaderSizes = {
  versionHash: 31,
  /** Its value represents how long is the `entry` in bytes */
  refBytes: 1,
  full: (): number => {
    return nodeHeaderSizes.versionHash + nodeHeaderSizes.refBytes
  },
} as const

class NotFoundError extends Error {
  constructor(remainingPath: string, checkedPrefixBytes?: Uint8Array) {
    const prefixInfo = checkedPrefixBytes
      ? `Prefix on lookup: ${new TextDecoder().decode(checkedPrefixBytes)}`
      : 'No fork on the level'
    super(`Path has not found in the manifest. Remaining path on lookup: "${remainingPath}" ${prefixInfo}`)
  }
}

class EmptyPathError extends Error {
  constructor() {
    super('Empty path')
  }
}

class UndefinedField extends Error {
  constructor(field: string) {
    super(`"${field}" field is not initialized.`)
  }
}

class PropertyIsUndefined extends Error {
  constructor() {
    super(`Property does not exist in the object`)
  }
}

export class SepaTreeFork {
  /**
   * @param prefix the non-branching part of the subpath
   * @param node in memory structure that represents the Node
   */
  constructor(public prefix: Uint8Array, public node: SepaTreeNode) {}

  public serialize(): Uint8Array {
    const nodeType = this.node.getType

    const prefixLengthBytes = new Uint8Array(1)
    prefixLengthBytes[0] = this.prefix.length

    const prefixBytes = new Uint8Array(nodeForkSizes.prefixMaxSize())
    prefixBytes.set(this.prefix)

    const entry: Reference | undefined = this.node.getContentAddress

    if (!entry) throw Error('cannot serialize MantarayFork because it does not have contentAddress')

    const data = new Uint8Array([nodeType, ...prefixLengthBytes, ...prefixBytes, ...entry])

    if (this.node.IsWithMetadataType()) {
      const jsonString = JSON.stringify(this.node.getMetadata)
      const metadataBytes = new TextEncoder().encode(jsonString)

      // pad JSON bytes if necessary -> the encryptDecrypt handles if the data has no key length

      const metadataBytesSize = toBigEndianFromUint16(metadataBytes.length)

      return new Uint8Array([...data, ...metadataBytesSize, ...metadataBytes])
    }

    return data
  }

  public static deserialize(
    data: Uint8Array,
    options?: {
      withMetadata?: {
        refBytesSize: number
        metadataByteSize: number
      }
    },
  ): SepaTreeFork {
    const nodeType = data[0]
    const prefixLength = data[1]

    if (prefixLength === 0 || prefixLength > nodeForkSizes.prefixMaxSize()) {
      throw Error(`Prefix length of fork is greater than ${nodeForkSizes.prefixMaxSize()}. Got: ${prefixLength}`)
    }

    const headerSize = nodeForkSizes.header()
    const prefix = data.slice(headerSize, headerSize + prefixLength)
    const node = new SepaTreeNode()

    const withMetadata = options?.withMetadata

    if (withMetadata) {
      const { refBytesSize, metadataByteSize } = withMetadata

      if (metadataByteSize > 0) {
        node.setEntry = data.slice(nodeForkSizes.preReference, nodeForkSizes.preReference + refBytesSize) as
          | Bytes<32>
          | Bytes<64>

        const startMetadata = nodeForkSizes.preReference + refBytesSize + nodeForkSizes.metadata
        const metadataBytes = data.slice(startMetadata, startMetadata + metadataByteSize)

        const jsonString = new TextDecoder().decode(metadataBytes)
        node.setMetadata = JSON.parse(jsonString)
      }
    } else {
      node.setEntry = data.slice(nodeForkSizes.preReference) as Bytes<32> | Bytes<64>
    }
    node.setType = nodeType

    return new SepaTreeFork(prefix, node)
  }
}

export class SepaTreeNode {
  /** Used with NodeType type */
  private type?: number
  /** reference of a loaded manifest node. if undefined, the node can be handled as `dirty` */
  private contentAddress?: Reference
  /** reference of an content that the manifest refers to */
  private entry?: Reference
  private metadata?: MetadataMapping
  /** Forks of the manifest. Has to be initialized with `{}` on load even if there were no forks */
  public forks?: ForkMapping

  /// Setters/getters

  public set setContentAddress(contentAddress: Reference) {
    checkReference(contentAddress)

    this.contentAddress = contentAddress
  }

  public set setEntry(entry: Reference) {
    checkReference(entry)

    this.entry = entry

    if (!equalBytes(entry, new Uint8Array(entry.length))) this.makeValue()

    this.makeDirty()
  }

  public set setType(type: number) {
    if (type > 255) throw Error(`Node type representation cannot be greater than 255`)

    this.type = type
  }

  public set setMetadata(metadata: MetadataMapping) {
    this.metadata = metadata
    this.makeWithMetadata()

    // TODO: when the mantaray node is a pointer by its metadata then
    // the node has to be with `value` type even though it has zero address
    // should get info why is `withMetadata` as type is not enough
    if (metadata['website-index-document'] || metadata['website-error-document']) {
      this.makeValue()
    }
    this.makeDirty()
  }

  public get getEntry(): Reference | undefined {
    return this.entry
  }

  public get getContentAddress(): Reference | undefined {
    return this.contentAddress
  }

  public get getMetadata(): MetadataMapping | undefined {
    return this.metadata
  }

  public get getType(): number {
    if (this.type === undefined) throw PropertyIsUndefined

    if (this.type > 255) throw 'Property "type" in Node is greater than 255'

    return this.type
  }

  /// Node type related functions
  /// dirty flag is not necessary to be set

  public isValueType(): boolean {
    if (!this.type) throw PropertyIsUndefined
    const typeMask = this.type & NodeType.value

    return typeMask === NodeType.value
  }

  public isEdgeType(): boolean {
    if (!this.type) throw PropertyIsUndefined
    const typeMask = this.type & NodeType.edge

    return typeMask === NodeType.edge
  }

  public isWithPathSeparatorType(): boolean {
    if (!this.type) throw PropertyIsUndefined
    const typeMask = this.type & NodeType.withPathSeparator

    return typeMask === NodeType.withPathSeparator
  }

  public IsWithMetadataType(): boolean {
    if (!this.type) throw PropertyIsUndefined
    const typeMask = this.type & NodeType.withMetadata

    return typeMask === NodeType.withMetadata
  }

  private makeValue() {
    if (!this.type) this.type = NodeType.value
    this.type |= NodeType.value
  }

  private makeEdge() {
    if (!this.type) this.type = NodeType.edge
    this.type |= NodeType.edge
  }

  private makeNotEdge() {
    if (!this.type) throw PropertyIsUndefined
    this.type = (NodeType.mask ^ NodeType.edge) & this.type
  }

  private makeWithPathSeparator() {
    if (!this.type) this.type = NodeType.withPathSeparator
    this.type |= NodeType.withPathSeparator
  }

  private makeWithMetadata() {
    if (!this.type) this.type = NodeType.withMetadata
    this.type |= NodeType.withMetadata
  }

  private makeNotWithPathSeparator() {
    if (!this.type) throw PropertyIsUndefined
    this.type = (NodeType.mask ^ NodeType.withPathSeparator) & this.type
  }

  /**
   * If the node had parent
   */
  private updateWithPathSeparator() {
    this.makeWithPathSeparator()
  }

  /// BL methods

  /**
   *
   * @param node
   * @param path path sting represented in bytes. can be 0 length, then `entry` will be the current node's entry
   * @param entry that I want to save. Root node is `''`
   * @param metadata that I want to save
   * @param storage
   */
  public static addFork(node: SepaTreeNode, path: string, entry: Reference, metadata: MetadataMapping = {}): void {
    const forkIndices = path.split(PATH_SEPARATOR)

    // only when the root node is edited
    if (path.length === 0) {
      node.setEntry = entry

      if (Object.keys(metadata).length > 0) {
        node.setMetadata = metadata
      }

      return
    }

    if (!node.forks) node.forks = {}

    const fork = node.forks[forkIndices[0]]

    if (fork) {
      const restPath = forkIndices.slice(1).join(PATH_SEPARATOR)
      SepaTreeNode.addFork(fork.node, restPath, entry, metadata)
    } else {
      if (forkIndices.length !== 1) {
        throw Error(
          `Added path is longer than the existing branch by ${forkIndices.length - 1} level. Proplematic part: ${path}`,
        )
      }
      const newNode = new SepaTreeNode()
      const forkIndex = forkIndices[0]

      // TODO: this is the old code legacy
      // I don't like it, I think this prefixmaxsize is unnecessary when you have prefixlength
      // in the next version it has to be taken out
      // but I don't want it now
      if (path.length > nodeForkSizes.prefixMaxSize()) {
        throw Error(`Prefixes is bigger than ${nodeForkSizes.prefixMaxSize()} in bytes`)
      }

      newNode.setEntry = entry

      if (Object.keys(metadata).length > 0) {
        newNode.setMetadata = metadata
      }

      if (node.forks[forkIndex]) {
        throw Error(`Fork ${forkIndex} is already defined. Use getForkAtPath instead of this`)
      }
      newNode.updateWithPathSeparator()
      node.forks[forkIndex] = new SepaTreeFork(stringToBytes(forkIndex), newNode)
      node.makeDirty()
      node.makeEdge()
    }
  }

  /**
   * Gives back a SepaTreeFork under the given path
   *
   * @param path valid path within the MantarayNode
   * @returns MantarayFork with the last unique prefix and its node
   * @throws error if there is no node under the given path
   */
  public getForkAtPath(path: string): SepaTreeFork {
    const forkIndices = path.split(PATH_SEPARATOR)
    const pathBytes = stringToBytes(path)

    if (forkIndices.length === 0) throw EmptyPathError

    if (!this.forks) throw Error(`Fork mapping is not defined in the node`)

    const fork = this.forks[forkIndices[0]]

    if (!fork) throw new NotFoundError(path)

    const prefixIndex = findIndexOfArray(pathBytes, fork.prefix)

    if (prefixIndex === -1) throw new NotFoundError(path, fork.prefix)

    const rest = forkIndices.slice(1).join('/')

    if (rest.length === 0) return fork

    return fork.node.getForkAtPath(rest)
  }

  /**
   * Removes a path (even branch) from the node
   *
   * @param path prefix of the node intended to remove (with its descendants)
   */
  public static removeFork(node: SepaTreeNode, path: string): void {
    if (path === '') throw EmptyPathError

    if (!node.forks) throw Error(`Fork mapping is not defined in the manifest`)

    const forkIndices = path.split(PATH_SEPARATOR)
    const fork = node.forks[forkIndices[0]]

    if (!fork) throw new NotFoundError(path)

    if (forkIndices.length === 1) {
      delete node.forks[path]

      if (Object.keys(node.forks).length === 0) {
        node.makeNotEdge()
      }
    } else {
      SepaTreeNode.removeFork(fork.node, forkIndices.slice(1).join(PATH_SEPARATOR))
    }
  }

  public async load(storageLoader: StorageLoader, reference: Reference): Promise<void> {
    if (!reference) throw Error('Reference is undefined at manifest load')

    const data = await storageLoader(reference)
    this.deserialize(data)

    this.setContentAddress = reference
  }

  /**
   * Saves dirty flagged ManifestNode and its forks recursively
   * @returns Reference of the top manifest node.
   */
  public async save(storageSaver: StorageSaver): Promise<Reference> {
    if (this.contentAddress) return this.contentAddress

    // save forks first recursively
    const savePromises: Promise<Reference>[] = []

    if (!this.forks) this.forks = {} // there were no intention to define fork(s)
    for (const fork of Object.values(this.forks)) {
      savePromises.push(fork.node.save(storageSaver))
    }
    await Promise.all(savePromises)

    // save the actual manifest as well
    const data = this.serialize()
    const reference = await storageSaver(data)

    this.setContentAddress = reference

    return reference
  }

  public isDirty(): boolean {
    return this.contentAddress === undefined
  }

  public makeDirty(): void {
    this.contentAddress = undefined
  }

  /**
   * Only serialize after `save()`
   *
   * @returns data
   */
  public serialize(): Uint8Array {
    if (!this.forks) {
      if (!this.entry) throw new UndefinedField('entry')
      this.forks = {} //if there were no forks initialized it is not indended to be
    }

    if (!this.entry) this.entry = new Uint8Array(32) as Bytes<32>

    /// Header
    const version: MarshalVersion = '0.1'
    const versionBytes: Bytes<31> = serializeVersion(version)
    const referenceLengthBytes: Bytes<1> = serializeReferenceLength(this.entry)

    /// Entry is already in byte version

    /// Forks
    const forkSerializations: Uint8Array[] = []
    //TODO
    for (const forkIndex of Object.keys(this.forks)) {
      forkSerializations.push(this.forks[forkIndex].serialize())
    }

    const bytes = new Uint8Array([
      ...versionBytes,
      ...referenceLengthBytes,
      ...this.entry,
      ...flattenBytesArray(forkSerializations),
    ])

    return bytes
  }

  public deserialize(data: Uint8Array): void {
    const nodeHeaderSize = nodeHeaderSizes.full()

    if (data.length < nodeHeaderSize) throw Error('The serialised input is too short')

    const versionHash = data.slice(0, nodeHeaderSizes.versionHash)

    if (equalBytes(versionHash, serializeVersion('0.1'))) {
      const refBytesSize = data[nodeHeaderSize - 1]
      const entry = data.slice(nodeHeaderSize, nodeHeaderSize + refBytesSize)

      this.setEntry = entry as Reference
      let offset = nodeHeaderSize + refBytesSize

      this.forks = {}
      let forkIndex = 0

      while (offset < data.length) {
        let fork: SepaTreeFork

        if (data.length < offset + nodeForkSizes.nodeType) {
          throw Error(`There is not enough size to read nodeType of fork at offset ${offset}`)
        }

        const nodeType = data.slice(offset, offset + nodeForkSizes.nodeType)
        let nodeForkSize = nodeForkSizes.preReference + refBytesSize

        if (nodeTypeIsWithMetadataType(nodeType[0])) {
          if (data.length < offset + nodeForkSizes.preReference + refBytesSize + nodeForkSizes.metadata) {
            throw Error(`Not enough bytes for metadata node fork at byte ${forkIndex}`)
          }

          const metadataByteSize = fromBigEndian(
            data.slice(offset + nodeForkSize, offset + nodeForkSize + nodeForkSizes.metadata),
          )
          nodeForkSize += nodeForkSizes.metadata + metadataByteSize

          fork = SepaTreeFork.deserialize(data.slice(offset, offset + nodeForkSize), {
            withMetadata: { refBytesSize, metadataByteSize },
          })
        } else {
          if (data.length < offset + nodeForkSizes.preReference + refBytesSize) {
            throw Error(`There is not enough size to read fork at offset ${offset}`)
          }

          fork = SepaTreeFork.deserialize(data.slice(offset, offset + nodeForkSize))
        }

        this.forks![bytesToString(fork.prefix)] = fork

        offset += nodeForkSize

        forkIndex++
      }
    } else {
      throw Error('Wrong mantaray version')
    }
  }
}

function nodeTypeIsWithMetadataType(nodeType: number): boolean {
  return (nodeType & NodeType.withMetadata) === NodeType.withMetadata
}

/** Checks for separator character in the node and its descendants prefixes */
export function checkForSeparator(node: SepaTreeNode): boolean {
  for (const fork of Object.values(node.forks || {})) {
    const pathIncluded = fork.prefix.some(v => v === PATH_SEPARATOR_BYTE)

    if (pathIncluded) return true

    if (checkForSeparator(fork.node)) return true
  }

  return false
}

/**
 * The hash length has to be 31 instead of 32 that comes from the keccak hash function
 */
function serializeVersion(version: MarshalVersion): Bytes<31> {
  const versionName = 'sepatree'
  const versionSeparator = ':'
  const hashBytes = keccak256Hash(versionName + versionSeparator + version)

  return hashBytes.slice(0, 31) as Bytes<31>
}

function serializeReferenceLength(entry: Reference): Bytes<1> {
  const referenceLength = entry.length

  if (referenceLength !== 32 && referenceLength !== 64) {
    throw new Error(`Wrong referenceLength. It can be only 32 or 64. Got: ${referenceLength}`)
  }
  const bytes = new Uint8Array(1)
  bytes[0] = referenceLength

  return bytes as Bytes<1>
}

/** loads all nodes recursively */
export async function loadAllNodes(storageLoader: StorageLoader, node: SepaTreeNode): Promise<void> {
  if (!node.forks) return

  for (const fork of Object.values(node.forks)) {
    if (fork.node.getEntry) await fork.node.load(storageLoader, fork.node.getEntry)
    await loadAllNodes(storageLoader, fork.node)
  }
}

/**
 * Throws an error if the given nodes properties are not equal
 *
 * @param a Mantaray node to compare
 * @param b Mantaray node to compare
 * @param accumulatedPrefix accumulates the prefix during the recursion
 * @throws Error if the two nodes properties are not equal recursively
 */
export const equalNodes = (a: SepaTreeNode, b: SepaTreeNode, accumulatedPrefix = ''): void | never => {
  // node type comparisation
  if (a.getType !== b.getType) {
    throw Error(`Nodes do not have same type at prefix "${accumulatedPrefix}"\na: ${a.getType} <-> b: ${b.getType}`)
  }

  // node metadata comparisation
  if (!a.getMetadata !== !b.getMetadata) {
    throw Error(`One of the nodes do not have metadata defined. \n a: ${a.getMetadata} \n b: ${b.getMetadata}`)
  } else if (a.getMetadata && b.getMetadata) {
    let aMetadata, bMetadata: string
    try {
      aMetadata = JSON.stringify(a.getMetadata)
      bMetadata = JSON.stringify(b.getMetadata)
    } catch (e) {
      throw Error(`Either of the nodes has invalid JSON metadata. \n a: ${a.getMetadata} \n b: ${b.getMetadata}`)
    }

    if (aMetadata !== bMetadata) {
      throw Error(`The node's metadata are different. a: ${aMetadata} \n b: ${bMetadata}`)
    }
  }

  // node entry comparisation
  if (a.getEntry === b.getEntry) {
    throw Error(`Nodes do not have same entries. \n a: ${a.getEntry} \n b: ${a.getEntry}`)
  }

  if (!a.forks) return

  // node fork comparisation
  const aKeys = Object.keys(a.forks)

  if (!b.forks || aKeys.length !== Object.keys(b.forks).length) {
    throw Error(`Nodes do not have same fork length on equality check at prefix ${accumulatedPrefix}`)
  }

  for (const key of aKeys) {
    const aFork: SepaTreeFork = a.forks[key]
    const bFork: SepaTreeFork = b.forks[key]
    const prefix = aFork.prefix
    const prefixString = new TextDecoder().decode(prefix)

    if (!equalBytes(prefix, bFork.prefix)) {
      throw Error(`Nodes do not have same prefix under the same key "${key}" at prefix ${accumulatedPrefix}`)
    }

    equalNodes(aFork.node, bFork.node, accumulatedPrefix + prefixString)
  }
}
