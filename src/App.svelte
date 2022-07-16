<script>
  import Repl from "./repl/Repl.svelte";
  import bundler from "./repl/workers/bundler/index.js?worker&url";
  import compiler from "./repl/workers/compiler/index.js?worker&url";

  console.log(bundler);
</script>

<main>
  <Repl workersUrl={bundler} svelteUrl={compiler}/>
</main>
