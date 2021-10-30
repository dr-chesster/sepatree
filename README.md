# Description

With this package you can manipulate and interpret SepaTree data via `SepaTreeNode` and `SepaTreeFork` abstractions.

# Exported Functions and Classes

You can import the followings directly from `sepatree`:

* SepaTreeNode        # class abstracting and manipulating SepaTree Node data
* SepaTreeFork        # class abstracting and manipulating SepaTree Fork data
* checkForSeparator   # checks for separator character in the node and its descendants prefixes
* loadAllNodes        # loads all SepaTree nodes recursively from the storage
* equalNodes          # checks whether the two given SepaTree Nodes objects are equal in the in-memory abstraction level
* Utils               # all used utility functions in the library. Mostly operating on `Uint8Array` objects.
* types*              # not callable, referring all types exported and reachable from the index

# Basic usage

## Construct SepaTree

```ts
import { initManifestNode, Utils } from 'sepatree'

const node = initManifestNode()
const address1 = Utils.gen32Bytes() // instead of `gen32Bytes` some 32 bytes identifier that later could be retrieved from the storage
const address2 = Utils.gen32Bytes()
const address3 = Utils.gen32Bytes()
const address4 = Utils.gen32Bytes()
const address5 = Utils.gen32Bytes()
const path1 = new TextEncoder().encode('path1/valami/elso')
const path2 = new TextEncoder().encode('path1/valami/masodik')
const path3 = new TextEncoder().encode('path1/valami/masodik.ext')
const path4 = new TextEncoder().encode('path1/valami')
const path5 = new TextEncoder().encode('path2')
node.addFork(path1, address1)
node.addFork(path2, address2, { vmi: 'elso' }) // here 'vmi' is a key of metadata and 'elso' is its value
node.addFork(path3, address3)
node.addFork(path4, address4, { vmi: 'negy' })
node.addFork(path5, address5)
node.removePath(path3)
// (...)
```

## SepaTree Storage Operations

```ts
import { SepaTreeNode } from 'sepatree'

const node = new SepaTreeNode()
// here `reference` parameter is a `Reference` type which can be a 32 or 64 bytes Uint8Array
// and `loadFunction` is a [loadFunction: async (address: Reference): Promise<Uint8Array>] typed function
// that returns the serialised raw data of a SepaTreeNode of the given reference
await node.load(loadFunction, reference)

// Manipulate `node` object then save it again
// (...)

// save into the storage with a storage handler [saveFuncion: async (data: Uint8Array): Promise<Reference>]
const reference = await node.save(saveFunction)
```

# node binary format

The following describes the format of a node binary format.

```
┌────────────────────────────────┐
│ hash("sepatree:0.1") <31 byte> │
├────────────────────────────────┤
│     refBytesSize <1 byte>      │
├────────────────────────────────┤
│       entry <32/64 byte>       │
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │           Fork 1           │ │
│ ├────────────────────────────┤ │
│ │            ...             │ │
│ ├────────────────────────────┤ │
│ │           Fork N           │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## Fork

```
┌───────────────────┬───────────────────────┬──────────────────┐
│ nodeType <1 byte> │ prefixLength <1 byte> │ prefix <30 byte> │
├───────────────────┴───────────────────────┴──────────────────┤
│                    reference <32/64 bytes>                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Fork with metadata

```
┌───────────────────┬───────────────────────┬──────────────────┐
│ nodeType <1 byte> │ prefixLength <1 byte> │ prefix <30 byte> │
├───────────────────┴───────────────────────┴──────────────────┤
│                    reference <32/64 bytes>                   │
│                                                              │
├─────────────────────────────┬────────────────────────────────┤
│ metadataBytesSize <2 bytes> │     metadataBytes <varlen>     │
├─────────────────────────────┘                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

# Testing

The testing needs running Bee client node for integration testing.
You can set `BEE_POSTAGE` environment variable with a valid Postage batch or the test will create one for you.

The default value of the Bee Debug API endpoint is `http://localhost:1635`. 
If your address diverges from that, please, set `BEE_DEBUG_API_URL` system environment variable with yours.

To run test execute

```sh
npm run test
```
