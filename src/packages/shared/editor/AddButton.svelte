<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();
</script>

<button on:click={() => dispatch("click", {})} title="Add item"> ➕ </button>
