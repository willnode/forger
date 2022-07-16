import type { Widget } from "../../types";

import BaseEditor from "./editor/Base.svelte";
import BaseTemplate from "./Base.svelte?raw";

const widgets : Record<string, Record<string, Widget>> = {
    Basic: {
        Base: {
            editor: BaseEditor,
            render: BaseTemplate,
        }
    },
}
export default widgets
