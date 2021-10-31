import { SepaTreeNode } from '../src'
import { gen32Bytes } from '../src/utils'
import { getSampleMantarayNode } from './utils'

it('should init a single mantaray node with a random address', () => {
  const node = new SepaTreeNode()
  const randAddress = gen32Bytes()
  node.setEntry = randAddress
  const serialized = node.serialize()
  const nodeAgain = new SepaTreeNode()
  nodeAgain.deserialize(serialized)
  expect(randAddress).toStrictEqual(nodeAgain.getEntry)
})

it('tests getForkAtPath method of node and checkForSeparator function', () => {
  const sampleNode = getSampleMantarayNode()
  const node = sampleNode.node
  const path1 = sampleNode.paths[0]
  const path2 = sampleNode.paths[1]
  const path3 = sampleNode.paths[2]
  const path4 = sampleNode.paths[3]
  const path5 = sampleNode.paths[4]

  expect(() => node.getForkAtPath('path/not/exists')).toThrowError()

  expect(node.isWithPathSeparatorType()).toBeFalsy()

  const fork1 = node.getForkAtPath(path1)
  expect(fork1.node.isWithPathSeparatorType()).toBeTruthy()

  const fork2 = node.getForkAtPath(path2)
  expect(fork2.node.isWithPathSeparatorType()).toBeTruthy()

  const fork3 = node.getForkAtPath(path3)
  expect(fork3.node.isWithPathSeparatorType()).toBeTruthy()

  const fork4 = node.getForkAtPath(path4)
  expect(fork4.node.isWithPathSeparatorType()).toBeTruthy()

  const fork5 = node.getForkAtPath(path5)
  expect(fork5.node.isWithPathSeparatorType()).toBeTruthy()
})

xit('should throw exception on serialize if there were no storage saves before', () => {
  // TODO: write safe param that check for dirty flag
  const node = new SepaTreeNode()
  const randAddress = gen32Bytes()
  const path = 'vmi'
  SepaTreeNode.addFork(node, path, randAddress)
  expect(() => node.serialize()).toThrowError()
})

it('checks the expected structure of the sample mantaray node', () => {
  const sampleNode = getSampleMantarayNode()
  const node = sampleNode.node
  const path1 = sampleNode.paths[0]
  const path4 = sampleNode.paths[3]

  expect(Object.keys(node.forks)).toStrictEqual([path1, path4])
})

it('should remove forks', () => {
  const sampleNode = getSampleMantarayNode()
  const node = sampleNode.node
  // save sample node
  const path2 = sampleNode.paths[1]
  const path5 = sampleNode.paths[4]

  // non existing path check
  expect(() => SepaTreeNode.removeFork(node, 'not-exist')).toThrowError()
  // node where the fork set will change
  const checkNode1 = node.getForkAtPath(path2).node
  // current forks of node
  expect(Object.keys(checkNode1.forks)).toStrictEqual(['masodik.ext', 'elso.ext'])
  SepaTreeNode.removeFork(node, path5)
  // 'm' key of prefix table disappeared
  expect(Object.keys(checkNode1.forks)).toStrictEqual(['masodik.ext'])
})
