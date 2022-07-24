<script lang="ts">
    import { getContext, onMount } from "svelte";
    import { downloadZip } from "client-zip";
    import mime from "mime";
    import SplitPane from "../../repl/src/SplitPane.svelte";
    import type { AppContext, Project, ReplContext } from "../types";
    import Designer from "./Designer.svelte";
    import Toolbar from "./Toolbar.svelte";
    import { setupProjectFiles } from "../renderer";
    import Hierarchy from "./Hierarchy.svelte";
    import Files from "./Files.svelte";
    import { builtinPackages, renderWidget } from "../packages";
    import { ucfirst } from "../packages/shared/editor/utils";
    import { encode, decode } from "@msgpack/msgpack";
    import { Button, Modal } from "carbon-components-svelte";
    import { liveQuery } from "dexie";
    import OpenDialog from "./OpenDialog.svelte";
    let designerMode = true;
    let showHierarchy = true;
    let showFiles = true;
    let showOpenDialog = false;
    let selectedId = "1";

    const { selected, navigate, handle_change }: ReplContext =
        getContext("REPL");

    const { project, repl, files_db }: AppContext = getContext("APP");

    onMount(() => {
        if (window.sessionStorage.project) {
            loadProject(window.sessionStorage.project);
        } else {
            $repl.set({
                components: $project.files,
            });
        }
    });

    function onSave(e: CustomEvent<string>) {
        if (!$project.options.name) {
            var newName = prompt("Please enter a name for this project");
            if (!newName) {
                alert("Project name is required to save this project");
                return;
            }
            $project.options.name = newName;
        }
        $repl.markSaved();
        project.update((p) => {
            window.sessionStorage.project = p.options.name;
            var json = $repl.toJSON();
            p.files = json.components;
            p.options.imports = json.imports;
            p.options.updatedAt = new Date().toISOString();
            var file = encode(p);
            switch (e.detail) {
                case "storage":
                    files_db.project.put({
                        file,
                        name: p.options.name,
                        updatedAt: p.options.updatedAt,
                    });
                    break;
                case "download":
                    var blob = new Blob([file], {
                        type: "application/msgpack",
                    });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = p.options.name + ".project.forger";
                    link.click();
                    link.remove();
                    break;
                case "export":
                    const data = $repl.toJSON();
                    const filename = p.options.name + "-export";
                    // get the ZIP stream in a Blob
                    downloadZip(setupProjectFiles(data, filename))
                        .blob()
                        .then((blob) => {
                            // make and click a temporary link to download the Blob
                            const link = document.createElement("a");
                            link.href = URL.createObjectURL(blob);
                            link.download = filename + ".zip";
                            link.click();
                            link.remove();
                        });

                    break;
            }
            return p;
        });
    }

    function loadProject(p: Project | string) {
        if (typeof p == "string") {
            files_db.project
                .get(p)
                .then((file) => {
                    if (!file) {
                        alert("Project not found");
                        return;
                    }
                    // @ts-ignore
                    loadProject(decode(file.file));
                })
                .catch((x) => {
                    console.error(x);
                });
            return;
        }
        project.set(p);
        $project.files.forEach((file) => {
            if (file.bytes) {
                const mimeText = mime.getType(file.type) || "text/plain";
                var blob = new Blob([file.bytes], {
                    type: mimeText,
                });
                file.source = `export default ` + JSON.stringify(URL.createObjectURL(blob)) + ";";
            }
        });
        $repl.set({
            components: $project.files,
        });
    }

    function onLoad(e: CustomEvent<string>) {
        switch (e.detail) {
            case "storage":
                showOpenDialog = true;
                break;
            case "file":
                // open a file dialog
                var input = document.createElement("input");
                input.type = "file";
                input.onchange = function (e) {
                    // @ts-ignore
                    var file = e.target.files[0];
                    if (!file) {
                        input.remove();
                        return;
                    }
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        // @ts-ignore
                        var data = e.target.result;
                        // @ts-ignore
                        var p = decode<Project>(data);
                        if (p) {
                            // @ts-ignore
                            loadProject(p);
                        }
                        input.remove();
                    };
                    reader.readAsArrayBuffer(file);
                };
                input.click();
                break;
            case "new":
                window.sessionStorage.clear();
                window.location.reload();
                break;
        }
    }

    function onSwitchDesigner() {
        if ($selected) {
            // refresh editor
            navigate({
                filename: `${$selected.name}.${$selected.type}`,
            });
        }
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
        if ($selected.options.style) {
            html += `<` + `style>${$selected.options.style}</style>`;
        }
        var headers = Object.entries(imports)
            .map(([name, path]) => {
                if (path.startsWith("!")) {
                    path = path.substring(1);
                    name = `{ ${name} }`;
                }
                return `  import ${name} from ${JSON.stringify(path)}`;
            })
            .join("\n");
        if ($selected.options.script) {
            headers += `\n${$selected.options.script}`;
        }
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
                    on:load={onLoad}
                />
            </div>
            <div class="worksheet">
                <section id="files" class:hidden={!showFiles}>
                    <Files
                        on:selected={() => {
                            setTimeout(onSwitchDesigner, 1);
                            selectedId = "1";
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
                    <section
                        id="editor"
                        class:hidden={!!$selected.template &&
                            $selected.template["1"] &&
                            designerMode}
                    >
                        <slot name="editor" />
                    </section>
                {/if}
            </div>
        </section>
        <section class="output" slot="b" style="height: 100%; color: black;">
            <slot name="output" />
        </section>
    </SplitPane>
    <Modal passiveModal bind:open={showOpenDialog} modalHeading="Open File">
        {#if showOpenDialog}
            <OpenDialog
                on:open={(e) => {
                    loadProject(e.detail);
                    showOpenDialog = false;
                }}
            />
        {/if}
    </Modal>
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
