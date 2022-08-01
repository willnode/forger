import {
    transformWithEsbuild,
    ModuleGraph,
    transformRequest,
    createPluginContainer,
    createDevHtmlTransformFn,
    resolveConfig,
    ssrTransform,
    ssrLoadModule,
} from 'vite';
import {
    nodeResolvePlugin
} from './plugins/resolve';
import {
    viteClientPlugin
} from './plugins/vite';
export async function createServer() {
    const config = await resolveConfig({
        plugins: [
            // virtual plugin to provide vite client/env special entries (see below)
            viteClientPlugin,
            // virtual plugin to resolve NPM dependencies, e.g. using unpkg, skypack or another provider (browser-vite only handles project files)
            nodeResolvePlugin,
            // add vite plugins you need here (e.g. vue, react, astro ...)
        ],
        base: '/', // as hooked in service worker
        // not really used, but needs to be defined to enable dep optimizations
        cacheDir: 'browser',
        root: '/',
        // any other configuration (e.g. resolve alias)
        build: {
            rollupOptions: {
                input: '/main.js'
            }
        }
    },
        'serve'
    );
    const plugins = config.plugins;
    const pluginContainer = await createPluginContainer(config);
    const moduleGraph = new ModuleGraph((url) => pluginContainer.resolveId(url));
    const watches = {};
    const watcher = {
        on(what, cb) {
            console.log('watcher on event', what);
            watches[what] = cb;
            return watcher;
        },
        add(files) {
            console.log('watcher on file', files);
        },
    };
    /**
     * @type {import('vite').ViteDevServer}
     */
    const server = {
        config,
        pluginContainer,
        moduleGraph,
        transformWithEsbuild,
        transformRequest(url, options) {
            return transformRequest(url, server, options);
        },
        ssrTransform,
        printUrls() { },
        _globImporters: {},
        ws: {
            send(data) {
                console.log("SENDAAA");
                console.log(data);
                // send HMR data to vite client in iframe however you want (post/broadcast-channel ...)
            },
            async close() { },
            on() { },
            off() { },
        },
        watcher,
        async ssrLoadModule(url) {
            return ssrLoadModule(url, server, loadModule);
        },
        ssrFixStacktrace() { },
        async close() { },
        async restart() { },
        _optimizeDepsMetadata: null,
        _isRunningOptimizer: false,
        _ssrExternals: [],
        _restartPromise: null,
        _forceOptimizeOnRestart: false,
        _pendingRequests: new Map(),
    };

    const transform = createDevHtmlTransformFn(server);

    // apply server configuration hooks from plugins
    /**
     * @type {((() => void) | void)[]}
     */
    const postHooks = [];
    for (const plugin of plugins) {
        if (plugin.configureServer) {
            postHooks.push(await plugin.configureServer(server));
        }
    }

    // run post config hooks
    // This is applied before the html middleware so that user middleware can
    // serve custom content instead of index.html.
    postHooks.forEach((fn) => fn && fn());

    await pluginContainer.buildStart({});
    await runOptimize(server);

    return { server, watches, transform };
}
import {
    scanImports,
    createMissingImporterRegisterFn,
} from 'vite';

/**
 * 
 * @param {import('vite').ViteDevServer} server 
 */
export async function runOptimize(server) {
    const optimizeConfig = {
        ...server.config,
        build: {
            ...server.config.build,
            rollupOptions: {
                ...server.config.build.rollupOptions,
                input: '/main.js',
            },
        },
    };

    try {
        server._isRunningOptimizer = true;
        server._optimizeDepsMetadata = null;
        server._optimizeDepsMetadata = await optimizeDeps(
            server,
            optimizeConfig,
        );
    } finally {
        server._isRunningOptimizer = false;
    }
    server._registerMissingImport = createMissingImporterRegisterFn(
        server,
        (_config, _force, _asCommand, newDeps) =>
            optimizeDeps(server, optimizeConfig, newDeps)
    );
}

export async function optimizeDeps(
    server,
    config,
    deps
) {
    const mainHash = '0';
    const data = {
        hash: mainHash,
        browserHash: mainHash,
        optimized: {},
    };

    if (deps) {
        console.log('New dependencies: ', Object.keys(deps));
    } else {
        const { missing } = await scanImports(config);
        deps = missing;
        console.log('Scanned dependencies: ', Object.keys(deps));
    }
    // Optimize dependency set using a bundler service, e.g. esm.sh
    return data;
}