<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
import ChildEditor from "../../shared/editor/ChildEditor.svelte";
    import Label from "../../shared/editor/Label.svelte";

    export let template: Template;
    export let collapsed = true;

    let className = "";
    let href = "";

    onMount(() => {
        className = template.props.class || "";
        href = template.props.href || "";
    });

    function onChange() {
        dispatch("change", {
            ...template,
            props: {
                ...template.props,
                class: className,
                href,
            },
        });
    }

    const dispatch = createEventDispatcher();
</script>

<Label label="Source" {collapsed}>
    <input bind:value={href} on:input={onChange} />
</Label>

{#if !collapsed}
    <Label label="Class">
        <input bind:value={className} on:input={onChange} />
    </Label>
{/if}


{#if !collapsed}
<ChildEditor children={template.child} on:change={onChange} />
{/if}
