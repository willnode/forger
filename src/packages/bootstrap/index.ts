import type { Widget } from "../../types";
import DivEditor from "../global/editor/Div.svelte";
import { h } from "../shared/editor/utils";
import BaseEditor from "./editor/Init.svelte";
import InitTemplate from "./Init.svelte?raw";

const widgets: Record<string, Record<string, Widget>> = {
    Basic: {
        Init: {
            editor: BaseEditor,
            files: {
                'Init.svelte': InitTemplate
            },
        }
    },
    Content: {
        Card: {
            editor: DivEditor,
            name: 'div',
            defaultProps: {
                class: '"card"'
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
            editor: DivEditor,
            name: 'div',
            defaultProps: {
                class: '"container"'
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
