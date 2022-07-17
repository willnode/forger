<script lang="ts">
    import { getContext } from "svelte";
    import { onMount } from "svelte";
    import type { ReplContext } from "../types";
    import { builtinPackages, findWidget, renderWidget } from "../packages";
    import ChildEditor from "../packages/shared/editor/ChildEditor.svelte";
import { ucfirst } from "../packages/shared/editor/utils";
    // import prettier from "prettier";
    // import * as svelteParser from "prettier-plugin-svelte";
    // import tsParser from "prettier/parser-typescript";
    // import htmlParser from "prettier/parser-html";
    // import cssParser from "prettier/parser-postcss";

    const { selected, handle_change }: ReplContext = getContext("REPL");

    void onMount(() => {
        if (!$selected.template) {
            $selected.template = [$selected.source];
        }
    });

    var nameHash: Record<string, number> = {};
    var imports: Record<string, string> = {};

    function addImport(name: string, path: string) {
        if (!name) {
            var match = name.match(/([\w]+?)\.\w+$/);
            if (match) {
                name = ucfirst(match[1]);
            } else {
                name = "Component";
            }
        }
        var oriName = name;
        while (imports[name] && imports[name] !== path) {
            if (!nameHash[oriName]) {
                nameHash[oriName] = 1;
            } else {
                nameHash[oriName]++;
            }
            name = `${oriName}_${nameHash[name]}`;
        }
        if (!imports[name]) {
            imports[name] = path;
            return name;
        }
        return name;
    }

    function propagateChange(e: CustomEvent) {
        nameHash = {};
        imports = {};
        var html = renderWidget(e.detail, {
            addImport,
            packages: builtinPackages,
        });
        var headers = Object.entries(imports)
            .map(([name, path]) => {
                if (path.startsWith('!')) {
                    path = path.substring(1);
                    name = `{ ${name} }`
                }
                return `  import ${name} from ${JSON.stringify(path)}`;
            })
            .join("\n");
        if (headers) {
            html = `<script>\n${headers}\n<\/script>\n${html}`;
        }
        // html = prettier.format(html, {
        //     parser: "svelte",
        //     pluginSearchDirs: ["."],
        //     plugins: [tsParser, cssParser, htmlParser, svelteParser],
        //     svelteStrictMode: true,
        //     svelteBracketNewLine: false,
        //     svelteAllowShorthand: false,
        //     svelteIndentScriptAndStyle: false,
        // });
        handle_change({
            detail: {
                value: html,
                template: e.detail,
            },
        });
    }
</script>

<div style="margin-right: 2rem">
    {#if selected && $selected && $selected.template}
        <ChildEditor
            children={$selected.template}
            on:change={propagateChange}
        />
    {/if}
</div>
