<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";

    export let template: Template;

    let textInput = "";

    onMount(() => {
        console.log(template);
        if (template.child && template.child.length > 0 && typeof template.child[0] == 'string') {
            textInput = template.child[0];
        } else {
            textInput = '';
        }
    });

    function onChange() {
        dispatch("change", {
            ...template,
            child: [textInput]
        });
    }

    const dispatch = createEventDispatcher();
</script>

<textarea bind:value={textInput} on:input={onChange} />
