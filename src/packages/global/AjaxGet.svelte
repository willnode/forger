<script>
    import { onMount, onDestroy } from "svelte";
    import { AjaxDriver } from "./helpers/ajax-driver.js";

    export let url;
    let driver;
    let stateStore, dataStore, urlStore;

    $: {
        if (driver && driver.old_url != url) {
            urlStore.set(url);
        }
    }

    let data = null;
    let state = "idle";
    let unsubs = [];

    onMount(() => {
        driver = new AjaxDriver(url);
        ({ url: urlStore, state: stateStore, data: dataStore } = driver);
        unsubs.push(dataStore.subscribe((x) => (data = x)));
        unsubs.push(stateStore.subscribe((x) => (state = x)));
        unsubs.push(() => driver.unsub());
    });

    onDestroy(() => {
        unsubs.forEach((x) => x());
    });
</script>

{#if stateStore}
    {#if $stateStore == "idle"}
        <slot name="idle">
            <div>Ready...</div>
        </slot>
    {:else if $stateStore == "loading"}
        <slot name="loading">
            <div>Loading...</div>
        </slot>
    {:else if $stateStore == "error"}
        <slot name="error">
            <div>Failed to get data (check console logs)</div>
        </slot>
    {:else if $stateStore == "loaded"}
        <slot {data} />
    {/if}
{/if}
