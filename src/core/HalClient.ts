import HalCache, { Resource } from './HalCache'
import { CollectionModel, EntityModel } from '../def/hal'
import { AxiosError, AxiosInstance } from 'axios'

export type FetchConfig = {
  associations?: string[] | boolean
}

function isAxiosError (e: unknown): e is AxiosError {
  return typeof e === 'object' && !!e && 'config' in e
}

export default class HalClient {

  constructor (public readonly axios: AxiosInstance, public readonly cache: HalCache) {
    axios.interceptors.response.use(undefined, error => {
      if (isAxiosError(error)) {
        if (error.config.headers?.accept === 'application/prs.hal-forms+json') {
          return axios.request({ ...error.config, headers: { ...error.config.headers, accept: 'application/hal+json' } })
        }
      }
      return Promise.reject(error)
    })
  }

  private resource (rel: string): Resource<any, any> {
    const resource = this.cache.collectionRelMap.get(rel)
    if (!resource) {
      throw new Error(`No collection resource named ${rel}`)
    }
    return resource
  }

  async assembleAssociation (entity: EntityModel<object>, association: string) {
    if (association in entity) {
      return
    }
    if (association === 'self') {
      return
    }
    const link = entity._links[association]
    if (!link) {
      throw new Error(`Unknown association for entity ${entity._links.self.href}`)
    }
    if (entity._links.self.href === link.href) {
      return
    }
    const { data } = await this.axios.get(link.href);
    (entity as any)[association] = data
  }

  async get<K extends string> (rel: K, id: string | number, options?: FetchConfig): Promise<EntityModel<any>> {
    const resource = this.resource(rel)
    const { data }: { data: EntityModel<object> } = await this.axios.get(this.cache.baseUri + `/${resource.collectionRel}/${id}`, resource.collectionRel)
    if (options?.associations) {
      if (options.associations === true) {
        await Promise.all(Object.keys(data._links).map(a => this.assembleAssociation(data, a)))
      } else {
        await Promise.all(options.associations.map(a => this.assembleAssociation(data, a)))
      }
    }
    return data
  }

  async getCollection<K extends string> (rel: K): Promise<CollectionModel<any, K>> {
    const resource = this.cache.collectionRelMap.get(rel)
    if (!resource) {
      throw new Error(`No collection resource named ${rel}`)
    }
    const accept = resource.triedFetchTemplates ? 'application/hal+json' : 'application/prs.hal-forms+json'
    resource.triedFetchTemplates = true
    const { data }: { data: CollectionModel<any, K> } = await this.axios.get(
      this.cache.baseUri + `/${resource.collectionRel}`, {
        headers: { accept },
      })
    resource.tryFillTemplates(data)
    return data
  }

}
