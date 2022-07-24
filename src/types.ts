import Dexie, { type Table } from "dexie";
import type { Writable } from "svelte/store";
import type Repl from "../repl/src/Repl.svelte";

export interface Project {
    files: Component[],
    options: {
        schema: "1",
        name: string,
        packages: string[],
        imports: string[],
        updatedAt: string,
        createdAt: string,
    }
}

export interface ProjectFile {
    name: string,
    file: Uint8Array,
    updatedAt: string,
}

export interface Component {
    type: string
    name: string
    source: string
    bytes?: Uint8Array
    template: Record<string, Template>
    options: Partial<ComponentOptions>
    modified: boolean
}

export interface ComponentOptions {
    freeId: number,
    script: string,
    style: string,
}


export interface ReplContext {
    components: Writable<Component[]>
    selected: Writable<Component>
    navigate: any
    bundle: any
    handle_change: (e: { detail: { value: string, template: Record<string, Template> } }) => void
}

export interface AppContext {
    clipboard: Writable<Preset | null>
    project: Writable<Project>
    repl: Writable<Repl>
    files_db: ProjectFilesDB
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
    items: { id: string }[]
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
    type: "text" | "textarea" | "select" | "prop-select" | "prop-select-multi" | "prop"
    options?: string[],
    name: string,
    label?: string,
    persistent?: boolean,
}

export class ProjectFilesDB extends Dexie {
    // 'friends' is added by dexie when declaring the stores()
    // We just tell the typing system this is the case
    project!: Table<ProjectFile>; 
  
    constructor() {
      super('forger-project-library');
      this.version(1).stores({
        project: 'name' // Primary key and indexed props
      });
    }
  }
