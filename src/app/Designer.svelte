<script>
    import { getContext } from "svelte";
    import { onMount } from "svelte";
    import { builtinPackages, findWidget, renderWidget } from "../widget";

    const { selected, handle_change } = getContext("REPL");

    let selectedTemplate, widget;

    void onMount(() => {
        if (!$selected.template) {
            $selected.template = {
                widget: "global.Basic.HTML",
                props: {},
                child: [$selected.source],
            };
        }
        selectedTemplate = $selected.template;
    });

    $: {
        if ($selected && $selected.template) {
            widget = findWidget($selected.template.widget, builtinPackages);
        }
    }

</script>

<div>
    {#if widget && widget.editor && selectedTemplate}
        <svelte:component
            this={widget.editor}
            on:change={(v) => {
                Object.assign(selectedTemplate, v.detail);
                handle_change({
                    detail: {
                        value: renderWidget($selected.template, {
                            addImport: () => {},
                            packages: builtinPackages,
                        }),
                    },
                });
            }}
            template={selectedTemplate}
        />
    {/if}
</div>
