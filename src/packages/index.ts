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

export function renderWidget(template: Template | string | (Template | string)[], context: RenderContext): string {
    if (typeof template == 'string') {
        return template
    }
    else if (Array.isArray(template)) {
        return template.map(t => renderWidget(t, context)).join('');
    }

    var childrenStr = renderWidget(template.child, context);
    var widget = findWidget(template.widget, context.packages);
    if (widget) {
        var varName = widget.name;
        if (widget.imports) {
            varName = context.addImport(varName, widget.imports);
        } else if (widget.files) {
            var path = `./packages/${widget.package}/${widget.name}.svelte`
            varName = context.addImport(varName, path);
        }
        return renderElement(varName, template.props, childrenStr, context);
    } else {
        return childrenStr;
    }
}
