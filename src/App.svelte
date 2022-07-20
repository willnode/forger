<script lang="ts">
  import { onMount, setContext } from "svelte";

  import Repl from "../repl/src/Repl.svelte";
  import { repl } from "./store";
  import Container from "./app/Container.svelte";
  import type { Component, Project } from "./types";
  import mainJs from "./assets/export/main.js?raw";
  import { writable } from "svelte/store";

  const initProject: Project = {
    options: {
      name: "My App",
      packages: ["global", "bootstrap"],
      imports: [],
    },
    files: [
      {
        name: "App",
        type: "svelte",
        source: "<h1>Hello</h1>",
        modified: false,
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
      {
        name: "main",
        type: "js",
        source: mainJs,
        modified: false,
        options: {},
        template: {},
      },
    ],
  };

  const project = writable(initProject);

  setContext("APP", {
    project,
  });

  onMount(function () {
    if (window.sessionStorage.project) {
      project.set(JSON.parse(window.sessionStorage.project));
    }
    $repl.set({
      components: $project.files,
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
