import { writable, type Writable } from "svelte/store";
import type Repl from "../repl/src/Repl.svelte";

export let repl: Writable<Repl> = writable();
