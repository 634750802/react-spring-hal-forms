export type Link = {
  readonly href: string
  readonly templated?: boolean
}

export interface RepresentationModel {
  _links: Record<string, Link>
}

export type EntityModel<T extends object> = T & RepresentationModel

export type PageMixin = {
  readonly page: {
    readonly size: number
    readonly totalElements: number
    readonly totalPages: number
    readonly number: number
  }
}

export interface EmbeddedModel<T, K extends string> extends RepresentationModel {
  readonly _embedded: Record<K, T>
}

export interface CollectionModel<T extends object, K extends string> extends EmbeddedModel<EntityModel<T>[], K> {
}

export interface PagedModel<T extends object, K extends string> extends CollectionModel<T, K>, PageMixin {
}

function isEmbedded<T extends object, K extends string> (rm: RepresentationModel, key: K): rm is EmbeddedModel<T, K> {
  return '_embedded' in rm && key in (rm as any as EmbeddedModel<T, K>)._embedded
}

export function isEntity<T extends object> (rm: RepresentationModel): rm is EntityModel<T> {
  return Object.keys(rm).length > 1 && !('_embedded' in rm)
}

export function isCollection<T extends object, K extends string> (rm: RepresentationModel, key: K): rm is CollectionModel<T, K> {
  return isEmbedded(rm, key) && rm._embedded[key] instanceof Array
}

export function isPaged<T extends object, K extends string> (collectionModel: CollectionModel<T, K>): collectionModel is PagedModel<T, K> {
  return 'page' in collectionModel
}
