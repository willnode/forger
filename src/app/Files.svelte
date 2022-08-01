<script type="ts">
    import Button from "carbon-components-svelte/src/Button/Button.svelte";
    import SideNavItems from "carbon-components-svelte/src/UIShell/SideNavItems.svelte";
    import SideNavLink from "carbon-components-svelte/src/UIShell/SideNavLink.svelte";
    import TextInput from "carbon-components-svelte/src/TextInput/TextInput.svelte";
    import mime from "mime";

    import Add from "carbon-icons-svelte/lib/Add.svelte";
    import TrashCan from "carbon-icons-svelte/lib/TrashCan.svelte";
    import { getContext, createEventDispatcher } from "svelte";
    import type { Component, ReplContext } from "../types";
    import { isBinary } from "../utils";

    const {
        components,
        selected,
        handle_select,
        request_focus,
        rebundle,
    }: ReplContext = getContext("REPL");
    const dispatch = createEventDispatcher();

    let editing: Component | null = null;

    function selectComponent(component: Component) {
        if ($selected !== component) {
            editing = null;
            handle_select(component);
            dispatch("selected");
        }
    }

    function editTab(component: Component) {
        if ($selected === component) {
            editing = $selected;
        }
    }

    function closeEdit() {
        const match = /(.+)\.(svelte|js|json|md)$/.exec($selected.name);
        $selected.name = match ? match[1] : $selected.name;
        if (isComponentNameUsed($selected)) {
            let i = 1;
            let name = $selected.name;
            do {
                $selected.name = `${name}_${i++}`;
            } while (isComponentNameUsed($selected));
        }
        if (match && match[2]) $selected.type = match[2];

        editing = null;

        // re-select, in case the type changed
        handle_select($selected);

        // components = components; // TODO necessary?

        // focus the editor, but wait a beat (so key events aren't misdirected)
        setTimeout(request_focus);

        rebundle('unlink', { ...$selected, name: oldName });
        rebundle('add', $selected);
    }

    function remove(component: Component) {
        let result = confirm(
            `Are you sure you want to delete ${component.name}.${component.type}?`
        );

        if (result) {
            const index = $components.indexOf(component);

            if (~index) {
                rebundle("unlink", $components[index]);
                components.set(
                    $components
                        .slice(0, index)
                        .concat($components.slice(index + 1))
                );
                dispatch("remove", { components: $components });
            } else {
                console.error(`Could not find component! That's... odd`);
            }

            handle_select(
                $components[index] || $components[$components.length - 1]
            );
        }
    }

    let oldName = '';

    function selectInput(event: any) {
        oldName = $selected.name;
        setTimeout(() => {
            event.target.select();
        });
    }

    let uid = 1;

    function addNew() {
        const component = {
            name: uid++ ? `Component${uid}` : "Component1",
            type: "svelte",
            source: "",
            modified: true,
            options: {
                freeId: 2,
            },
            template: {
                "1": {
                    id: "1",
                    widget: "global.Content.Div",
                    props: {},
                    items: [],
                },
            },
        };

        editing = component;

        setTimeout(() => {
            // TODO we can do this without IDs
            document.getElementById(component.name)?.scrollIntoView(false);
        });

        components.update((components) => components.concat(component));
        handle_select(component);
        rebundle("add", component);


        dispatch("add", { components: $components });
    }

    function importFile() {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.onchange = (event: any) => {
            const file: File = event.target.files[0];
            const reader = new FileReader();
            const filesplit = file.name.split(".");
            const ext = filesplit.pop();
            const name = filesplit.join(".");
            if (!ext) return;
            const mimeText = mime.getType(ext);
            if (!mimeText) return;

            reader.onload = (event) => {
                // @ts-ignore
                const data: ArrayBuffer = event.target.result;
                if (!data) return;
                const component: Component = {
                    name,
                    type: ext,
                    modified: false,
                    source: "",
                    options: {},
                    template: {},
                };
                if (isBinary(file.name)) {
                    var blob = new Blob([data], {
                        type: mimeText,
                    });
                    component.source =
                        `export default ` +
                        JSON.stringify(URL.createObjectURL(blob)) +
                        ";";
                    component.bytes = data;
                } else {
                    var str = new TextDecoder().decode(data);
                    component.source = str;
                }

                editing = component;

                components.update((components) => components.concat(component));
                handle_select(component);

                dispatch("add", { components: $components });
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    }

    function isComponentNameUsed(editing: Component) {
        return $components.find(
            (component) =>
                component !== editing && component.name === editing.name
        );
    }

    // drag and drop
    let from: string | null = null;
    let over: string | null = null;

    function dragStart(event: any) {
        from = event.currentTarget.id;
    }

    function dragLeave() {
        over = null;
    }

    function dragOver(event: any) {
        event.preventDefault();
        over = event.currentTarget.id;
    }

    function dragEnd(event: any) {
        event.preventDefault();

        if (from && over) {
            const from_index = $components.findIndex(
                (component) => component.name === from
            );
            const to_index = $components.findIndex(
                (component) => component.name === over
            );

            const from_component = $components[from_index];

            $components.splice(from_index, 1);
            components.set(
                $components
                    .slice(0, to_index)
                    .concat(from_component)
                    .concat($components.slice(to_index))
            );
        }
        from = over = null;
    }
</script>

<div class="component-selector">
    <SideNavItems>
        {#each $components as component, index}
            <div
                id={component.name}
                class="button"
                role="button"
                class:draggable={component !== editing && index !== 0}
                class:drag-over={over === component.name}
                on:click={() => selectComponent(component)}
                on:dblclick={(e) => e.stopPropagation()}
                draggable={component !== editing}
                on:dragstart={dragStart}
                on:dragover={dragOver}
                on:dragleave={dragLeave}
                on:drop={dragEnd}
            >
                <i class="drag-handle" />
                {#if component === editing}
                    <SideNavLink class="input-sizer">
                        <!-- svelte-ignore a11y-autofocus -->
                        <TextInput
                            light
                            autofocus
                            spellcheck={false}
                            size="sm"
                            bind:value={editing.name}
                            on:focus={selectInput}
                            on:blur={closeEdit}
                            on:keydown={(e) =>
                                editing !== null &&
                                e.which === 13 &&
                                !isComponentNameUsed(editing) &&
                                e.target?.blur()}
                            invalid={!!isComponentNameUsed(editing)}
                        />
                    </SideNavLink>
                {:else}
                    <SideNavLink
                        class="editable"
                        title="{component.name}.{component.type}"
                        on:click={() => editTab(component)}
                        isSelected={component === $selected}
                    >
                        <span style="max-width: 120px; overflow: hidden">
                            {#if component.modified}*{/if}{component.name}.{component.type}
                        </span>

                        <Button
                            style="margin-left: auto"
                            size="small"
                            icon={TrashCan}
                            on:click={() => remove(component)}
                        />
                    </SideNavLink>
                {/if}
            </div>
        {/each}

        <SideNavLink icon={Add} on:click={addNew} text="Add new component" />
        <SideNavLink icon={Add} on:click={importFile} text="Import file" />
    </SideNavItems>
</div>

<style>
    .component-selector {
        background-color: #fff;
        color: #525252;
        height: 100%;
    }
    :global(.bx--side-nav--ux) {
        cursor: pointer;
    }
    :global(.bx--side-nav__link-text) {
        display: flex;
        width: 100%;
        align-items: center;
    }
    :global(.bx--side-nav__link) {
        font-weight: 400;
    }
</style>
