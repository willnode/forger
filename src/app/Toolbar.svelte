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
        Folder,
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
                designerMode = !designerMode;
                dispatch("switchDesigner");
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
            on:click={() => (showHierarchy = !showHierarchy)}
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
            on:click={() => (showFiles = !showFiles)}
            icon={FileStorage}
            tooltipPosition="bottom"
            tooltipAlignment="start"
            iconDescription={showFiles ? "Hide project" : "Show project"}
        />
        <Button
            size="small"
            kind="ghost"
            on:click={() => dispatch("save", "storage")}
            icon={Save}
            tooltipAlignment="start"
            tooltipPosition="bottom"
            iconDescription="Save (in local storage)"
        />
        <OverflowMenu>
            <OverflowMenuItem
                text="Download project"
                on:click={() => dispatch("save", "download")}
            />
            <OverflowMenuItem
                text="Export as Svelte project (ZIP)"
                on:click={() => dispatch("save", "export")}
            />
        </OverflowMenu>
        <Button
            size="small"
            kind="ghost"
            on:click={() => dispatch("load", "storage")}
            icon={Folder}
            tooltipAlignment="start"
            tooltipPosition="bottom"
            iconDescription="Load from local storage"
        />
        <OverflowMenu width={500}>
            <OverflowMenuItem
                text="Open from file"
                on:click={() => dispatch("load", "file")}
            />
            <OverflowMenuItem
                text="Reload fresh new project"
                on:click={() => dispatch("load", "new")}
            />
        </OverflowMenu>
    </ButtonSet>
</div>

<style>
    #toolbar :global(.bx--btn) {
        width: auto;
    }
</style>
