import type { Widget } from "../../types";
import DivEditor from "./editor/Div.svelte";
import ImgEditor from "./editor/Img.svelte";
import LinkEditor from "./editor/Link.svelte";
import RouterEditor from "./editor/Router.svelte";
import AjaxEditor from "./editor/Ajax.svelte";
import AjaxList from "./AjaxList.svelte?raw";
import AjaxDriver from "./helpers/ajax-driver.js?raw";
import AjaxGet from "./AjaxGet.svelte?raw";

const widgets : Record<string, Record<string, Widget>> = {
    Content: {
        Div: {
            name: 'div',
            editor: DivEditor,
        },
        Img: {
            name: 'img',
            editor: ImgEditor,
            defaultProps: {
                src: '"https://via.placeholder.com/300x200"',
                alt: ' ',
                width: '"100%"',
            }
        },
        Link: {
            name: 'a',
            editor: LinkEditor,
            defaultProps: {
                href: '#',
            }
        },
    },
    Data: {
        AjaxList: {
            editor: AjaxEditor,
            defaultProps: {
                url: '""',
                "let:data": "item",
            },
            files: {
                "AjaxList.svelte": AjaxList,
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
        },
        AjaxGet: {
            editor: AjaxEditor,
            defaultProps: {
                url: '""',
                "let:data": "data",
            },
            files: {
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
        }
    },
    Navigation: {
        Router: {
            editor: RouterEditor,
            imports: "!svelte-routing",
        },
        Route: {
            imports: "!svelte-routing",
        }
    }
}

export default widgets