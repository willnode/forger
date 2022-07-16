<script>
  import Repl from "../repl/src/Repl.svelte";
</script>

<main>
  <Repl workersUrl={'/workers'}/>
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
  }
</style>