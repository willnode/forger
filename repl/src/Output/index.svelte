<script>
	import { getContext, onMount } from 'svelte';
	import { parse } from 'marked';
	import Viewer from './Viewer.svelte';
	import PaneWithPanel from './PaneWithPanel.svelte';
	import CompilerOptions from './CompilerOptions.svelte';
	import CodeMirror from '../CodeMirror.svelte';

	const { register_output } = getContext('REPL');

	export let status;
	export let runtimeError = null;
	export let injectedJS;
	export let injectedCSS;


	register_output({
		set: async (selected, options) => {
			selected_type = selected.type;

			if (selected.type === 'js' || selected.type === 'json') {
				// js_editor.set(`/* Select a component to see its compiled code */`);
				// css_editor.set(`/* Select a component to see its compiled code */`);
				return;
			}

			if (selected.type === 'md') {
				markdown = parse(selected.source);
				return;
			}


		},

		update: async (selected, options) => {
			if (selected.type === 'js' || selected.type === 'json') return;

			if (selected.type === 'md') {
				markdown = parse(selected.source);
				return;
			}

		}
	});

	// refs
	let viewer;
	let js_editor;
	let css_editor;
	const setters = {};

	let view = 'result';
	let selected_type = '';
	let markdown = '';
</script>

<style>
	.view-toggle {
		height: var(--pane-controls-h);
		border-bottom: 1px solid #eee;
		white-space: nowrap;
		box-sizing: border-box;
	}

	button {
		/* width: 50%;
		height: 100%; */
		background: white;
		text-align: left;
		position: relative;
		font: 400 12px/1.5 var(--font);
		border: none;
		border-bottom: 3px solid transparent;
		padding: 12px 12px 8px 12px;
		color: #999;
		border-radius: 0;
	}

	button.active {
		border-bottom: 3px solid var(--prime);
		color: #333;
	}

	.tab-content {
		position: absolute;
		width: 100%;
		height: calc(100% - 42px) !important;
		opacity: 0;
		pointer-events: none;
	}

	.tab-content.visible {
		/* can't use visibility due to a weird painting bug in Chrome */
		opacity: 1;
		pointer-events: all;
	}
</style>

<div class="view-toggle">
	{#if selected_type === 'md'}
		<button class="active">Markdown</button>
	{:else}
		<button
			class:active="{view === 'result'}"
			on:click="{() => view = 'result'}"
		>Result</button>

		<button
			class:active="{view === 'js'}"
			on:click="{() => view = 'js'}"
		>JS output</button>

		<button
			class:active="{view === 'css'}"
			on:click="{() => view = 'css'}"
		>CSS output</button>
	{/if}
</div>

<!-- component viewer -->
<div class="tab-content" class:visible="{selected_type !== 'md' && view === 'result'}">
	<Viewer
		bind:this={viewer}
		bind:error={runtimeError}
		{status}
		{injectedJS}
		{injectedCSS}
	/>
</div>
