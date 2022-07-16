export interface Component {
    type: "svelte"|"js"|"json"
    name: string
    source: string
    template: Template
}

export interface Template {
    widget: string
    props: Record<string, string>
    child: null|string[]|Template[]
}

export type PackageList = Record<string, Record<string, Record<string, Widget>>>

export interface RenderContext {
    packages: PackageList
    imports: Record<string, string>
    contents: Record<string, string>

    addImport: (name: string, path: string, content?: string) => string
}

export interface Widget {
    render?: string
    editor?: any | null
    imports?: string
}
