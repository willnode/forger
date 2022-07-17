import { getProperty } from 'dot-prop';
import ky from 'ky';
import { writable } from 'svelte/store';

let api = ky.extend({
    // set global ajax options here
})

let cache = {};

export class AjaxDriver {
    /**
     * @param {string} url 
     */
    constructor(url, empty = null) {
        this.empty = empty
        this.url = writable(url);
        this.data = writable(null);
        this.old_url = ""
        this.state = writable("idle")
        var that = this;
        this.unsub = this.url.subscribe(() => that.fetch())
    }

    destroy() {
        if (this.old_url) {
            delete (cache[this.old_url])
        }
        this.unsub();
    }

    /**
     * 
     * @param {string} url 
     */
    fetch(url) {
        if (url == this.old_url) {
            return cache[url]
        }
        if (this.old_url) {
            delete (cache[url])
        }
        this.old_url = url
        this.data.set(this.empty);
        if (!url) {
            this.state.set("idle")
            return
        }
        this.state.set("loading")
        api({
            url,
        }).json().then(response => {
            if (url.includes('#')) {
                response = getProperty(response, url.substring(url.indexOf('#') + 1));
            }
            this.data.set(response)
            this.state.set("ready")
        }).catch(error => {
            this.state.set("error")
            console.log(error);
        });
    }
}