<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import AddButton from "../../shared/editor/AddButton.svelte";
    import ChildEditor from "../../shared/editor/ChildEditor.svelte";

    export let template: Template;

    let url = "";

    onMount(() => {
        url = template.props.url || '""';
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
        url = e.currentTarget.value;
        dispatch("change", {
            ...template,
            props: {
                ...template.props,
                url,
            },
        });
    }}
/>
<ChildEditor children={template.child} on:change={onChange} multiple={false} />
