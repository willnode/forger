import resolve from '@rollup/plugin-node-resolve';
import json from 'rollup-plugin-json';
// import { terser } from 'rollup-plugin-terser';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const dev = process.env.ROLLUP_WATCH;

// bundle workers
export default ['compiler', 'bundler'].map(x => ({
	input: `src/workers/${x}/index.js`,
	output: {
		file: `../public/workers/${x}.js`,
		format: 'iife',
		name: x,
	},
	plugins: [
		nodePolyfills(),
		resolve(),
		json(),
		// !dev && terser({
		// 	sourcemap: true,
		// })
	]
}));