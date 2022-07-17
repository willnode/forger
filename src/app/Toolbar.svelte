<script>
import { createEventDispatcher } from "svelte";
export let designerMode = false;
	const dispatch = createEventDispatcher();
</script>
<div class="toolbar" style="margin-left: auto">
    <button on:click={() => dispatch('switch-designer')}> {designerMode ? '📏 Design' : '✏️ Editor'}</button>
    <button on:click={() => dispatch('save')}>💾 Save</button>
    <button on:click={() => dispatch('export')}>⬇️ Export</button>
</div>

<style>
    button {
        background: gainsboro;
        transition: all 0.2s;
        border: 1px solid gray;
        padding: 2px;
        cursor: pointer;
    }
    button:hover, button:focus, button:active {
        background: #ccc;
    }
</style>