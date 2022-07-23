import type { Component, RenderContext } from "./types";
import ExportFiles from "./assets/export";

const kebabize = (str: string) => {
    return str.split('').map((letter, idx) => {
        return letter.toUpperCase() === letter
            ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}`
            : letter;
    }).join('');
}

export function renderAttributes(attributes: Record<string, string>, context: RenderContext) {
    return Object.keys(attributes).map(function (key) {
        var value = attributes[key].trim();
        if (key === "text" || key === "custom" || value === "false" || value === "null" || value === "undefined") {
            return "";
        }
        if (value.startsWith("@import(") && value.endsWith(")")) {
            value = context.addImport("", value.substring(8, value.length - 1));
        }
        if (value == "true") {
            return key;
        } else if (value.startsWith('{') && value.endsWith('}')) {
            return key + "=" + value;
        } else if (value.startsWith('"') && value.endsWith('"')) {
            return key + "=" + value;
        } else if (/^-?[0-9]+$/.test(value)) {
            return `${key}={${value}}`;
        } else if (value)
            return `${key}="${value}"`;
    }).filter(x => x);
}

export function renderElement(element: string, attributes: Record<string, string>, customAttributes: string, children: string, context: RenderContext) {
    let attrs = [];
    if (attributes) {
        attrs.push(...renderAttributes(attributes, context))
    }
    if (customAttributes) {
        attrs.push(customAttributes);
    }
    if (attrs.length > 0) {
        attrs.unshift('')
    }
    if (!children) {
        return `<${element}${attrs.join(' ')}/>`;
    } else {
        return `<${element}${attrs.join(' ')}>${children}</${element}>`;
    }
}

export function renderStyle(style: Record<string, string>) {
    // return string
    return Object.keys(style).map(function (key) {
        return kebabize(key) + ": " + style[key];
    }).join(';');
}

export function setupProjectFiles(data: {
    imports: string[];
    components: Component[];
}, filename: string) {
    const files: any[] = [];

    data.components.forEach(x => {
        files.push({
            name: `${filename}/src/${x.name}.${x.type}`,
            lastModified: new Date(),
            input: x.source,
        });
        if (x.type === "svelte" && x.template["1"]) {
            files.push({
                name: `${filename}/src/${x.name}.template.json`,
                lastModified: new Date(),
                input: JSON.stringify({template: x.template, options: x.options}, null, 2),
            });
        }
    });
    Object.entries(ExportFiles).forEach(([key, value]) => {
        if (key === "package.json") {
            var json = JSON.parse(value);
            json.name = filename;
            json.dependencies = Object.assign(json.dependencies, data.imports.reduce((acc: Record<string, string>, x) => {
                acc[x] = "*";
                return acc;
            }, {}));
            value = JSON.stringify(json, null, 2);
        }
        files.push({
            name: `${filename}/${key}`,
            lastModified: new Date(),
            input: value,
        });
    });
    return files;
}

