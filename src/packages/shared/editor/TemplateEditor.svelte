<script lang="ts">
    export let template: Template | string;
    let widget: Widget | null;

    $: {
        if (typeof template !== "string" && template.widget) {
            widget = findWidget(template.widget, builtinPackages);
        }
    }
    const { components }: ReplContext = getContext("REPL");
    export let collapsed = false;

    import { createEventDispatcher, getContext } from "svelte";
    import { builtinPackages, findWidget } from "../..";
    import type { ReplContext, Template, Widget } from "../../../types";
    import { join } from "./utils";
    import WidgetSelector from "./WidgetSelector.svelte";
    import { createPopper } from "@popperjs/core";
    const dispatch = createEventDispatcher();
</script>

{#if widget && widget.presets && collapsed}
    <button
        on:click={(e) => {
            if (!widget || !widget.presets) return;
            var div = document.createElement("div");
            Object.entries(widget.presets).forEach(([name, preset]) => {
                var button = document.createElement("button");
                button.innerText = name;
                button.onclick = () => {
                    if (typeof template != "string") {
                        dispatch("change", {
                            ...JSON.parse(JSON.stringify(preset)),
                        });
                    }
                    div.remove();
                };
                div.append(button);
            });
            document.documentElement.append(div);
            createPopper(e.currentTarget, div, {
                placement: "bottom-start",
            });
        }}
        title="Open presets"
    >
        🌟
    </button>
{/if}
<WidgetSelector
    value={typeof template != "string" ? template.widget : ""}
    on:change={(e) => {
        if (e.detail) {
            const widget = findWidget(e.detail, builtinPackages);
            if (widget) {
                template = {
                    widget: e.detail,
                    props: { ...(widget.defaultProps || {}) },
                    child:
                        typeof template !== "string" &&
                        Array.isArray(template.child)
                            ? template.child
                            : [],
                };
            }
            // add to components
            if (widget && widget.files) {
                Object.entries(widget.files).forEach(([name, file]) => {
                    const [nameWithoutExt, ext] = name.split(".", 2);
                    var path = join(
                        `packages/${widget.package}/`,
                        nameWithoutExt
                    );
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
        {collapsed}
    />
{:else if typeof template === "string"}
    {#if collapsed}
        <input
            bind:value={template}
            on:input={(e) => {
                dispatch("change", e.currentTarget.value);
            }}
            title="HTML/Svelte code"
        />
    {:else}
        <textarea
            bind:value={template}
            rows={template.split("\n").length + 1}
            placeholder="Enter HTML/Svelte code"
            on:input={(e) => {
                dispatch("change", e.currentTarget.value);
            }}
        />
    {/if}
{/if}

<style>
    textarea {
        width: 100%;
        resize: vertical;
    }
    textarea,
    input {
        font-family: var(--font-mono);
    }
    button {
        flex: 0 !important;
    }
</style>
