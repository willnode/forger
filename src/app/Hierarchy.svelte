<script lang="ts">
    import { createEventDispatcher, getContext } from "svelte";
    import type { ReplContext, Template } from "../types";
    import { ucfirst } from "../packages/shared/editor/utils";
    import HierarchyDir from "./HierarchyDir.svelte";
    const dispatch = createEventDispatcher();

    export let selectedId: string;

    const { selected }: ReplContext = getContext("REPL");

    var nameHash: Record<string, number> = {};
    var imports: Record<string, string> = {};
</script>

<div style="margin-right: 2rem">
    {#if selected && $selected && $selected.template}
        <HierarchyDir
            on:change={() => dispatch("change")}
            node={$selected.template["1"]}
            bind:selectedId
        />
    {/if}
</div>
