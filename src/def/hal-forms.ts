// https://docs.spring.io/spring-hateoas/docs/current/reference/html/#mediatypes.hal-forms.metadata
import { Method } from 'axios'
import { RepresentationModel } from './hal'

export type Template<T extends object = any> = {
  readonly title: string
  readonly method: Method
  readonly properties: TemplateProperty<keyof T extends string ? keyof T : never>[]
  readonly target?: string

}

export type TemplateProperty<K extends string = string> = {
  readonly name: K
  readonly required?: boolean
  readonly readOnly?: boolean
  readonly type?: string
  readonly min?: number
  readonly max?: number
  readonly regex?: string
  readonly minLength?: number
  readonly maxLength?: number
  readonly options?: unknown // TODO
  readonly prompt?: string
  readonly placeholder?: string
}

export type TemplatesMixin = {
  readonly _templates: Record<string, Template<any>>
}

export function hasTemplates<T extends RepresentationModel> (rm: T): rm is T & TemplatesMixin {
  return '_templates' in rm
}
