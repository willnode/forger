<script lang="ts">
    import { createEventDispatcher, getContext } from "svelte";
    import { downloadZip } from "client-zip";
    import SplitPane from "../../repl/src/SplitPane.svelte";
    import { repl } from "../store";
    import type { ReplContext } from "../types";
    import Designer from "./Designer.svelte";
    import Toolbar from "./Toolbar.svelte";
    import { setupProjectFiles } from "../renderer";
    import Hierarchy from "./Hierarchy.svelte";
    import Files from "./Files.svelte";
    import { builtinPackages, renderWidget } from "../packages";
    import { ucfirst } from "../packages/shared/editor/utils";
    let designerMode = true;
    let showHierarchy = true;
    let showFiles = true;
    let selectedId = "1";

    const { selected, navigate, handle_change }: ReplContext =
        getContext("REPL");

    function onSave() {
        $repl.markSaved();
        window.sessionStorage.project = JSON.stringify(
            $repl.toJSON().components
        );
    }

    function onSwitchDesigner() {
        if ($selected) {
            // refresh editor
            navigate({
                filename: `${$selected.name}.${$selected.type}`,
            });
        }
    }

    async function onExport() {
        onSave();
        const data = $repl.toJSON();
        const filename = "forger-export";
        // get the ZIP stream in a Blob
        const blob = await downloadZip(
            setupProjectFiles(data, filename)
        ).blob();

        // make and click a temporary link to download the Blob
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename + ".zip";
        link.click();
        link.remove();
    }

    var nameHash: Record<string, number> = {};
    var imports: Record<string, string> = {};

    function addImport(name: string, path: string) {
        if (!name) {
            var match = name.match(/([\w]+?)\.\w+$/);
            if (match) {
                name = ucfirst(match[1]);
            } else {
                name = "Component";
            }
        }
        var oriName = name;
        while (imports[name] && imports[name] !== path) {
            if (!nameHash[oriName]) {
                nameHash[oriName] = 1;
            } else {
                nameHash[oriName]++;
            }
            name = `${oriName}_${nameHash[name]}`;
        }
        if (!imports[name]) {
            imports[name] = path;
            return name;
        }
        return name;
    }

    function onChange(e: CustomEvent) {
        nameHash = {};
        imports = {};
        var html = renderWidget($selected.template, "1", {
            addImport,
            packages: builtinPackages,
        });
        var headers = Object.entries(imports)
            .map(([name, path]) => {
                if (path.startsWith("!")) {
                    path = path.substring(1);
                    name = `{ ${name} }`;
                }
                return `  import ${name} from ${JSON.stringify(path)}`;
            })
            .join("\n");
        if (headers) {
            html = `<script>\n${headers}\n<\/script>\n${html}`;
        }
        // html = prettier.format(html, {
        //     parser: "svelte",
        //     pluginSearchDirs: ["."],
        //     plugins: [tsParser, cssParser, htmlParser, svelteParser],
        //     svelteStrictMode: true,
        //     svelteBracketNewLine: false,
        //     svelteAllowShorthand: false,
        //     svelteIndentScriptAndStyle: false,
        // });
        handle_change({
            detail: {
                value: html,
                template: $selected.template,
            },
        });
    }
</script>

<div class="container">
    <SplitPane type="horizontal" pos={50}>
        <section class="workpanel" slot="a">
            <div class="toolbar">
                <Toolbar
                    bind:designerMode
                    bind:showHierarchy
                    bind:showFiles
                    on:switchDesigner={onSwitchDesigner}
                    on:save={onSave}
                    on:export={onExport}
                />
            </div>
            <div class="worksheet">
                <section id="files" class:hidden={!showFiles}>
                    <Files
                        on:selected={() => {
                            setTimeout(onSwitchDesigner, 1);
                        }}
                    />
                </section>
                {#if $selected}
                    {#if !!$selected.template && $selected.template["1"]}
                        <section
                            id="hierarchy"
                            class:hidden={!showHierarchy || !designerMode}
                        >
                            <Hierarchy bind:selectedId on:change={onChange} />
                        </section>
                        <section id="designer" class:hidden={!designerMode}>
                            {#if $selected}
                                <Designer
                                    bind:selectedId
                                    on:change={onChange}
                                />
                            {/if}
                        </section>
                    {/if}
                    <section id="editor" class:hidden={(!!$selected.template && $selected.template["1"] && designerMode)}>
                        <slot name="editor" />
                    </section>
                {/if}
            </div>
        </section>
        <section class="output" slot="b" style="height: 100%; color: black;">
            <slot name="output" />
        </section>
    </SplitPane>
</div>

<style>
    .container {
        position: relative;
        display: flex;
        width: 100%;
        height: 100%;
    }

    .workpanel {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .worksheet {
        display: flex;
        flex-direction: row;
        height: 100%;
    }
    .worksheet > section {
        flex: 1;
        min-width: 0;
    }
    #files {
        min-width: auto;
        width: 200px;
        max-width: 20vw;
        flex: 0;
    }
    .worksheet,
    .worksheet :global(section),
    .worksheet :global(.editor-wrapper),
    .output :global(section),
    .output :global(section) > :global(*:last-child) {
        width: 100%;
        height: 100%;
    }
</style>
