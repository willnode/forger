export default {
    name: "import-css",

    async transform(code, id) {
        if (!id.endsWith('.css')) return;
        
        return {
            code: `export default ${JSON.stringify(code)};`,
            map: null
        };
    },
};