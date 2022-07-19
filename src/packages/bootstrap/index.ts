import type { Widget } from "../../types";
import { h } from "../shared/editor/utils";
import InitTemplate from "./Init.svelte?raw";

const widgets: Record<string, Record<string, Widget>> = {
    Bootstrap: {
        Init: {
            child: "none",
            props: ["version"],
            default: {
                props: {
                    version: '"latest"',
                }
            },
            files: {
                'Init.svelte': InitTemplate
            },
        }
    },
    Content: {
        Card: {
            name: 'div',
            props: ["class"],
            default: {
                props: {
                    class: '"card"'
                }
            },
            presets: {
                CardGroup: h('bootstrap.Content.Card', { class: "card" },
                    h('global.Content.Img', {
                        src: 'https://via.placeholder.com/300x200',
                        alt: ' ',
                        width: '100%',
                        class: 'card-img-top',
                    }),
                    h('global.Content.Div', {
                        class: 'card-body',
                    }, h('global.Content.Div', {
                        class: 'card-title',
                    }, 'Card title'), h('global.Content.Div', {
                        class: 'card-text',
                    }, 'Some quick example text to build on the card title and make up the bulk of the card\'s content.')),
                    h('global.Content.Div', {
                        class: 'card-footer',
                    }, h('global.Content.Div', {
                        class: 'card-link',
                    }, 'Card link'), h('global.Content.Div', {
                        class: 'card-link',
                    }, 'Another link'))
                ),
            }
        }
    },
    Layout: {
        Container: {
            name: 'div',
            props: ["class"],
            default: {
                props: {
                    class: '"container"'
                }
            },
            presets: {
                ContainerAndRow: h('bootstrap.Layout.Container', {
                    class: 'container',
                },
                    h('global.Content.Div', {
                        class: 'row',
                    }, h('global.Content.Div', {
                        class: 'col-md-4',
                    }))),
            }
        }
    }
}

export default widgets
