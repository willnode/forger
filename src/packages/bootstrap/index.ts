import type { Widget } from "../../types";
import { h } from "../shared/editor/utils";

const sizes = ["xs", "sm", "md", "lg", "xl", "xxl"];
const colors = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

const widgets: Record<string, Record<string, Widget>> = {
    Layout: {
        Container: {

            props: [{
                type: "prop-select",
                name: "size",
                options: ["", "fluid", ...sizes],
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
            }],
            presets: {
                SampleAjaxCard: h("bootstrap.Layout.Row", { cols: "2" },
                    h("global.Data.AjaxList", { "let:data": "{item}", "url": "https://picsum.photos/v2/list" },
                        h("bootstrap.Layout.Col", {},
                            h("bootstrap.Component.Card", {},
                                h("bootstrap.Content.Image", { "src": "{item.download_url}/../../300/300", "alt": "{item.author}" }),
                                h("bootstrap.Component.CardBody", {},
                                    h("bootstrap.Component.CardTitle", { "text": "Image by {item.author}" }))))
                    )),
                FourColumns: h("bootstrap.Layout.Row", { cols: "4" },
                    h("bootstrap.Layout.Col", {}, h("", { text: "1" })),
                    h("bootstrap.Layout.Col", {}, h("", { text: "2" })),
                    h("bootstrap.Layout.Col", {}, h("", { text: "3" })),
                    h("bootstrap.Layout.Col", {}, h("", { text: "4" })),
                ),
            }
        },
        Col: {

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
        Figure: {
            props: [{
                type: "text",
                name: "caption",
            }],
            default: {
                props: {
                    caption: "Beautiful image",
                },
            },
            presets: {
                FluidImage: h("bootstrap.Content.Figure", {
                    caption: "Beautiful image",
                }, h("bootstrap.Content.Image", {
                    src: "https://picsum.photos/300/300",
                    alt: "Beautiful image",
                }))
            },
            child: "single",
        },
        Image: {
            props: [{
                type: "prop-select",
                name: "size",
                options: ["", "fluid", "thumbnail"],
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
                options: ["", "sm", "md", "lg", "xl"],
            }, {
                type: "prop-select-multi",
                name: "styling",
                options: ["bordered", "striped", "hover", "condensed", "dark"],
            }],
            presets: {
                SimpleTable: h("bootstrap.Content.Table", {},
                    h("", { text: `<thead><tr>\n${["#", "First Name", "Last Name", "Username"].map(x => `<th>${x}</th>`).join('\n')}\n</tr></thead>` }),
                    h("", { text: `<tbody><tr>\n${["#", "First Name", "Last Name", "Username"].map(x => `<td>${x}</td>`).join('\n')}\n</tr></tbody>` }),
                )
            }
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
                options: ["", ...colors],
            }, {
                type: "text",
                name: "class",
            }],
            presets: {
                SimpleCard: h("bootstrap.Component.Card", {
                    body: "true"
                }, h("bootstrap.Component.CardTitle", {
                    text: "Card title",
                }), h("bootstrap.Component.CardSubtitle", {
                    text: "Card subtitle",
                }), h("bootstrap.Component.Text", {
                    text: "Some quick example text to build on the card title and make up the bulk of the card's content.",
                }), h("bootstrap.Component.Button", {
                    text: "Go somewhere",
                })),
                ImageCard: h("bootstrap.Component.Card", {
                }, h("bootstrap.Content.Image", {
                    src: "https://picsum.photos/300/300",
                    alt: "Beautiful image",
                }), h("bootstrap.Component.CardBody", {}, h("bootstrap.Component.CardTitle", {
                    text: "Card title",
                }), h("", {
                    text: "Some quick example text to build on the card title and make up the bulk of the card's content.",
                }))),
            }
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
                type: "select",
                name: "size",
                options: ["", "sm", "lg"],
            }, {
                type: "select",
                name: "color",
                options: ["", ...colors],
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
                options: ["", ...colors],
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
                options: ["", ...colors],
            }]
        },
        Spinner: {
            props: [{
                type: "select",
                name: "color",
                options: ["", ...colors],
            }, {
                type: "select",
                name: "size",
                options: ["", ...sizes],
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
