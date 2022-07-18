<script lang="ts">
    export let multiple = true;
    export let children: (string | Template)[] = [];

    import { createEventDispatcher, getContext } from "svelte";
    import { builtinPackages, findWidget } from "../..";
    import type { Template, Component, ReplContext } from "../../../types";
    import widgets from "../../bootstrap";
    import Ajax from "../../global/editor/Ajax.svelte";
    import AddButton from "./AddButton.svelte";
    import TemplateEditor from "./TemplateEditor.svelte";
    import WidgetSelector from "./WidgetSelector.svelte";
    const dispatch = createEventDispatcher();
    let collapseData: boolean[] = [];
</script>

<div class="card">
    {#each children as child, i}
        <div class="card-item">
            <button
                on:click={() => {
                    children.splice(i, 1);
                    dispatch("change", [...children]);
                }}
                title="Delete this item"
            >
                ➖
            </button>
            <div
                class="card-main"
                class:collapse={i >= collapseData.length || collapseData[i]}
            >
                <TemplateEditor
                    template={child}
                    collapsed={i >= collapseData.length || collapseData[i]}
                    on:change={(e) => {
                        children[i] = e.detail;
                        dispatch("change", children);
                    }}
                />
            </div>
            <div>
                <button
                    on:click={() => {
                        while (i >= collapseData.length) {
                            collapseData.push(true);
                        }
                        collapseData[i] = !collapseData[i];
                        collapseData = [...collapseData];
                    }}
                    title="Delete this item"
                >
                    {i >= collapseData.length || collapseData[i] ? "▼" : "▶"}
                </button>
            </div>
        </div>
    {/each}
    {#if multiple || children.length === 0}
        <AddButton
            on:click={(e) => {
                children.push("Text here");
                collapseData.push(false);
                dispatch("change", [...children]);
            }}
        />
    {/if}
</div>

<style>
    .card {
        margin: 0.3rem;
        margin-right: -1rem;
        padding: 0.2rem;
        border: 1px solid #cccc;
    }

    .card-item {
        display: flex;
        align-items: flex-start;
    }

    .card-main {
        flex: 1;
        min-width: 0;
        margin-left: 0.3em;
        display: flex;
        flex-direction: column;
    }

    .card-main.collapse {
        overflow: hidden;
        flex-direction: row;
    }

    .card-main.collapse > :global(*) {
        flex: 1;
    }
</style>
