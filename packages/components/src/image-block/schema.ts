import { expectDomTypeError } from '@milkdown/exception'
import { $nodeSchema } from '@milkdown/utils'

import { withMeta } from '../__internal__/meta'

export const IMAGE_DATA_TYPE = 'image-block'

// Brainfish Platform format: parse "=widthxheight" from title
const imageSizeRegex = /\s?=(\d*?)x(\d*)$/
const MAX_DIMENSION = 2048 //avoids overflow in rendering

function parseBoundedDimension(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = parseInt(value, 10)
  if (Number.isNaN(n) || n < 1 || n > MAX_DIMENSION) return undefined
  return n
}

export function parseSizeFromTitle(title: string | undefined): {
  width?: number
  height?: number
  cleanTitle: string
} {
  const match = title?.match(imageSizeRegex)
  if (!match) return { cleanTitle: title ?? '' }
  const width = parseBoundedDimension(match[1])
  const height = parseBoundedDimension(match[2])
  // Reject malformed "=x", "=", "= x " etc.: require at least one valid dimension
  if (width === undefined && height === undefined)
    return { cleanTitle: title ?? '' }
  return {
    width,
    height,
    cleanTitle: title ? title.replace(imageSizeRegex, '').trim() : '',
  }
}

/**
 * Parse image block attributes from markdown alt and title.
 * Exported for testing.
 */
export function parseImageBlock(
  alt: string | undefined,
  title: string | undefined,
  nodeWidth?: number,
  nodeHeight?: number
): { ratio: number; caption: string; width?: number; height?: number } {
  const {
    width: titleWidth,
    height: titleHeight,
    cleanTitle,
  } = parseSizeFromTitle(title)
  const width = titleWidth ?? nodeWidth
  const height = titleHeight ?? nodeHeight
  const hasPlatformDimensions = width !== undefined || height !== undefined

  let ratio = 1
  let caption = ''

  if (hasPlatformDimensions) {
    caption = alt || cleanTitle
  } else {
    const parsedRatio = Number(alt || 1)
    if (!Number.isNaN(parsedRatio) && parsedRatio !== 0) {
      ratio = parsedRatio
      caption = cleanTitle
    } else {
      caption = alt || cleanTitle
    }
  }

  return { ratio, caption, width, height }
}

export const imageBlockSchema = $nodeSchema('image-block', () => {
  return {
    inline: false,
    group: 'block',
    selectable: true,
    draggable: true,
    isolating: true,
    marks: '',
    atom: true,
    priority: 100,
    attrs: {
      src: { default: '', validate: 'string' },
      caption: { default: '', validate: 'string' },
      ratio: { default: 1, validate: 'number' },
      width: { default: undefined },
      height: { default: undefined },
    },
    parseDOM: [
      {
        tag: `img[data-type="${IMAGE_DATA_TYPE}"]`,
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom)
          const w = dom.getAttribute('width')
          const h = dom.getAttribute('height')
          return {
            src: dom.getAttribute('src') || '',
            caption: dom.getAttribute('caption') || '',
            ratio: Number(dom.getAttribute('ratio') ?? 1),
            width: w ? parseInt(w, 10) : undefined,
            height: h ? parseInt(h, 10) : undefined,
          }
        },
      },
    ],
    toDOM: (node) => {
      const { width, height, ...rest } = node.attrs
      return [
        'img',
        {
          'data-type': IMAGE_DATA_TYPE,
          ...rest,
          ...(width != null && { width }),
          ...(height != null && { height }),
        },
      ]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image-block',
      runner: (state, node, type) => {
        const src = node.url as string
        const n = node as {
          alt?: string
          title?: string
          width?: number
          height?: number
        }
        const { ratio, caption, width, height } = parseImageBlock(
          n.alt,
          n.title,
          n.width,
          n.height
        )
        state.addNode(type, {
          src,
          caption,
          ratio,
          width: width ?? n.width,
          height: height ?? n.height,
        })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image-block',
      runner: (state, node) => {
        let title = ''
        if (node.attrs.width != null || node.attrs.height != null) {
          const w = node.attrs.width != null ? String(node.attrs.width) : ''
          const h = node.attrs.height != null ? String(node.attrs.height) : ''
          title = `=${w}x${h}`
        }
        state.openNode('paragraph')
        state.addNode('image', undefined, undefined, {
          title,
          url: node.attrs.src,
          alt: node.attrs.caption || '',
        })
        state.closeNode()
      },
    },
  }
})

withMeta(imageBlockSchema.node, {
  displayName: 'NodeSchema<image-block>',
  group: 'ImageBlock',
})
