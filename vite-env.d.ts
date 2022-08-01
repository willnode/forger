/// <reference types="svelte" />
/// <reference types="vite/client" />

declare type DndEvent = import("svelte-dnd-action").DndEvent;
declare namespace svelte.JSX {
    interface HTMLAttributes<T> {
        onconsider?: (event: CustomEvent<DndEvent> & {target: EventTarget & T}) => void;
        onfinalize?: (event: CustomEvent<DndEvent> & {target: EventTarget & T}) => void;
    }
}


import { Subscriber, Unsubscriber } from 'svelte/store';
import { Subscription } from 'dexie';

declare module 'dexie' {
  interface Observable<T> {
    subscribe(run: Subscriber<T>): Unsubscriber | Subscription;
  }
}

import { Modal, Button } from "carbon-components-svelte";

declare module 'carbon-components-svelte/src/Modal/Modal.svelte' {
  export { Modal }
}


declare module 'carbon-components-svelte/src/Button/Button.svelte' {
  export { Button }
}