export const marshalVersionValues = ['0.1', '0.2'] as const

export type MarshalVersion = typeof marshalVersionValues[number]

export interface Bytes<Length extends number> extends Uint8Array {
  readonly length: Length
}

export type Reference = Bytes<32 | 64>

export enum NodeType {
  value = 2,
  edge = 4,
  withPathSeparator = 8,
  withMetadata = 16,
  mask = 255,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MetadataMapping = { [key: string]: any }

export type StorageLoader = (reference: Reference) => Promise<Uint8Array>

export type StorageSaver = (data: Uint8Array, options?: { ecrypt?: boolean }) => Promise<Reference>

export type StorageHandler = {
  load: StorageLoader
  save: StorageSaver
}
