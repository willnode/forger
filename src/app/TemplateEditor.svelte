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
    import type {
        Preset,
        ReplContext,
        Template,
        Widget,
        WidgetProp,
    } from "../types";
    import { join, ucfirst } from "../packages/shared/editor/utils";
    import WidgetSelector from "./WidgetSelector.svelte";
    import Checkbox from "carbon-components-svelte/src/Checkbox/Checkbox.svelte";
    import MultiSelect from "carbon-components-svelte/src/MultiSelect/MultiSelect.svelte";
    import OverflowMenu from "carbon-components-svelte/src/OverflowMenu/OverflowMenu.svelte";
    import OverflowMenuItem from "carbon-components-svelte/src/OverflowMenu/OverflowMenuItem.svelte";
    import Select from "carbon-components-svelte/src/Select/Select.svelte";
    import SelectItem from "carbon-components-svelte/src/Select/SelectItem.svelte";
    import TextArea from "carbon-components-svelte/src/TextArea/TextArea.svelte";
    import TextInput from "carbon-components-svelte/src/TextInput/TextInput.svelte";

    const dispatch = createEventDispatcher();

    function handleEditorChange() {
        dispatch("change", template);
    }

    function handlePresetSet(preset: Preset) {
        const addFunc = (p: Preset) => {
            if (!$selected.options.freeId) {
                $selected.options.freeId = 0;
            }
            const id = ($selected.options.freeId++).toString();
            $selected.template[id] = {
                id,
                widget: p.element,
                props: { ...p.props },
                items: p.children.map((x) => addFunc(x)),
            };
            const widget = findWidget(p.element, builtinPackages);
            if (widget) {
                handleAddFile(widget);
            }
            return { id };
        };
        template.props = { ...preset.props };
        template.items = preset.children.map((x) => addFunc(x));
        handleEditorChange();
    }

    function handlePropChange(prop: WidgetProp | string, val: any) {
        if (typeof prop === "string") {
            template.props[prop] = val;
        } else {
            if (
                (prop.type == "prop-select" ||
                    prop.type == "prop-select-multi") &&
                prop.options
            ) {
                var vals =
                    prop.type == "prop-select-multi"
                        ? (val + "").split(" ")
                        : [val];
                for (const option of prop.options) {
                    if (vals.includes(option)) {
                        template.props[option] = "true";
                    } else {
                        delete template.props[option];
                    }
                }
            } else {
                if (val || prop.persistent)
                    template.props[prop.name] = val + "";
                else delete template.props[prop.name];
            }
        }
        handleEditorChange();
    }

    function handleAddFile(widget: Widget & { package: string }) {
        // add to components
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
                    handleAddFile(widget);
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
                    {#if typeof prop === "string"}
                        <TextInput
                            value={template.props[prop]}
                            labelText={ucfirst(prop)}
                            on:input={(e) => {
                                handlePropChange(prop, e.detail);
                            }}
                        />
                    {:else if prop.type == "text"}
                        <TextInput
                            value={template.props[prop.name]}
                            labelText={prop.label || ucfirst(prop.name)}
                            on:input={(e) => handlePropChange(prop, e.detail)}
                        />
                    {:else if prop.type == "textarea"}
                        <TextArea
                            value={template.props[prop.name]}
                            labelText={prop.label || ucfirst(prop.name)}
                            on:input={(e) =>
                                // @ts-ignore
                                handlePropChange(prop, e.currentTarget.value)}
                        />
                    {:else if prop.type == "prop"}
                        <Checkbox
                            checked={!!template.props[prop.name]}
                            labelText={prop.label || ucfirst(prop.name)}
                            on:check={(e) =>
                                // @ts-ignore
                                handlePropChange(prop, e.detail)}
                        />
                    {:else if (prop.type == "select" || prop.type == "prop-select") && prop.options}
                        <Select
                            selected={template.props[prop.name]}
                            labelText={prop.label || ucfirst(prop.name)}
                            on:change={(e) =>
                                // @ts-ignore
                                handlePropChange(prop, e.detail)}
                        >
                            {#each prop.options as option}
                                <SelectItem
                                    value={option}
                                    text={ucfirst(option)}
                                />
                            {/each}
                        </Select>
                    {:else if prop.type == "prop-select-multi" && prop.options}
                        <MultiSelect
                            selectedIds={(template.props[prop.name] || "")
                                .split(" ")
                                .map((x) => ({ id: x }))}
                            titleText={prop.label || ucfirst(prop.name)}
                            label="Select multiple items..."
                            items={prop.options.map((x) => ({
                                id: x,
                                text: ucfirst(x),
                            }))}
                            on:select={(e) =>
                                // @ts-ignore
                                handlePropChange(
                                    prop,
                                    e.detail.selectedIds
                                        .map((x) => x.id)
                                        .join(" ")
                                )}
                        />
                    {/if}
                {/each}
            </div>
        {:else if widget.editor}
            <svelte:component
                this={widget.editor}
                bind:template
                on:change={handleEditorChange}
                key={widget.name}
            />
        {:else}
            <div style="margin: 1em 0;">This is a hidden component.</div>
        {/if}
        <!-- custom -->
        <hr style="border: 1px solid darkgrey;" />
        <TextInput
            value={template.props.text}
            labelText={"Text Content"}
            on:input={(e) =>
                // @ts-ignore
                handlePropChange("text", e.detail)}
        />
        <TextArea
            value={template.props.custom}
            labelText={"Custom Attributes"}
            on:input={(e) =>
                // @ts-ignore
                handlePropChange("custom", e.currentTarget.value)}
        />
    {/key}
{:else if template && template.widget == ""}
    <TextArea
        bind:value={template.props.text}
        rows={(template.props.text || "").split("\n").length + 1}
        placeholder="Enter HTML/Svelte code"
        on:input={handleEditorChange}
    />
{/if}
