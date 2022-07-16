<script>
import { createEventDispatcher } from "svelte";
export let designerMode = false;
	const dispatch = createEventDispatcher();
</script>
<div class="toolbar" style="margin-left: auto">
    <button on:click={() => dispatch('switch-designer')}>{designerMode ? 'Design' : 'Editor'}</button>
    <button on:click={() => dispatch('save')}>Save</button>
</div>