<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import ChildEditor from "../../shared/editor/ChildEditor.svelte";
import Label from "../../shared/editor/Label.svelte";

    export let template: Template;
    export let collapsed = true;

    let className = "";

    onMount(() => {
        className = template.props.class || "";
    });

    function onChange() {
        dispatch("change", {
            ...template,
            props: {
                ...template.props,
                class: className,
            },
        });
    }

    const dispatch = createEventDispatcher();

</script>

<Label label="Class" {collapsed}>
    <input bind:value={className} on:input={onChange} />
</Label>

{#if !collapsed}
<ChildEditor children={template.child} on:change={onChange} />
{/if}
