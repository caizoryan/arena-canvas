# Plugin system design notes

This document describes plugin seams in the current Arena Canvas codebase. It is a design proposal only; it does not define an implementation that is already present.

## 1. Current architecture and vocabulary

The application is a vanilla ES-module app. There is no package manager, build step, or plugin loader at present. `index.html` loads `script.js`, which imports the rest of the application.

There are two useful representations of a block:

1. **Arena block** — the API object returned by `arena.js`. For example, a text block has `type: "Text"` and `content.markdown`; a PDF has `type: "Attachment"` and `attachment.file_extension`/`attachment.url`.
2. **Canvas node** — the local JSON-Canvas-like object stored in `state.js` under `data.nodes`. It contains layout and canvas information such as `id`, `x`, `y`, `width`, `height`, `color`, and a lower-case display `type` such as `text` or `link`.

A plugin should receive both representations when both are available. The Arena block is the content identity; the canvas node is the editable placement. Plugins should not mutate either object directly. Changes should go through the controller so they can update the reactive store, be undoable, and be persisted correctly.

### Important current seams

| Concern | Current location | Existing seam or behavior |
| --- | --- | --- |
| Arena API | `arena.js` | `get_block`, `get_channel`, `add_block`, `add_link`, `add_file`, `update_block`, `connect_block` |
| Canvas/application state | `state.js` | `state`, `store`, `selected`, node/edge helpers, channel loading, `updateData`, `renderChannel` |
| Main canvas lifecycle | `script.js` | `mount`, `mountContainer`, `set_channel` indirectly through `state.js`, `moveToBlock`, global listeners |
| Block dispatch | `block.js` | `BlockElement(block)` and the `switch (block.type)` renderer selection |
| Text rendering and editing | `block.js` | `TextBlock`, `MD`, edit/save/cancel controls |
| Markdown and links | `md.js` | `MD`, `eat`, `link_is_block`, `extract_block_id`; Are.na block links become buttons that call `moveToBlock` |
| Common block controls | `block.js` | `BasicComponents` adds copy-link, jump-to-Are.na, and source controls |
| Dragging individual blocks | `block.js`, `drag.js` | `BlockElement` creates drag handlers; `drag` exposes `onstart`, `onend`, and position callbacks |
| Canvas gestures | `dragOperations.js` | pan, selection rectangle, new block, new group, and zoom gestures |
| Multi-selection geometry | `bigBoundingBox.js` | selection bounding box, move, resize, and undo batches |
| Keyboard shortcuts | `keymanager.js`, registrations in `script.js` | central `Keymanager`, global `document.onkeydown`, built-in undo/copy/paste/save/navigation shortcuts |
| Clipboard behavior | `script.js` | `copySelection` writes Are.na URLs; `pasteInBlock` reads plain text and connects/adds links; there is currently no cut shortcut |
| Undo/redo | `store.js`, `history.js` | `startBatch`, `endBatch`, `doUndo`, `doRedo`, tracked `store.tr`/`store.apply` |
| File drop | `script.js` | global `dragover`/`drop`, file filtering, upload, node creation, processing refresh |
| Canvas wheel/zoom | `script.js` | global `wheel` listener, trackpad pan and modifier-key zoom |
| DOM/component construction | `dom.js` | nested-array DOM descriptions, event properties, reactive values |
| Persistent canvas format | `script.js`, `state.js` | `canvasData`, `.canvas` block, `saveCanvasToArena`, `updateData` |
| Auxiliary UI | `sidebar.js`, `help.js`, `history.js`, `notification.js`, `style.css` | sidebar, help panel, history indicator, notifications, global styles |

## 2. Recommended plugin model

Use a registry of independent plugin objects. A plugin should declare its name, version, priority, hooks, and optional teardown. Hooks should be registered once, rather than having plugins patch `BlockElement`, `document.onkeydown`, or individual functions themselves.

Conceptual shape:

```js
{
  id: "table-editor",
  version: "0.1.0",
  priority: 100,
  setup(controller) {
    return {
      // hook names and callbacks
    };
  },
  dispose() {}
}
```

The exact object shape can change, but the following rules are important:

- **A plugin never reaches into private module variables.** It uses the controller.
- **Hooks are capability-scoped.** A renderer should not automatically receive write access to the Arena API unless it asks for it through the controller.
- **Plugins may be asynchronous.** Loading a preview, PDF renderer, or remote block can require a promise.
- **Every registration returns an unsubscribe function.** This is required when switching channels or replacing a rendered block.
- **Every block-level hook has a cleanup path.** The controller should provide `onCleanup(fn)` or an `AbortSignal`.
- **A plugin must be able to decline.** A matcher returning false or a render result of `null` lets the next plugin/default renderer handle the block.
- **Only one primary renderer wins.** Multiple plugins may augment a block, but renderer selection should be deterministic by priority and registration order.
- **Plugin failures are isolated.** A failed plugin should be logged/notified and fall back to the default renderer rather than preventing the canvas from loading.

### Proposed callback context

The common callback signature should be conceptually:

```js
callback({
  block,          // Arena block, when the event concerns a block
  node,           // local canvas node, when it has a canvas placement
  blocks,         // channel snapshot for channel-level hooks
  nodes,          // local node snapshot for canvas-level hooks
  element,        // rendered DOM element, when rendering has begun
  event,          // DOM KeyboardEvent/PointerEvent/ClipboardEvent/etc.
  phase,          // hook-specific phase, e.g. "before" or "after"
  reason,         // optional reason such as "channel-load" or "paste"
  signal,         // AbortSignal for async work and cleanup
}, controller);
```

`block` and `controller` should be the stable core of the public API, as requested. The other fields are event-specific context. For convenience, block-specific hooks can use a shorter equivalent form such as `callback(block, controller, context)`, but the named object form is safer as more hook types are added.

The callback contract should document whether each object is a snapshot or live object. Recommended behavior:

- `block`, `blocks`, `node`, and `nodes` are read-only snapshots for the duration of a callback.
- `element` is the actual DOM element for that render instance and may be augmented only through documented methods.
- `event` is the original browser event. Calling `preventDefault` or `stopPropagation` should be explicit and recorded in the hook result where practical.
- `signal` becomes aborted when a block is unmounted, a channel changes, or the plugin is disposed.

## 3. Controller API

The controller is the action boundary between plugins and the app. It should expose safe methods instead of the raw `state` object and raw `store` where possible.

### Read access

```js
controller.getBlock(id)
controller.getChannelBlocks()
controller.getNode(id)
controller.getNodes()
controller.getEdges()
controller.getSelection()
controller.getCanvasState() // x, y, scale, currentSlug, etc.
controller.getElement(id)
```

The methods should return snapshots. If a plugin needs to react to changes, it should subscribe through a hook or an explicit subscription method rather than polling.

### Canvas and selection actions

```js
controller.select(ids, { additive })
controller.clearSelection()
controller.focusBlock(id)
controller.moveNodes([{ id, x, y }], { undoLabel })
controller.resizeNodes([{ id, x, y, width, height }], { undoLabel })
controller.setNodeProperties(id, { color, ...properties }, { undoLabel })
controller.addNode(node)
controller.removeNode(id)
controller.addEdge(edge)
controller.removeEdge(id)
```

`moveNodes` is especially important for cut/paste. It should preserve the relative geometry of a selection, use one undo transaction, and mark the canvas dirty.

### Block/content actions

```js
controller.updateBlock(id, patch, { undoLabel })
controller.createBlock({ title, content, position })
controller.connectBlock(id, channelOrSlug)
controller.fetchBlock(id)
controller.saveCanvas()
```

The controller should normalize the API differences between `content.markdown`, `content.plain`, attachment URLs, and the local `node.text` representation. A table editor, for example, should call `updateBlock` with markdown rather than editing the Arena object in memory.

### UI and rendering actions

```js
controller.createElement(descriptionOrNode)
controller.mountOverlay(element, { region: "bottom-left" | "canvas" | "modal" })
controller.addBlockControl(blockId, control, { region: "top" | "bottom" })
controller.replaceBlockBody(blockId, element)
controller.openModal(element)
controller.notify(message, { error })
controller.onCleanup(fn)
```

`addBlockControl` and `replaceBlockBody` are preferable to allowing a plugin to manipulate `.top-bar`, `.bottom-bar`, or `innerHTML` directly. Plugins should be able to add a component without accidentally removing the built-in edit, source, or copy controls.

### Commands, keyboard, and clipboard

```js
controller.registerCommand({
  id,
  shortcut: "cmd+x",
  priority,
  when: ({ event, selection, focusedElement }) => boolean,
  run: ({ event, selection }, controller) => result,
});
controller.claimEvent(event)
controller.readClipboard()
controller.writeClipboard({ text, html, internal })
controller.getPluginClipboard(id)
controller.setPluginClipboard(id, payload)
```

The internal clipboard payload should use a versioned MIME type or namespaced storage, for example `application/x-arena-canvas-selection+json`, while also writing a human-readable text fallback. It should never assume that the system clipboard contains only Arena URLs.

### Transactions and cleanup

```js
controller.transaction("Paste blocks", () => {
  // all node changes become one undo item
});
controller.onCleanup(cleanupFunction)
controller.abortSignal
```

A plugin should not call `store.startBatch`/`store.endBatch` directly unless the raw store is deliberately part of a lower-level extension API. The controller can guarantee balanced transactions if a plugin throws.

## 4. Hook points

### 4.1 Plugin lifecycle and application lifecycle

**Hooks:**

- `app:before-mount`
- `app:mounted`
- `app:before-unmount`
- `app:dispose`
- `channel:before-load`
- `channel:loaded`
- `channel:before-render`
- `channel:rendered`
- `channel:changed`

**Callback data:**

- `block`: absent for application hooks; present for block-specific callbacks.
- `blocks`: channel API snapshot for load/render hooks.
- `controller`: always present.
- `reason`: navigation, initial load, hash change, stale `.canvas` refresh, and so on.
- `signal`: lifetime of the load/render operation.

**Current seam:** `state.js` functions `set_channel`, `renderChannel`, and `updateData`, plus `script.js` `mount` and `mountContainer`.

The `channel:loaded` hook is the right place for plugins that need to inspect all text blocks before any one block is rendered. The PDF annotation plugin is an example.

### 4.2 Block normalization and classification

**Hooks:**

- `block:normalize`
- `block:classify`
- `block:before-render`

**Callback data:**

- `block`: raw Arena block.
- `node`: matching local canvas node, if one exists.
- `blocks`/`nodes`: optional channel context.
- `controller`.

A classifier returns a score or a match result:

```js
{
  match: true,
  renderer: "table-editor",
  priority: 100,
  metadata: { reason: "title" }
}
```

**Current seam:** the `processBlockForRendering` function in `state.js` and the `BlockElement` type switch in `block.js`. `convertBlockToV3` is also a normalization seam, but it currently mutates the supplied object; a future plugin boundary should use a non-mutating normalized copy.

This hook is the primary renderer-selection point. It must run before the default `TextBlock`, `AttachmentBlock`, and other type renderers are constructed.

### 4.3 Block renderer

**Hooks:**

- `block:render`
- `block:augment`
- `block:mounted`
- `block:unmounted`
- `block:updated`

**Callback data:**

- `block`, `node`, and `controller`.
- `element`: the outer `.draggable.node` for augment/mounted/unmounted hooks; the body element for renderer hooks.
- `event`: only for event-triggered re-rendering.
- `renderState`: plugin-owned state, if the plugin uses it.
- `signal` and cleanup registration.

A primary renderer returns a block body and optional controls/attributes. An augmenting plugin returns controls, an inline preview, or a lifecycle handler without replacing the default renderer. The render result should be declarative or a DOM node accepted by `dom.js`; plugins should not depend on the nested-array internals more than necessary.

**Current seam:** `BlockElement` in `block.js`, especially the `switch (block.type)`, the component collection that builds `.top-bar`/`.bottom-bar`, and the delayed `drag` setup.

### 4.4 Markdown parsing and inline links

**Hooks:**

- `markdown:before-parse`
- `markdown:token`
- `markdown:link`
- `markdown:after-render`

**Callback data:**

- `block`: the containing text block.
- `content`: markdown source.
- `token`: markdown-it token, for token hooks.
- `href`, parsed `URL`, link text, and link attributes, for link hooks.
- `element`: generated link/button element for after-render hooks.
- `controller`.

The link hook should support a result such as `{ handled: true, element }` so a plugin can replace the default link behavior. It should also support `{ attributes }` for a non-exclusive augmentation.

**Current seam:** `md.js`, particularly `MD`, `eat`, and the branch that detects `link_is_block`. The current `extract_block_id` uses the last slash-separated string and therefore will include query text in some URLs; plugin link parsing should use `new URL()` and read `pathname` and `searchParams` separately.

### 4.5 Keyboard shortcuts and commands

**Hooks:**

- `keyboard:before`
- `keyboard:command`
- `keyboard:after`
- command registration with a shortcut and `when` predicate

**Callback data:**

- `event`: original `KeyboardEvent`.
- `keystroke`: normalized shortcut data (`key`, `code`, modifiers).
- `focusedElement`: active element and whether it is an input or textarea.
- `selection`, `block`, and `node` when applicable.
- `controller`.

A command result should indicate `handled`, `preventDefault`, and `stopPropagation`. Priority and `when` conditions are required because built-ins already own save, undo, copy, paste, movement, and deletion shortcuts.

**Current seam:** `Keymanager.on`, `Keymanager.event`, and the registrations at the end of `script.js`. The current `on` method has a `type` option in its defaults, but event dispatch is currently wired only through `document.onkeydown`; the plugin API should not claim keyup/keypress support until dispatch supports those event types.

A plugin must be able to run before a built-in command and stop it. This is required for `cmd+x`, and also prevents an input editor from handling canvas-level shortcuts.

### 4.6 Pointer, drag, selection, and resize

**Hooks:**

- `pointer:down`, `pointer:move`, `pointer:up`, `pointer:cancel`
- `block:drag-start`, `block:drag`, `block:drag-end`
- `selection:will-change`, `selection:changed`
- `selection:move-start`, `selection:moving`, `selection:move-end`
- `selection:resize-start`, `selection:resizing`, `selection:resize-end`
- `canvas:pan-start`, `canvas:panning`, `canvas:pan-end`

**Callback data:**

- `event`: original pointer event.
- `block`/`node`: target block when there is one.
- `selection`: selected IDs and node snapshots.
- `origin`, `position`, `delta`, `bounds`, and `transform` for geometry hooks.
- `controller`.

**Current seam:** `drag.js` option callbacks, `BlockElement`'s `onstart`/`onend`, `dragOperations.js`, and `bigBoundingBox.js`.

Plugins should normally observe these hooks rather than install competing pointer listeners. A plugin that needs to take over a gesture should be able to claim it during `pointer:down` and return a cleanup function.

### 4.7 Selection and clipboard

**Hooks:**

- `selection:copy`
- `selection:cut`
- `clipboard:write`
- `clipboard:read`
- `selection:paste:before`
- `selection:paste`
- `selection:paste:after`

**Callback data:**

- `event`: `ClipboardEvent` or keyboard event.
- `selection`: selected IDs and complete node geometry.
- `blocks`: corresponding Arena block snapshots.
- `clipboard`: decoded internal payload, plain text, and available MIME types.
- `pastePosition`: canvas-space destination, if known.
- `controller`.

**Current seam:** `copySelection` and `pasteInBlock` in `script.js`, plus the `cmd/ctrl+c` and `cmd/ctrl+v` registrations. There is no current cut registration.

The cut/paste plugin should be able to claim copy, cut, and paste before the current URL-based implementation. It should not break ordinary pasting of URLs or other text when its internal payload is absent.

### 4.8 File drop and external content

**Hooks:**

- `drop:before`
- `drop:file`
- `drop:link`
- `drop:after`

**Callback data:**

- `event`: original drag/drop event.
- `files`, `DataTransfer`, or dropped URLs.
- `position`: canvas-space drop position.
- `controller`.

**Current seam:** the global `dragover` and `drop` listeners in `script.js`, `isSupportedFile`, `uploadDroppedFile`, and `uploadDroppedFiles`.

A plugin could add another file type or interpret a dropped URL without duplicating upload and node-placement logic. The existing maximum of five files and supported-type checks should be exposed as policy rather than silently duplicated by plugins.

### 4.9 Canvas wheel, zoom, and navigation

**Hooks:**

- `wheel:before`
- `canvas:zoom`
- `canvas:pan`
- `navigation:focus-block`
- `navigation:channel`

**Callback data:**

- `event`: `WheelEvent` or navigation event.
- `delta`, old/new canvas transform, target block ID, and channel slug.
- `controller`.

**Current seam:** the global `wheel` handler in `script.js` and `moveToBlock`.

The PDF plugin can use `focusBlock` after opening or selecting a target block. A preview plugin can use the same navigation controller instead of depending on DOM selectors.

### 4.10 Persistence and data transformation

**Hooks:**

- `canvas:serialize`
- `canvas:deserialize`
- `canvas:before-save`
- `canvas:saved`
- `canvas:save-error`
- `store:transaction`
- `history:undo`
- `history:redo`

**Callback data:**

- `canvasData`, `nodes`, and `edges`.
- `slug` and `.canvas` block identity.
- `transaction` with changed paths and undo label.
- `error`, if applicable.
- `controller`.

**Current seam:** `canvasData`/`saveCanvasToArena` in `script.js`, `updateData` in `state.js`, and the transaction/history methods in `store.js`.

Plugins should be able to persist plugin metadata in a namespaced canvas field, for example `plugins: { "table-editor": {...} }`, without making arbitrary changes to the core node format. Serialization hooks must be deterministic and must not store DOM nodes or transient network data.

### 4.11 Auxiliary UI regions

**Hooks:**

- `ui:top-bar`
- `ui:bottom-bar`
- `ui:sidebar`
- `ui:bottom-left`
- `ui:help`
- `ui:modal`
- `ui:notification`

**Callback data:**

- `region` and current region element.
- `block`, if a block-scoped control is being built.
- `controller`.

**Current seam:** `script.js` top/bottom buttons, `sidebar.js`, `help.js`, `history.js`, and `notification.js`. The cut/paste plugin specifically needs a persistent `bottom-left` region for its clipboard preview. The UI region should be mounted outside `.container` so it is not affected by canvas pan and scale.

## 5. Plugin examples

### 5.1 PDF renderer with link-driven annotations

#### Behavior

A PDF block normally uses the existing attachment renderer. The plugin replaces or augments it with a PDF viewer. It scans all text blocks in the loaded channel for markdown links pointing to that PDF block. A link can carry an annotation target in its query parameters, for example:

```text
https://are.na/block/123456?type=annotation&from=12&to=34&page=3
```

Recommended parameters:

- `type=annotation` — identifies the action.
- `page=3` — one-based PDF page number.
- `from=12` and `to=34` — character offsets in the annotation text, or a plugin-defined text range.
- Optional `quote=...` — a URL-encoded quote used as a fallback when offsets become stale.
- Optional `x`, `y`, `width`, `height` — a page-region annotation when the target is geometric rather than text-based.

The exact coordinate/offset contract must be documented and versioned. A PDF annotation cannot reliably be represented by only `from` and `to` unless the source text and indexing rules are stable.

#### Hook usage

1. `channel:loaded`: build an index of PDF IDs and links from every text block.
2. `block:classify` or `block:render`: claim `Attachment` blocks whose file extension is `pdf`.
3. `markdown:link`: detect links to an indexed PDF and attach an action/preview without replacing unrelated links.
4. `navigation:focus-block` or a controller method: focus the PDF block before opening the annotation.
5. `block:unmounted`: close the viewer and abort pending PDF work.

#### Callback inputs

- PDF render callback: `block`, `node`, `controller`, `element`, `signal`, and the precomputed annotation index.
- Link callback: containing text `block`, link `href`, parsed `URL`, visible link text, source token/element, and `controller`.
- Open-annotation action: PDF block ID, parsed parameters, originating link block ID, and the click event.

#### Controller actions needed

- `getChannelBlocks()` and `getBlock(id)`.
- `mountBlockBody`/`replaceBlockBody` or a primary-renderer return value.
- `focusBlock(id)`.
- `openModal` or a viewer overlay.
- `notify` for malformed or stale annotations.

The implementation can use the browser PDF viewer initially, but displaying a text highlight generally requires a PDF-aware rendering layer such as PDF.js or a server-generated annotation view. The plugin should keep the viewer backend behind its own adapter.

### 5.2 Are.na link preview

#### Behavior

The current `md.js` behavior turns every Are.na block link into a button that calls `moveToBlock`. A preview plugin should preserve navigation, but when the surrounding text begins with a marker such as `clip:` (or another configured keyword), it should fetch the linked block and show a miniature preview.

Possible forms:

- inline preview below the link;
- hover/focus popover;
- small preview card inside the containing text block;
- preview on a canvas block that is itself an Are.na link.

#### Hook usage

- `markdown:link`: match Are.na block URLs and marker text.
- `block:render` or `markdown:after-render`: mount the preview component.
- `block:unmounted`: abort the fetch and remove the popover.
- `navigation:focus-block`: retain the normal click-to-jump behavior.

#### Callback inputs

- containing text `block`;
- parsed target block ID and URL;
- surrounding text/marker and link element;
- `controller`, `signal`, and click/focus event.

#### Controller actions needed

- `fetchBlock(id)`;
- `createElement` and a popover/overlay mount point;
- `focusBlock(id)`;
- optional cache access, so several links to the same block do not trigger duplicate requests.

The match should parse the URL pathname, not split on the final slash. It should handle query strings and fragments without putting them into the target block ID.

### 5.3 Table editor

#### Behavior

A text block becomes an editable table when either:

1. its title matches a configured title, such as `table`, `data`, or a plugin-specific prefix; or
2. its markdown consists of a table and insignificant whitespace, with no unrelated paragraphs.

The plugin should be a primary renderer with a clear fallback to the normal markdown text editor. It should retain the block's normal position, color, selection behavior, and edit controls.

#### Hook usage

- `block:classify`: inspect title and markdown structure.
- `block:render`: render a table editor instead of `TextBlock`.
- `keyboard:command`: optionally add tab/enter/delete behavior while the editor is focused.
- `block:updated`: refresh the editor when another source changes the markdown.
- `block:unmounted`: remove listeners.

#### Callback inputs

- text `block` and local `node`;
- parsed markdown/table model;
- `element` and editor focus events;
- `controller` and cleanup signal.

#### Controller actions needed

- `updateBlock(block.id, { content: markdown }, { undoLabel: "Edit table" })`;
- `notify` for invalid table syntax;
- `addBlockControl` for edit/save/cancel actions;
- transaction and dirty-state handling.

The serialized format should remain markdown unless there is a deliberate, persisted block schema. A parser/serializer pair must preserve escaped pipes, alignment, empty cells, and newlines.

### 5.4 Cut/paste selection clipboard

#### Behavior

`cmd+x`/`ctrl+x` captures the selected canvas nodes into an application clipboard. The clipboard is represented by miniature square previews in a fixed bottom-left UI region. Pasting places the captured selection at the current canvas destination while preserving relative positions and dimensions.

Recommended default semantics:

- `cmd+x` captures a versioned snapshot of selected node IDs, geometry, colors, and source block IDs.
- The original nodes remain until a paste succeeds; this avoids destructive loss if the clipboard is denied or the user navigates away.
- A successful paste/move is one undoable transaction.
- A true cut marks the payload as `cut`; after successful paste, the source placement is removed or moved according to a documented policy.
- `cmd+c` can continue to provide the existing external Are.na URL fallback, while an internal copy payload is used when pasting within Canvas.
- Pasting should not create duplicate Arena blocks unless the plugin explicitly chooses a clone operation. A normal paste can reuse the same block IDs and create new local placements only if the canvas model supports duplicate placements.

The final choice between "move existing nodes" and "create duplicate local placements" must be made before implementation. The current node hash assumes one node per ID, so reusing an ID for two simultaneous placements is not currently supported.

#### Hook usage

- `keyboard:command` for copy, cut, and paste, with higher priority than the current built-ins.
- `selection:changed` to update the preview and enabled/disabled state.
- `selection:paste:before` to decode and validate the internal payload.
- `selection:paste` to calculate a destination and apply geometry.
- `ui:bottom-left` for the persistent clipboard strip.
- `history:undo`/`history:redo` or transaction notifications to refresh the preview state.

#### Clipboard payload

A versioned internal payload should include at least:

```js
{
  version: 1,
  operation: "copy" | "cut",
  sourceSlug: "channel-slug",
  createdAt: "2025-01-01T00:00:00.000Z",
  items: [
    {
      id: "123",
      x: 100,
      y: 200,
      width: 300,
      height: 300,
      color: "2",
      offsetX: 0,
      offsetY: 0
    }
  ],
  edges: []
}
```

Offsets should be relative to the selection's top-left corner, not only absolute coordinates. Edges should be included only when both endpoints are in the payload, and edge IDs should be regenerated if a paste creates new edge records.

#### Callback inputs

- `event` and normalized shortcut;
- selected `blocks` and `nodes`;
- decoded clipboard payload and available clipboard MIME types;
- canvas-space paste position and current transform;
- `controller`.

#### Controller actions needed

- `getSelection()`;
- `setPluginClipboard`/`getPluginClipboard`;
- system clipboard read/write with a text fallback;
- `transaction("Paste selection", ...)`;
- `moveNodes`, `addNode`, `removeNode`, and edge operations;
- `mountOverlay(..., { region: "bottom-left" })`;
- `notify` for clipboard permission failures.

The preview must be fixed to the viewport, not a child of `.container`, otherwise canvas panning and scaling will distort it. It should render a lightweight thumbnail rather than instantiate full block renderers for every clipboard item.

## 6. Hook ordering and conflicts

A predictable ordering policy is needed before third-party plugins are allowed:

1. `before` observers run by descending priority.
2. A primary renderer is selected by the highest-priority positive match.
3. Augmenters run after the primary renderer is created.
4. Event commands run by descending priority; the first handler that claims an event may stop lower-priority handlers.
5. `after` observers run even if a plugin handled the event, unless the event was cancelled due to an error.
6. Built-ins should be registered as ordinary plugins with a low, documented priority rather than being invisible special cases.

For example, the cut/paste plugin must have higher priority than the built-in `cmd+c`/`cmd+v` handlers, while still returning `handled: false` for unrelated external clipboard text. The table editor should outrank the default text renderer but not an explicitly configured higher-priority custom renderer.

## 7. Error, security, and performance requirements

- Validate plugin IDs, hook names, and priorities at registration.
- Catch each plugin callback independently and provide a fallback renderer.
- Use `AbortController` for network work and unmount cleanup.
- Do not inject untrusted block HTML directly. The current embed path can insert provider HTML; plugins should follow an explicit trusted-content policy.
- Do not give arbitrary plugins the Arena authentication token. API calls should go through `arena.js`/the controller.
- Enforce limits on preview fetches, PDF scans, clipboard payload size, and number of mounted preview components.
- Cache fetched blocks and parsed link indexes per channel, invalidating them on channel/block updates.
- Keep plugin metadata namespaced in the `.canvas` JSON.
- Make all node geometry writes undoable and mark the canvas dirty.
- Ensure plugin overlays and fixed UI regions are outside the scaled canvas.
- Provide a plugin teardown on hot reload, channel change, and page unload.

## 8. Suggested implementation order (future work)

1. Define the read-only callback context and controller interface.
2. Add a registry and lifecycle/teardown handling.
3. Turn built-in keyboard commands into registered commands.
4. Add the block classifier/renderer pipeline around `BlockElement`.
5. Add markdown link hooks around `md.js`.
6. Add selection, transaction, and clipboard hooks.
7. Add UI regions and block-control registration.
8. Migrate one small plugin first, preferably Are.na link preview.
9. Implement the table editor and PDF renderer after renderer precedence and async cleanup are proven.
10. Implement cut/paste after the duplicate-node versus move semantics are settled.

No current file implements these hooks yet. The main architectural goal is to make plugins consumers of explicit lifecycle and controller APIs rather than direct patches to `script.js`, `state.js`, `block.js`, or global DOM listeners.
