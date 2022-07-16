<script>
import { onMount } from "svelte";


  import Repl from "../repl/src/Repl.svelte";

  /**
   * @type {import("../repl/src/Repl.svelte").default}
   */
  let repl;

  onMount(function () {
    repl.set({
      components: [
        {
          name: "App",
          type: "svelte",
          source: "<h1>Hello</h1>",
        },
      ],
    });
  });
</script>

<main>
  <Repl
    bind:this={repl}
    workersUrl={"/workers"}
    svelteUrl="https://unpkg.com/svelte@3"
  />
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
  }
</style>
