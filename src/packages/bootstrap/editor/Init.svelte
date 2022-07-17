<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";

    export let template: Template;

    let version = "";

    onMount(() => {
        version = template.props.version || '';
    });

    function onChange() {
        dispatch("change", {
            ...template,
            props: {
                ...template.props,
                version
            }
        });
    }

    const dispatch = createEventDispatcher();
</script>

<input bind:value={version} on:input={onChange} />
