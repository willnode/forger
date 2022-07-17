<script>
    import { builtinPackages } from "../..";
    export let value = "";
    import { createEventDispatcher } from "svelte";
import { ucfirst } from "./utils";
    const dispatch = createEventDispatcher();
</script>

<select
    bind:value
    on:change={(e) => {
        dispatch("change", e.currentTarget.value);
    }}
>
<option value="">Text</option>
    {#each Object.entries(builtinPackages) as [package_, i]}
        <optgroup label={ucfirst(package_)} />
        {#each Object.entries(i) as [category, j]}
            {#each Object.entries(j) as [name, k]}
                {#if k.editor}
                    <option value="{package_}.{category}.{name}"
                        >&nbsp;&nbsp;{category} - {name}
                    </option>
                {/if}
            {/each}
        {/each}
    {/each}
</select>
