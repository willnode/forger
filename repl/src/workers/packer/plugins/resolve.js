import { CLIENT_ENTRY, CLIENT_DIR, ENV_ENTRY } from 'vite';
import vite_client from 'vite/dist/client/browser.mjs?raw';
import vite_client_env from 'vite/dist/client/env.mjs?raw';

/**
 * @type {import('vite').Plugin}
 */

const nodeResolvePlugin = {
    async resolveId(importee, importer) {
        if (uid !== current_id) throw ABORT;

        // importing from Svelte
        if (importee === `svelte`) return `${svelteUrl}/index.mjs`;
        if (importee.startsWith(`svelte/`)) {
            return is_legacy_package_structure() ?
                `${svelteUrl}/${importee.slice(7)}.mjs` :
                `${svelteUrl}/${importee.slice(7)}/index.mjs`;
        }

        // importing one Svelte runtime module from another
        if (importer && importer.startsWith(svelteUrl)) {
            const resolved = new URL(importee, importer).href;
            if (resolved.endsWith('.mjs')) return resolved;
            return is_legacy_package_structure() ?
                `${resolved}.mjs` :
                `${resolved}/index.mjs`;
        }

        // importing from another file in REPL
        if (importee.startsWith('.')) {
            let url = importee;
            if (importer && importer.startsWith('.')) {
                url = join(dirname(importer), importee);
            }
            if (url in lookup) return url;
            if ((url + '.js') in lookup) return url + '.js';
            if ((url + '.json') in lookup) return url + '.json';
        }

        // remove trailing slash
        if (importee.endsWith('/')) importee = importee.slice(0, -1);

        // importing from a URL
        if (importee.startsWith('http:') || importee.startsWith('https:')) return importee;

        // importing from (probably) unpkg
        if (importee.startsWith('.')) {
            const url = new URL(importee, importer).href;
            self.postMessage({ type: 'status', uid, message: `resolving ${url}` });

            return await follow_redirects(url);
        }

        else {
            // fetch from unpkg
            self.postMessage({ type: 'status', uid, message: `resolving ${importee}` });

            if (importer in lookup) {
                const match = /^(@[^/]+\/)?[^/]+/.exec(importee);
                if (match) imports.add(match[0]);
            }

            try {
                const pkg_url = await follow_redirects(`${packagesUrl}/${importee}/package.json`);
                const pkg_json = (await fetch_if_uncached(pkg_url)).body;
                const pkg = JSON.parse(pkg_json);

                if (pkg.svelte || pkg.module || pkg.main) {
                    const url = pkg_url.replace(/\/package\.json$/, '');
                    return new URL(pkg.svelte || pkg.module || pkg.main, `${url}/`).href;
                }
            } catch (err) {
                // ignore
            }

            return await follow_redirects(`${packagesUrl}/${importee}`);
        }
    },
    async load(resolved) {
        if (uid !== current_id) throw ABORT;

        if (resolved in lookup) return lookup[resolved].source;

        if (!fetch_cache.has(resolved)) {
            self.postMessage({ type: 'status', uid, message: `fetching ${resolved}` });
        }

        const res = await fetch_if_uncached(resolved);
        return res.body;
    },
    transform(code, id) {
        if (uid !== current_id) throw ABORT;

        self.postMessage({ type: 'status', uid, message: `bundling ${id}` });

        if (!/\.svelte$/.test(id)) return null;

        const name = id.split('/').pop().split('.')[0];

        const result = cache[id] && cache[id].code === code
            ? cache[id].result
            : svelte.compile(code, Object.assign({
                generate: mode,
                format: 'esm',
                dev: true,
                filename: name + '.svelte'
            }, has_loopGuardTimeout_feature() && {
                loopGuardTimeout: 100
            }));

        new_cache[id] = { code, result };

        (result.warnings || result.stats.warnings).forEach(warning => { // TODO remove stats post-launch
            warnings.push({
                message: warning.message,
                filename: warning.filename,
                start: warning.start,
                end: warning.end
            });
        });

        return result.js;
    }
};

export { nodeResolvePlugin }