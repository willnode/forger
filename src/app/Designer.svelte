<script lang="ts">
    import { getContext } from "svelte";
    import type { ReplContext } from "../types";
    import TemplateEditor from "./TemplateEditor.svelte";
    import { createEventDispatcher } from "svelte";
    import Message from "../../repl/src/Message.svelte";
    import TextArea from "carbon-components-svelte/src/TextArea/TextArea.svelte";

    export let selectedId: string = "";

    const { bundle, selected }: ReplContext = getContext("REPL");
    const dispatch = createEventDispatcher();
</script>

<div style="margin-right: 2rem">
    {#if selectedId == "1"}
        <p>./src/{$selected.name}.{$selected.type}</p>
        <TextArea
            labelText="Custom Script"
            value={$selected.options.script}
            on:input={(e) => {
                // @ts-ignore
                $selected.options.script = e.currentTarget.value;
                dispatch("change");
            }}
        />
        <TextArea
            labelText="Custom Style"
            value={$selected.options.style}
            on:input={(e) => {
                // @ts-ignore
                $selected.options.style = e.currentTarget.value;
                dispatch("change");
            }}
        />
    {:else if $selected.template[selectedId] != null}
        {#key selectedId}
            <div>#{selectedId}</div>
            <TemplateEditor
                template={$selected.template[selectedId]}
                on:change={(e) => {
                    $selected.template[selectedId] = { ...e.detail };
                    dispatch("change");
                }}
            />
        {/key}
    {/if}
</div>

<div class="info" style="margin-top: 2em;">
    {#if $bundle}
        {#if $bundle.error}
            <Message
                kind="error"
                details={$bundle.error}
                filename="{$selected.name}.{$selected.type}"
            />
        {:else if $bundle.warnings.length > 0}
            {#each $bundle.warnings as warning}
                <Message
                    kind="warning"
                    details={warning}
                    filename="{$selected.name}.{$selected.type}"
                />
            {/each}
        {/if}
    {/if}
</div>
