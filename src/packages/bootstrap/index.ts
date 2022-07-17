import type { Widget } from "../../types";

import BaseEditor from "./editor/Init.svelte";
import InitTemplate from "./Init.svelte?raw";

const widgets : Record<string, Record<string, Widget>> = {
    Basic: {
        Init: {
            editor: BaseEditor,
            files: {
                'Init.svelte': InitTemplate
            },
        }
    },
}
export default widgets
