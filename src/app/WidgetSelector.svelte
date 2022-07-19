<script>
    import { builtinPackages } from "../packages";
    export let value = "";
    import { createEventDispatcher } from "svelte";
    import { ucfirst } from "../packages/shared/editor/utils";
    import {
        Select,
        SelectItem,
        SelectItemGroup,
    } from "carbon-components-svelte";
    const dispatch = createEventDispatcher();
</script>

<Select
    label="Widget type"
    bind:selected={value}
    on:change={(e) => {
        dispatch("change", e.detail);
    }}
>
    <SelectItem value="" text="Text" />
    {#each Object.entries(builtinPackages) as [package_, i]}
        <SelectItemGroup label={ucfirst(package_)} />
        {#each Object.entries(i) as [category, j]}
            {#each Object.entries(j) as [name, k]}
                {#if k.editor || k.props}
                    <SelectItem
                        value="{package_}.{category}.{name}"
                        text="{category} - {name}"
                    />
                {/if}
            {/each}
        {/each}
    {/each}
</Select>
