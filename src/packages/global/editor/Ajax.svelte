<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import AddButton from "../../shared/editor/AddButton.svelte";
    import ChildEditor from "../../shared/editor/ChildEditor.svelte";
    import Label from "../../shared/editor/Label.svelte";

    export let template: Template;
    export let collapsed = false;

    let url = "";
    let name = "";

    onMount(() => {
        url = template.props.url || "";
        name = template.props["let:data"] || "";
    });

    function onChange(e: CustomEvent<(string | Template)[]>) {
        dispatch("change", {
            ...template,
            child: e.detail,
        });
    }

    const dispatch = createEventDispatcher();
</script>

{#if !collapsed}
<Label label="Data URL">
    <input
        type="text"
        placeholder="URL"
        bind:value={url}
        on:input={(e) => {
            dispatch("change", {
                ...template,
                props: {
                    ...template.props,
                    url,
                },
            });
        }}
    />
    </Label>
{/if}

<Label label="Variable Name" {collapsed}>
    <input
        type="text"
        bind:value={name}
        on:input={(e) => {
            dispatch("change", {
                ...template,
                props: {
                    ...template.props,
                    "let:data": name,
                },
            });
        }}
    />
</Label>
{#if !collapsed}
    <ChildEditor
        children={template.child}
        on:change={onChange}
        multiple={false}
    />
{/if}
