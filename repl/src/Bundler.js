const workers = new Map();

let uid = 1;

export default class Bundler {
	constructor({
		packagesUrl,
		svelteUrl,
		onstatus
	}) {
		const hash = `${packagesUrl}:${svelteUrl}`;

		if (!workers.has(hash)) {
			const url = new URL('./workers/packer/index.js',
				import.meta.url)
			const worker = new Worker(url, {
				type: 'module'
			});
			worker.onerror = (...e) => {
				console.error(e);
			}
			worker.postMessage({
				type: 'init',
				packagesUrl,
				svelteUrl
			});
			workers.set(hash, worker);
		}

		this.worker = workers.get(hash);

		this.handlers = new Map();

		this.worker.addEventListener('message', event => {
			const handler = this.handlers.get(event.data.uid);

			if (handler) { // if no handler, was meant for a different REPL
				if (event.data.type === 'status') {
					onstatus(event.data.message);
					return;
				}

				onstatus(null);
				handler(event.data);
				this.handlers.delete(event.data.uid);
			}
		});
	}

	add(component) {
		return new Promise(fulfil => {
			this.handlers.set(uid, fulfil);

			this.worker.postMessage({
				uid,
				type: 'add',
				component
			});

			uid += 1;
		});
	}


	change(component) {
		return new Promise(fulfil => {
			this.handlers.set(uid, fulfil);

			this.worker.postMessage({
				uid,
				type: 'change',
				component
			});

			uid += 1;
		});
	}

	unlink(component) {
		return new Promise(fulfil => {
			this.handlers.set(uid, fulfil);

			this.worker.postMessage({
				uid,
				type: 'unlink',
				component
			});

			uid += 1;
		});
	}

	destroy() {
		this.worker.terminate();
	}
}