<script>
    import { createEventDispatcher } from "svelte";
    import {
        Button,
        ButtonSet,
        OverflowMenu,
        OverflowMenuItem,
    } from "carbon-components-svelte";
    import {
        Save,
        Ruler,
        Edit,
        Download,
        List,
        FileStorage,
    } from "carbon-icons-svelte";
    export let designerMode = false;
    export let showHierarchy = false;
    export let showFiles = false;
    const dispatch = createEventDispatcher();
</script>

<div id="toolbar">
    <ButtonSet>
        <Button
            size="small"
            kind="ghost"
            on:click={() => {
                designerMode = !designerMode
                dispatch("switchDesigner")
            }}
            icon={designerMode ? Ruler : Edit}
            tooltipPosition="bottom"
            tooltipAlignment="start"
            iconDescription={designerMode
                ? "Switch to editor"
                : "Switch to designer"}
        />

        <Button
            size="small"
            kind={showHierarchy ? "primary" : "ghost"}
            on:click={() => showHierarchy = !showHierarchy}
            tooltipPosition="bottom"
            tooltipAlignment="start"
            iconDescription={showHierarchy
                ? "Hide hierarchy"
                : "Show hierarchy"}
            icon={List}
        />
        <Button
            size="small"
            kind={showFiles ? "primary" : "ghost"}
            on:click={() => showFiles = !showFiles}
            icon={FileStorage}
            tooltipPosition="bottom"
            tooltipAlignment="start"
            iconDescription={showFiles ? "Hide project" : "Show project"}
        />
        <Button
            size="small"
            kind="ghost"
            on:click={() => dispatch("save")}
            icon={Save}
            tooltipAlignment="start"
            tooltipPosition="bottom"
            iconDescription="Save (to session storage)"
        />
        <OverflowMenu>
            <OverflowMenuItem text="To local storage" />
            <OverflowMenuItem text="To file (download)" />
        </OverflowMenu>
        <Button
            size="small"
            kind="ghost"
            on:click={() => dispatch("export")}
            icon={Download}
            tooltipAlignment="start"
            tooltipPosition="bottom"
            iconDescription="Export Svelte project (as ZIP)"
        />
        <OverflowMenu>
            <OverflowMenuItem text="To local storage" />
            <OverflowMenuItem text="To file (download)" />
        </OverflowMenu>
    </ButtonSet>
</div>

<style>
    #toolbar :global(.bx--btn) {
        width: auto;
    }
</style>
