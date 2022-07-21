import type { Widget } from "../../types";
import { h } from "../shared/editor/utils";
import InitTemplate from "./Init.svelte?raw";

const sizes = ["xs", "sm", "md", "lg", "xl", "xxl"];
const colors = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

const s = (...s: string[]) => s.map(s => JSON.stringify(s));

const widgets: Record<string, Record<string, Widget>> = {
    Layout: {
        Container: {

            props: [{
                type: "prop-select",
                name: "size",
                options: ["", ...s("fluid", ...sizes)],
            }]
        },
        Row: {

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

            props: [{
                type: "select",
                name: "xs",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", ...s("auto")],
            }, {
                type: "select",
                name: "md",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", ...s("auto")],
            }, {
                type: "select",
                name: "lg",
                options: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", ...s("auto")],
            }]
        }
    },
    Content: {
        Figure: {
            props: [{
                type: "text",
                name: "caption",
            }],
            child: "single",
        },
        Image: {
            props: [{
                type: "prop-select",
                name: "size",
                options: ["", ...s("fluid", "thumbnail")],
            }, {
                type: "text",
                name: "alt",
                persistent: true,
            }, {
                type: "text",
                name: "src",
                persistent: true,
            },
            ],
            child: "none",
        },
        Icon: {
            props: [{
                type: "text",
                name: "name",
                persistent: true,
            }],
        },
        Table: {
            props: [{
                type: "select",
                name: "size",
                options: ["", ...s("sm", "md", "lg", "xl")],
            }, {
                type: "prop",
                name: "bordered",
            }, {
                type: "prop",
                name: "striped",
            }, {
                type: "prop",
                name: "hover",
            }, {
                type: "prop",
                name: "condensed",
            }],
        },
    },
    Component: {
        Card: {
            props: [{
                type: "prop",
                name: "body",
            }, {
                type: "prop",
                name: "inverse",
            }, {
                type: "select",
                name: "color",
                options: ["", ...s(...colors)],
            }, {
                type: "text",
                name: "class",
            }]
        },
        CardHeader: {},
        CardTitle: {},
        CardBody: {},
        CardSubtitle: {},
        CardText: {},
        CardFooter: {},
        ListGroup: {
            props: [{
                type: "prop",
                name: "flush",
            }, {
                type: "prop",
                name: "numbered",
            }, {
                type: "text",
                name: "class",
            }]
        },
        ListGroupItem: {
            props: [{
                type: "prop",
                name: "active",
            }, {
                type: "prop",
                name: "disabled",
            }, {
                type: "prop",
                name: "action",
            }, {
                type: "select",
                name: "tag",
                options: ["", "a", "button"],
            }, {
                type: "text",
                name: "href",
            }]
        },
    },
    Input: {
        Button: {
            props: [{
                type: "prop",
                name: "block",
            }, {
                type: "prop",
                name: "active",
            }, {
                type: "prop",
                name: "disabled",
            }, {
                type: "prop",
                name: "outline",
            }, {
                type: "prop-select",
                name: "size",
                options: ["", ...s("sm", "lg")],
            }, {
                type: "select",
                name: "color",
                options: ["", ...s(...colors)],
            }, {
                type: "text",
                name: "text",
            }],
        },
        Form: {
            props: []
        },
        FormGroup: {
            props: [{
                type: "prop",
                name: "valid",
            }, {
                type: "prop",
                name: "invalid",
            }, {
                type: "prop",
                name: "disabled",
            }, {
                type: "prop",
                name: "floating",
            }, {
                type: "text",
                name: "label",
            }]
        },
        
        FormText: {
            props: [{
                type: "textarea",
                name: "text",
            }],
        },
        Label: {},
        Input: {},
    },
    Indicator: {
        Badge: {
            props: [{
                type: "prop",
                name: "pill",
            }, {
                type: "select",
                name: "color",
                options: ["", ...s(...colors)],
            }, {
                type: "text",
                name: "href",
            }]
        },
        Progress: {
            props: [{
                type: "prop",
                name: "striped",
            }, {
                type: "prop",
                name: "animated",
            }, {
                type: "prop",
                name: "multi",
            }, {
                type: "prop",
                name: "bar",
            }, {
                type: "text",
                name: "value",
            }, {
                type: "text",
                name: "max",
            }, {
                type: "select",
                name: "color",
                options: ["", ...s(...colors)],
            }]
        },
        Spinner: {
            props: [{
                type: "select",
                name: "color",
                options: ["", ...s(...colors)],
            }, {
                type: "select",
                name: "size",
                options: ["", ...s(...sizes)],
            }, {
                type: "select",
                name: "type",
                options: ["", "circle", "grow"],
            }]
        },
        Toast: {},
        ToastHeader: {},
        ToastBody: {},
    },
    Navigation: {
        Nav: {},
        Navbar: {},
        Pagination: {},
        PaginationItem: {},
        PaginationLink: {},

    }
}

Object.keys(widgets).forEach(key => {
    Object.keys(widgets[key]).forEach(name => {
        widgets[key][name].imports = "!sveltestrap";
    })
})

export default widgets
