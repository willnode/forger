import { CLIENT_ENTRY, CLIENT_DIR, ENV_ENTRY } from 'vite';
import vite_client from 'vite/dist/client/browser.mjs?raw';
import vite_client_env from 'vite/dist/client/env.mjs?raw';

/**
 * @type {import('vite').Plugin}
 */
const viteClientPlugin = {
  name: 'vite:browser:hmr',
  enforce: 'pre',
  resolveId(id) {
    if (id.startsWith(CLIENT_DIR)) {
      return {
        id: /\.mjs$/.test(id) ? id : `${id}.mjs`,
        external: true,
      };
    }
  },
  load(id) {
    if (id === CLIENT_ENTRY) {
      return vite_client;
    }
    if (id === ENV_ENTRY) {
      return vite_client_env;
    }
  },
};

export { viteClientPlugin };
