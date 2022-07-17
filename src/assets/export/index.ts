import IndexHtml from './index.html?raw';
import IndexJs from './index.js?raw';
import License from './LICENSE?raw';
import MainJs from './main.js?raw';
import PackageJson from './package.json?raw';
import TsConfig from './ts.config.json?raw';
import ViteEnv from './vite-env.d.ts?raw';
import ViteConfig from './vite.config.js?raw';

export default {
    "src/index.js": IndexJs,
    "src/main.js": MainJs,
    "src/vite-env.d.ts": ViteEnv,
    "index.html": IndexHtml,
    "LICENSE": License,
    "package.json": PackageJson,
    "tsconfig.json": TsConfig,
    "vite.config.js": ViteConfig,
}