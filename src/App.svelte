<script lang="ts">
  import { onMount } from "svelte";

  import Repl from "../repl/src/Repl.svelte";
  import { repl } from "./store";
  import Container from "./app/Container.svelte";
  import type { Component } from "./types";

  const defaultComponents: Component[] = [
    {
      name: "App",
      type: "svelte",
      source: "<h1>Hello</h1>",
      options: {
        freeId: 3,
      },
      template: {
        "1": {
          id: "1",
          widget: "global.Content.Div",
          props: {},
          items: [{ id: "2" }],
        },
        "2": {
          id: "2",
          widget: "",
          props: { text: "<h1>Hello</h1>" },
          items: [],
        },
      },
    },
  ];

  onMount(function () {
    let components = window.sessionStorage.project
      ? JSON.parse(window.sessionStorage.project)
      : defaultComponents;
    $repl.set({
      components,
    });
  });
</script>

<main>
  <Repl
    bind:this={$repl}
    workersUrl={import.meta.env.BASE_URL + "workers"}
    svelteUrl="https://unpkg.com/svelte@3"
    {Container}
  />
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
  }
</style>
