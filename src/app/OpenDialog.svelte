<script lang="ts">
    import Button from "carbon-components-svelte/src/Button/Button.svelte";
    import ButtonSet from "carbon-components-svelte/src/Button/ButtonSet.svelte";

    import { liveQuery } from "dexie";
    import { getContext, createEventDispatcher } from "svelte";
    import type { AppContext } from "../types";

    const { files_db, project }: AppContext = getContext("APP");

    let projectList = liveQuery(() => files_db.project.toArray());

    let dispatch = createEventDispatcher();
</script>

<ButtonSet stacked>
    {#if $projectList}
        {#each $projectList as file}
            <Button
                on:click={() => dispatch("open", file.name)}
                kind={$project.options.name == file.name ? "primary" : "ghost"}
                >{file.name}</Button
            >
        {/each}
    {/if}
</ButtonSet>
