import type { Writable } from "svelte/store";

export interface Project {
    files: Component[],
    options: {
        name: string,
        packages: string[],
        imports: string[],
    }
}
export interface Component {
    type: string
    name: string
    source: string
    template: Record<string, Template>
    options: Partial<ComponentOptions>
    modified: boolean
}

export interface ComponentOptions {
    freeId: number
}


export interface ReplContext {
   components: Writable<Component[]>
   selected: Writable<Component>
   navigate: any
   handle_change: (e: {detail:{value: string, template: Record<string, Template>}}) => void
}

export interface Preset {
    element: string
    props: Record<string, string>
    children: Preset[]
}

export interface Template {
    id: string
    widget: string
    props: Record<string, string>
    items: {id: string}[]
}

export type PackageList = Record<string, Record<string, Record<string, Widget>>>

export interface RenderContext {
    packages: PackageList
    addImport: (name: string, path: string, content?: string) => string
}

export interface Widget {
    name?: string
    display?: (props: string[]) => string
    editor?: any | null
    props?: (string | WidgetProp)[]
    default?: Partial<Template>
    presets?: Record<string, Preset>
    imports?: string
    files?: Record<string, string>
    child?: undefined | "single" | "none"
}

export interface WidgetProp {
    type: "text" | "textarea" | "select" | "prop-select" | "prop"
    options?: string[],
    name: string,
    label?: string,
    persistent?: boolean,
}