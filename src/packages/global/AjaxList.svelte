<script>
    import AjaxGet from "./AjaxGet.svelte";

    export let url;
</script>

<AjaxGet {url} let:data={data} >
    {#if Array.isArray(data) && data.length > 0}
    {#each data as item}
        <slot data={item} />
    {/each}
    {:else}
        <slot name="empty">
            <div>Data is empty</div>
        </slot>
    {/if}
</AjaxGet>