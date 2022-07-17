import type { Widget } from "../../types";
import HTMLEditor from "./editor/HTML.svelte";
import RouterEditor from "./editor/Router.svelte";
import AjaxEditor from "./editor/Ajax.svelte";
import AjaxList from "./AjaxList.svelte?raw";
import AjaxDriver from "./helpers/ajax-driver.js?raw";
import AjaxGet from "./AjaxGet.svelte?raw";

const widgets : Record<string, Record<string, Widget>> = {
    Basic: {
        div: {
            editor: HTMLEditor,
        }
    },
    Data: {
        AjaxList: {
            editor: AjaxEditor,
            files: {
                "AjaxList.svelte": AjaxList,
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
        },
        AjaxGet: {
            editor: AjaxEditor,
            files: {
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
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