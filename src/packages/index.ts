import { renderElement } from "../renderer";
import type { PackageList, RenderContext, Template, Widget } from "../types";
import bootstrap from "./bootstrap/index";
import global from "./global/index";

export const builtinPackages: PackageList = {
    bootstrap,
    global
}

export function findWidget(name: string, packageList: PackageList) {
    var split = name.split(".");
    if (split.length != 3)
        return null;
    var package_ = packageList[split[0]]?.[split[1]]?.[split[2]];
    if (package_) {
        return {
            id: name,
            package: split[0],
            category: split[1],
            name: split[2],
            ...package_
        }
    }
    return null;
}

export function renderWidget(template: Record<string, Template>, id: string, context: RenderContext): string {
    var node = template[id];
    if (!node) return '';
    var childrenStr = node.props.text || node.items.map(t => renderWidget(template, t.id, context)).join('');
    var widget = findWidget(node.widget, context.packages);
    if (widget) {
        var varName = widget.name;
        if (widget.imports) {
            varName = context.addImport(varName, widget.imports);
        } else if (widget.files) {
            var path = `./packages/${widget.package}/${widget.name}.svelte`
            varName = context.addImport(varName, path);
        }
        return renderElement(varName, node.props, node.props.custom || '', childrenStr, context);
    } else {
        return childrenStr;
    }
}
