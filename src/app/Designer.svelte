<script lang="ts">
    import { getContext } from "svelte";
    import type { ReplContext } from "../types";
    import TemplateEditor from "./TemplateEditor.svelte";
    import { createEventDispatcher } from "svelte";

    export let selectedId: string = "";

    const { selected }: ReplContext = getContext("REPL");
    const dispatch = createEventDispatcher();
</script>

<div style="margin-right: 2rem">
    {#if $selected.template[selectedId] != null}
        <div>#{selectedId}</div>
        <TemplateEditor
            template={$selected.template[selectedId]}
            on:change={(e) => {
                $selected.template[selectedId] = { ... e.detail };
                console.log("AAAA" + JSON.stringify($selected.template[selectedId]))
                dispatch("change");
            }}
        />
    {/if}
</div>
