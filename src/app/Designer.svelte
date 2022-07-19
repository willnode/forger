<script lang="ts">
    import { getContext } from "svelte";
    import type { ReplContext } from "../types";
    import TemplateEditor from "./TemplateEditor.svelte";
    import { createEventDispatcher } from "svelte";
import Message from "../../repl/src/Message.svelte";

    export let selectedId: string = "";

    const { bundle, selected }: ReplContext = getContext("REPL");
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

<div class="info" style="margin-top: 2em;">
    {#if $bundle}
        {#if $bundle.error}
            <Message kind="error" details={$bundle.error} filename="{$selected.name}.{$selected.type}"/>
        {:else if $bundle.warnings.length > 0}
            {#each $bundle.warnings as warning}
                <Message kind="warning" details={warning} filename="{$selected.name}.{$selected.type}"/>
            {/each}
        {/if}
    {/if}
</div>
