# How much current functionality can be expressed as plugins?

A large majority of the **user-facing functionality** can be expressed as plugins—probably around **80–90%** once the proposed controller and hook infrastructure exists.

The plugin system should not replace the application kernel. It should sit above the kernel and own behavior, rendering, commands, and optional UI.

## Functionality that fits very well

| Current functionality | Plugin form |
|---|---|
| Text, image, link, embed, media, PDF, and channel rendering | Primary block renderer plugins |
| Processing-state rendering | Renderer or block lifecycle plugin |
| Markdown Are.na links | `markdown:link` plugin |
| Are.na “jump to block” behavior | Link-action plugin |
| Copy-link, source, and “open on Are.na” controls | Block-control augmenters |
| Text editing and save/cancel controls | Text renderer plugin |
| Table editor | Primary text renderer plugin |
| PDF viewer and annotation handling | Attachment renderer + markdown-link plugin |
| Keyboard shortcuts | Command plugins |
| Undo/redo commands | Built-in command plugins |
| Save/download commands | Command plugins |
| Cut/copy/paste | Clipboard command plugin |
| Canvas selection behavior | Selection plugin or built-in selection module |
| Drag and resize observers | Pointer/drag hooks |
| Custom drag behavior | Gesture-claiming plugin |
| File-drop handling | Drop plugins |
| Link previews | Markdown/link plugin |
| Sidebar tools | UI-region plugins |
| Help content | Help-panel plugin |
| Timer | Auxiliary UI plugin |
| Notifications | Controller/UI service |
| Custom bottom-left clipboard UI | Fixed-region UI plugin |
| Navigation/focus behavior | Navigation plugin or controller command |
| Custom canvas overlays | Overlay plugin |

For example, most of the current keyboard registrations in `script.js` could become ordinary command plugins:

- `cmd+s` → save plugin
- `cmd+z` → history plugin
- `cmd+e` → sidebar plugin
- `cmd+d` → download plugin
- `escape` → selection/interaction plugin
- `cmd+c`/`cmd+v` → clipboard plugin
- arrow keys/WASD → navigation plugin

Likewise, the current `switch (block.type)` in `BlockElement` could become the built-in renderer registry.

## Functionality that should remain core

Some parts should not be plugins, or should only expose plugin hooks.

### Application bootstrap

- Loading `script.js`
- Establishing the plugin registry
- Mounting the initial application
- Switching channels
- Global error handling

### Reactive and DOM infrastructure

- `chowk.js`
- `dom.js`
- The basic DOM/component lifecycle
- Subscription cleanup

These are the runtime primitives that plugins depend on.

### Core data model

- The local node/edge representation
- Node identity and lookup
- The relationship between Arena blocks and canvas nodes
- Canvas transforms
- Basic geometry operations

Plugins should be able to use these through the controller, but should not redefine them.

### Authentication and API security

- Arena authentication
- Token handling
- API request policy
- Authorization failure handling

Plugins should call `controller.getBlock`, `controller.updateBlock`, etc. They should not receive the raw auth token.

### Renderer host

The renderer host itself should remain core:

- Choosing the winning renderer
- Creating the outer draggable node
- Applying position, size, color, and selection state
- Attaching resizing and connection handles
- Managing mount/unmount lifecycle

Plugins can provide the block body or augment it, but the host should control the outer canvas node.

### Store and transaction machinery

`store.js` should remain core. Plugins should receive:

```js
controller.transaction("Paste blocks", () => {
  // plugin actions
});
```

rather than directly manipulating store paths.

## Areas that are partly plugin-friendly

Some behavior can be observed or extended by plugins, but the default implementation should remain part of the core.

### Selection and dragging

A plugin should be able to observe:

```text
selection:changed
block:drag-start
block:drag-end
selection:resize-end
```

A specialized plugin could claim a gesture, but ordinary block dragging and multi-selection should remain core because they are fundamental canvas behavior.

### Canvas pan and zoom

Plugins may react to pan/zoom or add zoom-dependent overlays. However, the actual canvas transform should remain a core service.

### Channel loading

Plugins should receive:

```text
channel:before-load
channel:loaded
channel:before-render
channel:rendered
```

But the core should still own fetching the channel, loading `.canvas`, reconciling nodes, and mounting the canvas.

### Persistence

Plugins can add namespaced metadata and react to save events. The core should own the `.canvas` block format and save operation.

## What needs to be added before current functionality can truly be migrated

The document describes the right extension points, but the current application does not yet have the infrastructure required to support them.

The most important missing pieces are:

1. **Renderer registry**  
   `BlockElement` currently has a hard-coded type switch. This needs primary-renderer and augmenter registration.

2. **Command registry**  
   `Keymanager` currently receives direct registrations in `script.js`. Commands need priorities, conditions, claiming, and cleanup.

3. **Central controller**  
   Plugins need safe access to node changes, Arena requests, selection, navigation, transactions, and UI.

4. **Lifecycle management**  
   Plugins need cleanup when:
   - a block is removed;
   - a channel changes;
   - a renderer is replaced;
   - an async request finishes late;
   - the application is disposed.

5. **Block/node context**  
   Plugins need both:
   - the Arena block content;
   - the local canvas node geometry.

6. **Event dispatch for all event types**  
   The current key manager is effectively wired only to `keydown`. Pointer, wheel, drag, drop, and clipboard events need matching plugin dispatch points.

7. **Renderer composition**  
   A table plugin should be able to replace only the block body while preserving:
   - selection;
   - drag behavior;
   - resize handles;
   - colors;
   - built-in controls.

8. **Duplicate placement semantics**  
   The current node hash assumes one canvas node per block ID. This must be resolved before deciding whether paste:
   - moves existing nodes;
   - creates duplicate local placements;
   - creates duplicate Arena blocks.

9. **Plugin discovery/loading**  
   There is currently no way to discover or load external plugins. Initially, built-in plugins could simply be imported and registered from a central file. Dynamic loading can come later.

## Recommended boundary

A useful division would be:

### Core kernel

- DOM and reactivity
- Store and transactions
- Arena API/auth
- Canvas data model
- Renderer host
- Selection and geometry primitives
- Plugin registry
- Controller
- Lifecycle and error isolation

### Built-in plugins

- Text renderer
- Image renderer
- Link renderer
- Embed renderer
- Attachment/PDF renderer
- Channel renderer
- Markdown link behavior
- Default keyboard commands
- Save/download/history commands
- Clipboard behavior
- Sidebar/help/timer UI
- File-drop behavior

### User or third-party plugins

- PDF annotation enhancements
- Are.na previews
- Table editor
- Custom media viewers
- Cut/paste variations
- Smart block classification
- Canvas overlays
- Custom keyboard workflows
- Exporters and importers

So the answer is: **nearly all feature behavior can become plugins, but the application still needs a small, stable kernel to provide rendering, state, transactions, API access, lifecycle, and security.** The best architecture is not “everything is a plugin”; it is “all replaceable behavior is a plugin, while the canvas runtime remains core.”
