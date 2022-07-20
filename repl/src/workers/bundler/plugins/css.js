export default {
    name: "import-css",

    async transform(code, id) {
        if (!id.endsWith('.css')) return;
        
        return {
            code: `
var code = ${JSON.stringify(code)};
var style = document.createElement('style');
style.type = 'text/css';
style.appendChild(document.createTextNode(code));
document.head.appendChild(style);
export default code;`,
            map: null
        };
    },
};