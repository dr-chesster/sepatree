import getRandomValues from 'get-random-values'
import type { Message } from 'js-sha3'
import { keccak256 } from 'js-sha3'
import { Bytes, Reference } from './types'

export function checkReference(ref: Reference): void | never {
  if (!(ref instanceof Uint8Array) || typeof ref !== 'object') {
    throw new Error('Given referennce is not an Uint8Array instance.')
  }

  if (ref.length !== 32 && ref.length !== 64) {
    throw new Error(`Wrong reference length. Entry only can be 32 or 64 length in bytes`)
  }
}

export function checkBytes<Length extends number>(bytes: unknown, length: number): asserts bytes is Bytes<Length> {
  if (!(bytes instanceof Uint8Array)) throw Error('Cannot set given bytes, because is not an Uint8Array type')

  if (bytes.length !== 32) {
    throw Error(`Cannot set given bytes, because it does not have ${length} length. Got ${bytes.length}`)
  }
}

export function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function bytesToString(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

/**
 * Finds starting index `searchFor` in `element` Uin8Arrays
 *
 * If `searchFor` is not found in `element` it returns -1
 *
 * @param element
 * @param searchFor
 * @returns starting index of `searchFor` in `element`
 */
export function findIndexOfArray(element: Uint8Array, searchFor: Uint8Array): number {
  for (let i = 0; i <= element.length - searchFor.length; i++) {
    let j = 0
    while (j < searchFor.length) {
      if (element[i + j] !== searchFor[j++]) break
    }

    if (j === searchFor.length) return i
  }

  return -1
}

/** Overwrites `a` bytearrays elements with elements of `b` starts from `i` */
export function overwriteBytes(a: Uint8Array, b: Uint8Array, i = 0): void {
  if (a.length < b.length + i) {
    throw Error(
      `Cannot copy bytes because the base byte array length is lesser (${a.length}) than the others (${b.length})`,
    )
  }

  for (let index = 0; index < b.length; index++) {
    a[index + i] = b[index]
  }
}

export function referenceToHex(reference: Reference | Uint8Array): string {
  return Buffer.from(reference).toString('hex')
}

/**
 * Flattens the given array that consist of Uint8Arrays.
 */
export function flattenBytesArray(bytesArray: Uint8Array[]): Uint8Array {
  if (bytesArray.length === 0) return new Uint8Array(0)

  const bytesLength = bytesArray.map(v => v.length).reduce((sum, v) => (sum += v))
  const flattenBytes = new Uint8Array(bytesLength)
  let nextWriteIndex = 0
  for (const b of bytesArray) {
    overwriteBytes(flattenBytes, b, nextWriteIndex)
    nextWriteIndex += b.length
  }

  return flattenBytes
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  return a.every((byte, index) => b[index] === byte)
}

export function keccak256Hash(...messages: Message[]): Bytes<32> {
  const hasher = keccak256.create()

  messages.forEach(bytes => hasher.update(bytes))

  return Uint8Array.from(hasher.digest()) as Bytes<32>
}

/** Tested only for Uint16 BigEndian */
export function fromBigEndian(bytes: Uint8Array): number {
  if (bytes.length === 0) throw Error('fromBigEndian got 0 length bytes')
  const numbers: number[] = []
  const lastIndex = bytes.length - 1

  for (let i = 0; i < bytes.length; i++) {
    numbers.push(bytes[lastIndex - i] << (8 * i))
  }

  return numbers.reduce((bigEndian, num) => (bigEndian |= num))
}

/** Tested only with Uint16 BigEndian */
export function toBigEndianFromUint16(value: number): Bytes<2> {
  if (value < 0) throw Error(`toBigEndianFromUint16 got lesser than 0 value: ${value}`)
  const maxValue = (1 << 16) - 1

  if (value > maxValue) throw Error(`toBigEndianFromUint16 got greater value then ${maxValue}: ${value} `)

  return new Uint8Array([value >> 8, value]) as Bytes<2>
}

export function gen32Bytes(): Bytes<32> {
  const bytes = new Uint8Array(32)

  return getRandomValues(bytes) as Bytes<32>
}

/** It returns the common bytes of the two given byte arrays until the first byte difference */
export function common(a: Uint8Array, b: Uint8Array): Uint8Array {
  let c = new Uint8Array(0)

  for (let i = 0; i < a.length && i < b.length && a[i] === b[i]; i++) {
    c = new Uint8Array([...c, a[i]])
  }

  return c
}
