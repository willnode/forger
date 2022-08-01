self.globalThis.process = {
    env: {
        NODE_ENV: 'production',
        ESBUILD_WORKER_THREADS: '0',
    },
    versions: {
        node: '16.0.0'
    },
    cwd() {
        return '/';
    }
}

self.globalThis.window = self;

self.addEventListener('message', event => {
    console.log(event.data.type);
    let server;
    switch (event.data.type) {
        case 'init':
            import('./server').then(module => {
                server = module.default;
            });
            break;

        case 'bundle':
            break;
    }
});