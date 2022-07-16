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
}

export function renderWidget(template: Template|string, context: RenderContext):string {
    if (typeof template == 'string') {
        return template
    }
    if (template.widget == 'global.Basic.HTML') {
        return template.child && template.child.length > 0 ? template.child[0].toString() : '';
    }
    var widgetInstance = findWidget(template.widget, context.packages);
    if (widgetInstance) {
        var varName = widgetInstance.name;
        var childrenStr = '';
        if (widgetInstance.imports) {
            varName = context.addImport(varName, widgetInstance.imports);
        } else if (widgetInstance.render) {
            var path = `./components/${widgetInstance.package}/${widgetInstance.name}.svelte`
            varName = context.addImport(varName, path, widgetInstance.render);
        }
        if (Array.isArray(template.child)) {
            childrenStr = template.child.map(x => renderWidget(x, context)).join('');
        } else if (typeof template.child == 'string') {
            childrenStr = template.child;
        }
        return renderElement(varName, template.props, childrenStr, context);
    } else if (typeof template.child == 'string') {
        return template.child
    } else {
        return '';
    }
}
