<script lang="ts">
    export let multiple = true;
    export let children: (string | Template)[] = [];

    import { createEventDispatcher, getContext } from "svelte";
    import { builtinPackages, findWidget } from "../..";
    import type { Template, Component, ReplContext } from "../../../types";
    import widgets from "../../bootstrap";
    import AddButton from "./AddButton.svelte";
    import TemplateEditor from "./TemplateEditor.svelte";
    import WidgetSelector from "./WidgetSelector.svelte";
    const dispatch = createEventDispatcher();
</script>

{#if multiple}
    <AddButton
        on:click={(e) => {
            children.unshift("");
            dispatch("change", children);
        }}
    />
{/if}
{#each children as child, i}
    <button
        on:click={() => {
            children.splice(i, 1);
            dispatch("change", children);
        }}
    >
        Delete
    </button>
    <div>
        <TemplateEditor
            template={child}
            on:change={(e) => {
                children[i] = e.detail;
                dispatch("change", children);
            }}
        />
    </div>
{/each}
{#if multiple || children.length === 0}
    <AddButton
        on:click={(e) => {
            children.push("");
            dispatch("change", children);
        }}
    />
{/if}
