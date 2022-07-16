<script>
    import { createEventDispatcher, getContext } from "svelte";

    import SplitPane from "../../repl/src/SplitPane.svelte";
    import { repl } from "../store";
    import Designer from "./Designer.svelte";
    import Toolbar from "./Toolbar.svelte";
    let designer = true;

    const { selected } = getContext("REPL");


    function onSave() {
        $repl.markSaved();
        window.sessionStorage.project = JSON.stringify(
            $repl.toJSON().components
        );
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
                    on:switch-designer={() => (designer = !designer)}
                    on:save={onSave}
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
    .selector :global(.component-selector) {
        width: 100%;
        height: 100%;
    }
</style>
