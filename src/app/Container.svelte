<script lang="ts">
    import { createEventDispatcher, getContext } from "svelte";
    import { downloadZip } from "client-zip";
    import SplitPane from "../../repl/src/SplitPane.svelte";
    import { repl } from "../store";
    import type { ReplContext } from "../types";
    import Designer from "./Designer.svelte";
    import Toolbar from "./Toolbar.svelte";
    import { setupProjectFiles } from "../renderer";
    let designer = true;

    const { selected, navigate }: ReplContext = getContext("REPL");

    function onSave() {
        $repl.markSaved();
        window.sessionStorage.project = JSON.stringify(
            $repl.toJSON().components
        );
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
</script>

<div class="container">
    <SplitPane type="horizontal" pos={50}>
        <section class="workpanel" slot="a">
            <div class="selector">
                <slot name="selector" />
            </div>
            <div class="toolbar">
                <Toolbar
                    designerMode={designer}
                    on:switch-designer={() => {
                        if (designer && $selected) {
                            // refresh editor
                            navigate({
                                filename: `${$selected.name}.${$selected.type}`,
                            });
                        }
                        designer = !designer;
                    }}
                    on:save={onSave}
                    on:export={onExport}
                />
            </div>
            <div class="worksheet">
                <section class:hidden={designer}>
                    <slot name="editor" />
                </section>
                <section class:hidden={!designer}>
                    {#if $selected}
                        <Designer />
                    {/if}
                </section>
            </div>
        </section>
        <section class="output" slot="b" style="height: 100%;">
            <slot name="output" />
        </section>
    </SplitPane>
</div>

<style>
    .container {
        position: relative;
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
    .worksheet,
    .worksheet :global(section),
    .worksheet :global(.editor-wrapper),
    .selector :global(.component-selector),
    .output :global(section),
    .output :global(section)>:global(*:last-child)
    {
        width: 100%;
        height: 100%;
    }
</style>
