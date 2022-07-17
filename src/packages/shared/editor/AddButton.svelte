<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();
</script>

<button on:click={() => dispatch("click", {})}> Add </button>
