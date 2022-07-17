<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import Label from "../../shared/editor/Label.svelte";

    export let template: Template;
    export let collapsed = true;

    let className = "";
    let width = "";
    let height = "";
    let src = "";

    onMount(() => {
        className = template.props.class || "";
        width = template.props.class || "";
        height = template.props.class || "";
        src = template.props.class || "";
    });

    function onChange() {
        dispatch("change", {
            ...template,
            props: {
                ...template.props,
                class: className,
                width,
                height,
                src,
            },
        });
    }

    const dispatch = createEventDispatcher();
</script>

<Label label="Source" {collapsed}>
    <input bind:value={src} on:input={onChange} />
</Label>

{#if !collapsed}
    <Label label="Class">
        <input bind:value={className} on:input={onChange} />
    </Label>

    <Label label="Size">
        <input bind:value={width} on:input={onChange} />
        <input bind:value={height} on:input={onChange} />
    </Label>
{/if}
