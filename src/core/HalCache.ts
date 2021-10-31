import { Alps, AlpsAttribute, AlpsSelfRepresentation } from '../def/alps'
import { JSONSchema4 } from 'json-schema'
import { AxiosError, AxiosInstance } from 'axios'
import { Link, RepresentationModel } from '../def/hal'
import { HypermediaControlType } from '../def/hypermedia'
import { EventEmitter2, Listener } from 'eventemitter2'
import { hasTemplates, Template } from '../def/hal-forms'

async function fetchAlps (axios: AxiosInstance, link: Link): Promise<Alps<any, any>> {
  const { data } = await axios.get(link.href, { headers: { 'Accept': 'application/alps+json' } })
  return data as Alps<any, any>
}

async function fetchSchema (axios: AxiosInstance, link: Link): Promise<JSONSchema4 | undefined> {
  try {
    const { data } = await axios.get(link.href, { headers: { 'Accept': 'application/schema+json' } })
    return data as JSONSchema4
  } catch (e) {
    if ((e as AxiosError).response?.status === 500) {
      return undefined
    } else {
      throw e
    }
  }
}

async function fetchProfile (axios: AxiosInstance, link: Link): Promise<[Alps<any, any>, JSONSchema4 | undefined]> {
  return Promise.all([
    fetchAlps(axios, link),
    fetchSchema(axios, link),
  ])
}

export default class HalCache extends EventEmitter2 {

  public readonly collectionRelMap: Map<string, Resource<any, any>> = new Map()
  public readonly itemRelMap: Map<string, Resource<any, any>> = new Map()
  public readonly rtMap: Map<string, Resource<any, any>> = new Map()
  public readonly hrefMap: Map<string, Resource<any, any>> = new Map()

  constructor (public readonly baseUri: string) {
    super()
  }

  addResource (resource: Resource<any, any>) {
    this.collectionRelMap.set(resource.collectionRel, resource)
    this.itemRelMap.set(resource.itemRel, resource)
    this.rtMap.set(resource.id, resource)
    this.hrefMap.set(resource.href, resource)
  }

  static async load (axios: AxiosInstance, baseUri: string) {
    const cache = new HalCache(baseUri)
    const { data }: { data: RepresentationModel } = await axios.get(`${baseUri}/profile`)
    await Promise.all(Object.entries(data._links)
      .filter(([rel]) => rel !== 'self')
      .map(async ([collectionRel, link]) => {
        console.debug(`Retrieving ${collectionRel} profile from ${link.href}`)
        const [alps, schema] = await fetchProfile(axios, link)
        const resource = new Resource(cache, link.href, collectionRel, alps, schema)
        cache.addResource(resource)
      }))
    cache.emit('load-resources')
    return cache
  }
}

class LazyResource<R extends Resource<any, any>> {
  #resolved: R | undefined

  get isResolved (): boolean {
    return !!this.get()
  }

  constructor (public readonly cache: HalCache, public readonly href: string, public readonly id: string) {
  }

  get (): R | undefined {
    if (!this.#resolved) {
      const res = this.cache.hrefMap.get(this.href)
      if (res) {
        if (res.id === this.id) {
          this.#resolved = res as R
        } else {
          console.warn(`ID of resource ${this.href} was not ${res.id}`)
        }
      } else {
        console.warn(`Resource ${this.href} was not loaded`)
      }
      if (res?.id === this.id) {
      }
    }
    return this.#resolved
  }
}

interface CollectionOf<K> {
  forEach (fn: (k: K) => void): void
}

class LazyResourceMap extends Map<string, Resource<any, any>> {
  #unresolved: Set<string> = new Set()
  #lazyMap: Map<string, LazyResource<any>> = new Map()

  constructor () {
    super()
  }

  #resolve (keys: CollectionOf<string>) {
    keys.forEach(key => {
      const resource = this.#lazyMap.get(key)?.get()
      if (resource) {
        this.#unresolved.delete(key)
        this.set(key, resource)
      }
    })
  }

  get (key: string) {
    this.#resolve([key])
    return super.get(key)
  }

  addLazy (key: string, lazy: LazyResource<any>) {
    this.#unresolved.add(key)
    this.#lazyMap.set(key, lazy)
    const listener = lazy.cache.on('load-resources', () => {
      if (this.#unresolved.has(key)) {
        this.#resolve([key])
        if (!this.#unresolved.has(key)) {
          (listener as Listener).off()
        }
      }
    }, { objectify: true })
  }

  get size (): number {
    this.#resolve(this.#unresolved)
    return super.size
  }

  [Symbol.iterator] (): IterableIterator<[string, Resource<any, any>]> {
    this.#resolve(this.#unresolved)
    return super[Symbol.iterator]()
  }

  keys (): IterableIterator<string> {
    this.#resolve(this.#unresolved)
    return super.keys()
  }

  entries (): IterableIterator<[string, Resource<any, any>]> {
    this.#resolve(this.#unresolved)
    return super.entries()
  }

  values (): IterableIterator<Resource<any, any>> {
    this.#resolve(this.#unresolved)
    return super.values()
  }
}


export class Resource<Singular extends string, Plural extends string> {
  readonly id: string
  readonly itemRel: Singular
  readonly selfRepresentation: AlpsSelfRepresentation
  readonly attributesMap: Map<string, AlpsAttribute> = new Map()
  readonly fieldsMap: Map<string, JSONSchema4> = new Map()
  readonly associationsMap: LazyResourceMap = new LazyResourceMap()
  readonly templatesMap: Map<string, Template> = new Map()
  triedFetchTemplates = false

  constructor (public readonly cache: HalCache, public readonly href: string, public readonly collectionRel: Plural, public readonly alps: Alps<any, any>, public readonly schema: JSONSchema4 | undefined) {
    this.id = alps.alps.descriptor[0].id
    this.itemRel = this.id.slice(0, this.id.lastIndexOf('-')) as Singular
    this.selfRepresentation = alps.alps.descriptor[0]
    for (const attribute of this.selfRepresentation.descriptor) {
      switch (attribute.type) {
        case HypermediaControlType.SEMANTIC:
          const property = this.schema?.properties?.[attribute.name]
          if (property) {
            this.fieldsMap.set(attribute.name, property)
          }
          break
        case HypermediaControlType.SAFE: {
          const [href, id] = attribute.rt.split('#')
          this.associationsMap.addLazy(attribute.name, new LazyResource(cache, href, id))
          break
        }
      }
      this.attributesMap.set(attribute.name, attribute)
    }
  }

  tryFillTemplates (rm: RepresentationModel) {
    if (!hasTemplates(rm)) {
      return
    }
    this.templatesMap.clear()
    const collectionLink = rm._links[this.collectionRel]
    const itemLink = rm._links[this.itemRel]
    for (let [key, template] of Object.entries(rm._templates)) {
      if (key === 'default') {
        this.templatesMap.set(`create-${this.collectionRel}`, template)
      } else if (collectionLink && template.target === collectionLink.href) {
        switch ((template.method ?? '').toLowerCase()) {
          case 'post':
            this.templatesMap.set(`create-${this.collectionRel}`, template)
            break
        }
      } else if (itemLink && template.target === itemLink.href) {
        switch ((template.method ?? '').toLowerCase()) {
          case 'put':
            this.templatesMap.set(`update-${this.itemRel}`, template)
            break
          case 'delete':
            this.templatesMap.set(`delete-${this.itemRel}`, template)
            break
        }
      }
    }
  }
}
