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

/**
 * @type {import('vite').ViteDevServer}
 */
let server;
let watches;
/**
 * @type {(url: string, html: string, originalUrl: string) => Promise<string>}
 */
let transform;
/**
 * @type {import('fs')}
 */
let fs;

self.addEventListener('message', event => {
    console.log(event.data.type);
    const filepath =event.data.component ? '/'+event.data.component.name+'.'+event.data.component.type : '';
    switch (event.data.type) {
        case 'add':
            fs.writeFileSync(filepath, event.data.component.source);
            watches.add(filepath);
            break;
        case 'change':
            fs.writeFileSync(filepath, event.data.component.source);
            watches.change(filepath);
            break;
        case 'unlink':
            fs.unlinkSync(filepath);
            watches.unlink(filepath);
            break;
        case 'init':
            import('fs').then(m => {
                fs = m.default;
                console.log("GOT FS")
                console.log(fs)
            });
            
            import('./server').then(async module => {
                let i = await module.createServer();
                server = i.server;
                watches = i.watches;
                transform = i.transform;
                console.log(server);
                
                setInterval(() => {
                    transform('/index.html', )
                }, 2000);
            });
            break;

        case 'bundle':
            break;
    }
});