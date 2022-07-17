<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import AddButton from "../../shared/editor/AddButton.svelte";
    import ChildEditor from "../../shared/editor/ChildEditor.svelte";

    export let template: Template;

    let url = "";
    let name = "";

    onMount(() => {
        url = template.props.url || '""';
        name = template.props.name || 'data';
    });

    function onChange(e: CustomEvent<(string | Template)[]>) {
        dispatch("change", {
            ...template,
            child: e.detail,
        });
    }

    const dispatch = createEventDispatcher();
</script>

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

<input
    type="text"
    placeholder="Name var"
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
<ChildEditor children={template.child} on:change={onChange} multiple={false} />
