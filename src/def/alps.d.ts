import { HypermediaControlType } from './hypermedia'


export interface Alps<Singular extends string, Plural extends string> {
  readonly alps: {
    readonly version: string
    readonly descriptor: [AlpsSelfRepresentation, ...AlpsEntrypointRepresentation<Singular, Plural>[]]
  }
}

type AlpsSelfRepresentation = {
  id: string
  href: string
  descriptor: AlpsAttribute[]
}

type AlpsEntrypointRepresentation<Singular extends string, Plural extends string> = {
  id: string
  name: Singular | Plural
  type: HypermediaControlType
  descriptor: AlpsAttribute[]
  rt: string
}

type AlpsAttribute = AlpsSemanticAttribute | AlpsSafeAttribute
type AlpsSemanticAttribute = {
  name: string
  type: HypermediaControlType.SEMANTIC
  descriptors?: AlpsAttribute[]
}
type AlpsSafeAttribute = {
  name: string
  type: HypermediaControlType.SAFE
  rt: string
}

export interface AlpsDescriptor {
}
