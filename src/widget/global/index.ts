import type { Widget } from "../../types";
import HTMLEditor from "./editor/HTML.svelte";
import RouterEditor from "./editor/Router.svelte";

const widgets : Record<string, Record<string, Widget>> = {
    Basic: {
        HTML: {
            editor: HTMLEditor,
        }
    },
    Navigation: {
        Router: {
            editor: RouterEditor,
            imports: "Router!svelte-routing",
        },
        Route: {
            imports: "Route!svelte-routing",
        }
    }
}

export default widgets