<script lang="ts">
    export let template: Template;
    let widget: Widget | null;

    $: {
        if (template.widget) {
            widget = findWidget(template.widget, builtinPackages);
        } else {
            widget = null;
            if (template.props.text == null) {
                template.props.text = "";
            }
        }
    }
    const { components, selected }: ReplContext = getContext("REPL");

    import { createEventDispatcher, getContext } from "svelte";
    import { builtinPackages, findWidget } from "../packages";
    import type { Preset, ReplContext, Template, Widget } from "../types";
    import { join, ucfirst } from "../packages/shared/editor/utils";
    import WidgetSelector from "./WidgetSelector.svelte";
    import {
        OverflowMenu,
        OverflowMenuItem,
        TextArea,
        TextInput,
    } from "carbon-components-svelte";
    const dispatch = createEventDispatcher();

    function handleEditorChange() {
        dispatch("change", template);
    }

    function handlePresetSet(preset: Preset) {
        const addFunc = (p: Preset) => {
            const id = ($selected.options.freeId++).toString();
            $selected.template[id] = {
                id,
                widget: p.element,
                props: { ...p.props },
                items: p.children.map((x) => addFunc(x)),
            };
            return { id };
        };
        template.props = { ...preset.props };
        template.items = preset.children.map((x) => addFunc(x));
        console.log(template);
        handleEditorChange();
    }
</script>

{#if widget && widget.presets}
    <OverflowMenu label="Use presets">
        {#each Object.entries(widget.presets) as [name, preset]}
            <OverflowMenuItem
                on:click={() => {
                    handlePresetSet(preset);
                }}
            >
                {name}
            </OverflowMenuItem>
        {/each}
    </OverflowMenu>
{/if}
{#key template.id}
<WidgetSelector
    bind:value={template.widget}
    on:change={(e) => {
        if (e.detail) {
            const widget = findWidget(e.detail, builtinPackages);
            if (widget) {
                Object.assign(template, {
                    widget: e.detail,
                    props: { ...(widget.default?.props || {}) },
                });
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
                            template: {},
                            modified: true,
                            options: {
                                freeId: 1,
                            },
                        });
                    } else {
                        component.source = file;
                    }
                });
            }
        } else {
            widget = null;
        }
        handleEditorChange();
    }}
/>
{/key}

{#if widget}
    {#key template.id}
        {#if widget.props}
            <div class="props">
                {#each widget.props as prop}
                    <TextInput
                        value={template.props[prop]}
                        labelText={ucfirst(prop)}
                        on:input={(e) => {
                            template.props[prop] = e.detail + "";
                            console.log(prop + " :::: " + template.props[prop])
                            handleEditorChange();
                        }}
                    />
                {/each}
            </div>
        {:else if widget.editor}
            <svelte:component
                this={widget.editor}
                bind:template
                on:change={handleEditorChange}
                key={widget.name}
            />
        {/if}
    {/key}
{:else if template && template.widget == ""}
    <TextArea
        bind:value={template.props.text}
        rows={(template.props.text || "").split("\n").length + 1}
        placeholder="Enter HTML/Svelte code"
        on:input={handleEditorChange}
    />
{/if}
