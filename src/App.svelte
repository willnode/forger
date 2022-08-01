<script lang="ts">
  import { onMount, setContext } from "svelte";

  import Repl from "../repl/src/Repl.svelte";
  import Container from "./app/Container.svelte";
  import { type AppContext, ProjectFilesDB, type Project } from "./types";
  import mainJs from "./assets/export/main.js?raw";
  import { writable, type Writable } from "svelte/store";

  const initProject: Project = {
    options: {
      schema: "1",
      name: "",
      packages: ["global", "bootstrap"],
      imports: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  const repl: Writable<Repl> = writable();

  const clipboard = writable(null);

  export const files_db = new ProjectFilesDB();

  setContext<AppContext>("APP", {
    project,
    clipboard,
    repl,
    files_db,
  });
</script>

<main>
  <Repl
    bind:this={$repl}
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
