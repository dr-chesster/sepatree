import { equalNodes, SepaTreeNode } from '../src/node'
import { gen32Bytes } from '../src/utils'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeEqualNode(compareTo: SepaTreeNode): R
    }
  }
}

/**
 * Load common own Jest Matchers which can be used to check particular return values.
 */
export function commonMatchers(): void {
  expect.extend({
    toBeEqualNode(received: SepaTreeNode, compareTo: SepaTreeNode) {
      const result = {
        pass: true,
        message: () => 'Given Manatary nodes are equal',
      }

      try {
        equalNodes(received, compareTo)
      } catch (e) {
        result.pass = false
        result.message = () => e.message
      }

      return result
    },
  })
}

export function getSampleMantarayNode(): { node: SepaTreeNode; paths: string[] } {
  const node = new SepaTreeNode()
  const randAddress = gen32Bytes()
  node.setEntry = randAddress
  const path1 = 'path1'
  const path2 = 'path1/valami'
  const path3 = 'path1/valami/masodik.ext'
  const path4 = 'path2'
  const path5 = 'path1/valami/elso.ext'
  SepaTreeNode.addFork(node, path1, randAddress, { vmi: 'elso' })
  SepaTreeNode.addFork(node, path2, randAddress)
  SepaTreeNode.addFork(node, path3, randAddress)
  SepaTreeNode.addFork(node, path4, randAddress, { vmi: 'negy' })
  SepaTreeNode.addFork(node, path5, randAddress)

  return {
    node,
    paths: [path1, path2, path3, path4, path5],
  }
}
