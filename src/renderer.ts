import type { RenderContext } from "./types";
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
        if (value.startsWith("@import(") && value.endsWith(")")) {
            value = context.addImport("", value.substring(8, value.length - 1));
        }
        if (value.startsWith('"') && value.endsWith('"'))
            return key + "=" + value;
        else if (value)
            return key + "={" + value + "}";
    });
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
    imports: any;
    components: any[];
}, filename: string) {
    console.log(data.imports);
    const files = data.components.map(x => ({
        name: `${filename}/src/${x.name}.${x.type}`,
        lastModified: new Date(),
        input: x.source,
    }));
    Object.entries(ExportFiles).forEach(([key, value]) => {
        files.push({
            name: `${filename}/${key}`,
            lastModified: new Date(),
            input: value,
        });
    });
    return files;
}

