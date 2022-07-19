import "carbon-components-svelte/css/g90.css";
import './app.css'
import App from './App.svelte'
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

const app = new App({
  target: document.getElementById('app')
})

export default app
