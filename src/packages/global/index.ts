import type { Widget } from "../../types";
import AjaxList from "./AjaxList.svelte?raw";
import AjaxDriver from "./helpers/ajax-driver.js?raw";
import AjaxGet from "./AjaxGet.svelte?raw";

const widgets: Record<string, Record<string, Widget>> = {
    Content: {
        Div: {
            name: 'div',
            props: ["class", "style"],
        },
        Img: {
            name: 'img',
            props: ["src", "alt", "width", "height"],
            child: "none",
            default: {
                props: {
                    src: '"https://via.placeholder.com/300x200"',
                    alt: ' ',
                    width: '"100%"',
                }
            }
        },
        Link: {
            name: 'a',
            props: ["href"],
            default: {
                props: {
                    href: '#',
                }
            }
        },
    },
    Data: {
        AjaxList: {
            props: ["url", "let:data"],
            child: "single",
            default: {
                props: {
                    url: '',
                    "let:data": "{item}",
                }
            },
            files: {
                "AjaxList.svelte": AjaxList,
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
        },
        AjaxGet: {
            props: ["url", "let:data"],
            child: "single",
            default: {
                props: {
                    url: '""',
                    "let:data": "data",
                },
            },
            files: {
                "AjaxGet.svelte": AjaxGet,
                "helpers/ajax-driver.js": AjaxDriver,
            },
        }
    },
    Navigation: {
        Router: {
            props: ["basepath"],
            imports: "!svelte-routing",
        },
        Route: {
            props: ["path", "component"],
            imports: "!svelte-routing",
        }
    }
}

export default widgets