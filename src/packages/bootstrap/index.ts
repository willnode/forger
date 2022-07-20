import type { Widget } from "../../types";
import { h } from "../shared/editor/utils";
import InitTemplate from "./Init.svelte?raw";

const widgets: Record<string, Record<string, Widget>> = {
    Layout: {
        Container: {
            imports: "!sveltestrap",
            props: [{
                type: "prop-select",
                name: "size",
                options: ["", '"fluid"', '"sm"', '"md"', '"lg"', '"xl"', '"xxl"'],
            }]
        },
        Row: {
            imports: "!sveltestrap",
            props: [{
                type: "prop",
                name: "noGutters",
            }, {
                type: "select",
                name: "cols",
                options: ["", "1", "2", "3", "4", "6", "12"],
            }]
        },
        Col: {
            imports: "!sveltestrap",
            props: [{
                type: "select",
                name: "xs",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "auto"],
            }, {
                type: "select",
                name: "md",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "auto"],
            }, {
                type: "select",
                name: "lg",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "auto"],
            }]
        }
    },
    Content: {
        Card: {
            imports: "!sveltestrap",
            props: [{
                type: "prop",
                name: "body",
            }, {
                type: "prop",
                name: "inverse",
            }, {
                type: "select",
                name: "color",
                options: ["", "primary", "secondary", "success", "danger", "warning", "info", "light", "dark"],
            }, {
                type: "text",
                name: "class",
            }]
        },
        CardBody: {
            imports: "!sveltestrap",

        }
    }
}

export default widgets
