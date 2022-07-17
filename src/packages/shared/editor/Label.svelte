<script>
    export let label;
    export let collapsed = false;
</script>

{#if collapsed}
    <slot />
{:else}
    <div class="row">
        <span class="label">{label}</span>
        <span class="control">
            <slot />
        </span>
    </div>
{/if}

<style>
    .row {
        display: flex;
        align-items: center;
    }
    .label {
        display: inline-block;
        width: 100px;
        margin-right: 0.3rem;
        margin-top: 0.3rem;
    }
    .control {
        flex: 1;
        display: inline-flex;
        flex-direction: column;
    }
</style>
