<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { Template } from "../../../types";
    import ChildEditor from "../../shared/editor/ChildEditor.svelte";

    export let template: Template;

    function onChange(e:CustomEvent<(string|Template)[]>) {
        dispatch("change", {
            ...template,
            child: e.detail,
        });
    }

    const dispatch = createEventDispatcher();
</script>

<ChildEditor children={template.child} on:change={onChange} />
