<script lang="ts">
    import { flip } from "svelte/animate";
    import Button from "carbon-components-svelte/src/Button/Button.svelte";
    import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID } from "svelte-dnd-action";
    import type {
        AppContext,
        Preset,
        ReplContext,
        Template,
        Widget,
    } from "../types";
    import { createEventDispatcher, getContext } from "svelte";
    import Add from "carbon-icons-svelte/lib/Add.svelte";
    import ChevronDown from "carbon-icons-svelte/lib/ChevronDown.svelte";
    import ChevronRight from "carbon-icons-svelte/lib/ChevronRight.svelte";
    import Copy from "carbon-icons-svelte/lib/Copy.svelte";
    import Paste from "carbon-icons-svelte/lib/Paste.svelte";
    import TrashCan from "carbon-icons-svelte/lib/TrashCan.svelte";
    import { builtinPackages, findWidget } from "../packages";
    const dispatch = createEventDispatcher();

    const { selected }: ReplContext = getContext("REPL");

    const { clipboard }: AppContext = getContext("APP");

    export let node: Template;
    export let selectedId: string;
    let widget = findWidget("", builtinPackages);
    let expanded = true;
    $: {
        widget = node && findWidget(node.widget, builtinPackages);
    }
    const flipDurationMs = 300;
    function handleDndConsider(e: any) {
        node.items = e.detail.items;
        dispatch("change");
    }
    function handleDndFinalize(e: any) {
        node.items = e.detail.items;
        dispatch("change");
    }
    function handleClick(e: any) {
        if (selectedId !== node.id) {
            selectedId = node.id;
        } else {
            expanded = !expanded;
        }
    }
    function handleAdd() {
        if (!$selected.options.freeId) {
            $selected.options.freeId = 0;
        }
        const id = ($selected.options.freeId++).toString();
        $selected.modified = true;
        $selected.template[id] = {
            id,
            widget: "",
            props: { text: "" },
            items: [],
        };
        node.items.push({ id });
        dispatch("change");
    }
    function handleCopy() {
        const saveFunc = (t: Template) => {
            var p: Preset = {
                element: t.widget,
                props: t.props,
                children: t.items.map((x) =>
                    saveFunc($selected.template[x.id])
                ),
            };
            return p;
        };
        clipboard.set(saveFunc($selected.template[selectedId]));
    }
    function handlePaste(e: any) {
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
            return { id };
        };
        if (!$clipboard || !$selected.template[selectedId]) return;
        $selected.template[selectedId].items.push(addFunc($clipboard));
        if (!e.shiftKey) {
            clipboard.set(null);
        }
        dispatch("change");
    }
    function handleDelete() {
        if (node.id == "1") {
            alert("Cannot delete root node");
            return;
        }
        const subDelete = (id: string) => {
            const item = $selected.template[id];
            if (item.items.length > 0) {
                item.items.forEach(({ id }) => subDelete(id));
            }
            delete $selected.template[id];
        };
        subDelete(node.id);
        dispatch("delete", node.id);
    }
    function handleDeleteChild(e: CustomEvent<string>) {
        node.items = node.items.filter((item) => item.id !== e.detail);
        dispatch("change");
    }
</script>

{#if node}
    <div class="child">
        <Button
            kind={selectedId == node.id ? "primary" : "ghost"}
            size="small"
            as
            let:props
        >
            <div class:btn={true} {...props} on:click={handleClick}>
                <div class="icon">
                    {#if expanded}
                        <ChevronDown />
                    {:else}
                        <ChevronRight />
                    {/if}
                </div>
                <div class="text">
                    {(widget && widget.name) || "Text"}
                </div>
            </div>
        </Button>
        {#if selectedId == node.id}
            <Button kind={"ghost"} size="small" as let:props>
                <div class:del={true} {...props} on:click={handleCopy}>
                    <Copy />
                </div>
            </Button>
        {:else}
            <Button kind={"danger-ghost"} size="small" as let:props>
                <div class:del={true} {...props} on:click={handleDelete}>
                    <TrashCan />
                </div>
            </Button>
        {/if}
    </div>

    {#if expanded}
        <section
            use:dndzone={{
                items: node.items,
                flipDurationMs,
            }}
            on:consider={handleDndConsider}
            on:finalize={handleDndFinalize}
        >
            {#each node.items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID) as item (item.id)}
                <div animate:flip={{ duration: flipDurationMs }} class="item">
                    <svelte:self
                        node={$selected.template[item.id]}
                        bind:selectedId
                        on:delete={handleDeleteChild}
                    />
                </div>
            {/each}
        </section>
        {#if selectedId == node.id && widget && (widget?.child == null || (widget?.child == "single" && node.items.length < 1))}
            <Button
                on:click={handleAdd}
                kind="secondary"
                size="small"
                icon={Add}
                iconDescription="Add child"
                tooltipPosition="bottom"
            />
            {#if $clipboard}
                <Button
                    on:click={handlePaste}
                    kind="primary"
                    size="small"
                    icon={Paste}
                    iconDescription="Paste to child"
                    tooltipPosition="bottom"
                />
            {/if}
        {/if}
    {/if}
{/if}

<style>
    section {
        width: auto;
        border: 0px solid black;
        padding-left: 0.4em;
        /* this will allow the dragged element to scroll the list */
        overflow-y: auto;
        height: auto;
    }
    .child {
        display: flex;
    }
    .btn {
        flex: 1;
        overflow: hidden;
        max-width: initial;
    }
    .del {
        flex: 0;
        padding: 5px;
    }
    .icon {
        flex: 0;
        margin-right: 10px;
    }
    .text {
        flex: 1;
        text-align: left;
    }
</style>
