// Joins path segments.  Preserves initial "/" and resolves ".." and "."
// Does not support using ".." to go above/outside the root.

import type { Preset, Template } from "../../../types";

// This means that join("foo", "../../bar") will not resolve to "../bar"
export function join(...paths: string[]) {
  // Split the inputs into a list of path commands.
  var parts: string[] = [];
  for (var i = 0, l = paths.length; i < l; i++) {
    parts = parts.concat(paths[i].split("/"));
  }
  // Interpret the path commands to get the new resolved path.
  var newParts = [];
  for (i = 0, l = parts.length; i < l; i++) {
    var part = parts[i];
    // Remove leading and trailing slashes
    // Also remove "." segments
    if (!part || part === ".") continue;
    // Interpret ".." to pop the last segment
    if (part === "..") newParts.pop();
    // Push new path segments.
    else newParts.push(part);
  }
  // Preserve the initial slash if there was one.
  if (parts[0] === "") newParts.unshift("");
  // Turn back into a single string path.
  return newParts.join("/") || (newParts.length ? "/" : ".");
}

// A simple function to get the dirname of a path
// Trailing slashes are ignored. Leading slash is preserved.
export function dirname(path: string) {
  return join(path, "..");
}

export function ucfirst(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function divDisplayName(props: Record<string, string>) {
  var name = ""
  if (props.class && props.class.startsWith('"') && props.class.endsWith('"')) {
    name += "." + props.class.substring(1, props.class.length - 1).replace(/\s+/g, ".")
  }
  if (props.id && props.id.startsWith('"') && props.id.endsWith('"')) {
    name += "#" + props.id.substring(1, props.id.length - 1)
  }
  return name;
}

export function h(element: string, props: Record<string, string>, ...children: (string | Preset)[]): Preset {
  // set all text to proper children
  return {
    element, props, children: children.map((child: (string | Preset)) => {
      if (typeof child === "string") {
        return {
          children: [],
          element: "",
          props: {
            text: child,
          },
        };
      } else {
        return child;
      }
    })
  };
}