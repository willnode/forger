<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import jsyaml from "js-yaml";

    import type { Template } from "../../../types";

    export let template: Template;

    let yamlInput = "";

    onMount(() => {
        var input: Record<string, string> = {};
        if (Array.isArray(template.child)) {
            template.child.forEach((route) => {
                if (
                    typeof route != "string" &&
                    route.widget == "global.Navigation.Route"
                ) {
                    input[route.props.path] = route.props.component;
                }
            });
        }
        yamlInput = jsyaml.dump(input);
    });

    function onChange() {
        var input = jsyaml.load(yamlInput);
        if (input && typeof input == "object") {
            dispatch("change", {
                ...template,
                child: Object.entries(input).map(([path, component]) => ({
                    widget: "global.Navigation.Route",
                    props: {
                        path: JSON.stringify(path),
                        component,
                    },
                    child: [],
                })),
            });
        }
    }

    const dispatch = createEventDispatcher();
</script>

<textarea bind:value={yamlInput} on:input={onChange} />
