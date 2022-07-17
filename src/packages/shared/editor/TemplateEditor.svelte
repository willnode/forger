<script lang="ts">
    export let template: Template | string;
    let widget: Widget | null;

    $: {
        if (typeof template !== "string" && template.widget) {
            widget = findWidget(template.widget, builtinPackages);
        }
    }
    const { components }: ReplContext = getContext("REPL");

    import { createEventDispatcher, getContext } from "svelte";
    import { builtinPackages, findWidget } from "../..";
    import type { ReplContext, Template, Widget } from "../../../types";
import { join } from "./utils";
    import WidgetSelector from "./WidgetSelector.svelte";
    const dispatch = createEventDispatcher();
</script>

<WidgetSelector
    value={typeof template != "string" ? template.widget : ""}
    on:change={(e) => {
        if (e.detail) {
            template = {
                widget: e.detail,
                props: {},
                child: typeof template !== 'string' && Array.isArray(template.child) ? template.child : [],
            };
            // add to components
            const widget = findWidget(e.detail, builtinPackages);
            if (widget && widget.files) {
                Object.entries(widget.files).forEach(([name, file]) => {
                    const [nameWithoutExt, ext] = name.split(".", 2);
                    var path = join(`packages/${widget.package}/`, nameWithoutExt);
                    const component = $components.find(
                        (c) => c.name === path && c.type === ext
                    );
                    if (!component) {
                        $components.push({
                            name: path,
                            type: ext,
                            source: file,
                            template: [],
                        });
                    } else {
                        component.source = file;
                    }
                });
            }
        } else {
            template = "";
            widget = null;
        }
        dispatch("change", template);
    }}
/>
{#if widget && widget.editor}
    <svelte:component
        this={widget.editor}
        {template}
        on:change={(e) => dispatch("change", e.detail)}
    />
{:else if typeof template === "string"}
    <textarea
        bind:value={template}
        on:input={(e) => {
            dispatch("change", e.currentTarget.value);
        }}
    />
{/if}
