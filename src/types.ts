import type { Writable } from "svelte/store";

export interface Component {
    type: string
    name: string
    source: string
    template: (string|Template)[]
}

export interface ReplContext {
   components: Writable<Component[]>
   selected: Writable<Component>
   handle_change: (e: {detail:{value: string, template: (string|Template)[]}}) => void
}

export interface Template {
    widget: string
    props: Record<string, string>
    child: (string|Template)[]
}

export type PackageList = Record<string, Record<string, Record<string, Widget>>>

export interface RenderContext {
    packages: PackageList
    addImport: (name: string, path: string, content?: string) => string
}

export interface Widget {
    name?: string
    editor?: any | null
    defaultProps?: Record<string, string>
    presets?: Record<string, Template>
    imports?: string
    files?: Record<string, string>
}
