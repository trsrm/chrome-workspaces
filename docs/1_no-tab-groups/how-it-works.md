## 1. Overview

### Conteptual desing

* Workspaces are **purely an extension feature**:

  * Stored in extension storage .
  * Bound to browser windows (1 workspace - 0 or 1 windows).
* The extension:

  * Opens workspaces into windows.
  * Tracks tabs inside those windows.
  * Updates the saved state as tabs change.
  * Recovers workspace/window mappings on browser restart **without** relying on tab groups.
* Visual cues clearly show:

  * “This window = workspace X”
  * Ideally the workspace name and/or color.
* Avoid:

  * Any dependency on Chrome's tab group APIs (no grouping, no Saved Tab Groups).
  * Chrome/Brave sync bloat caused by tab groups.

### Platform constraints

* You **cannot**:

  * Truly rename a browser window (there’s no API for the OS-level title bar).
  * Apply different Chrome themes per window.
  * Access or control **Saved Tab Groups**.
* You **can**:

  * Create / close / update windows and tabs (`chrome.windows`, `chrome.tabs`).
  * Know which window a tab is in.
  * Inject extension pages into tabs (own UI).
  * Use the extension toolbar icon per tab (`chrome.action.*`).
  * Inject content scripts that modify `document.title` on websites (with normal host permissions).



## 2. Runtime behavior

### 2.1. Workspace-window relationship

**Rule:** At any given time, a workspace is either:

* **Bound** to one normal window (`windowId` stored in `WorkspaceList`), or
* **Unbound** (no open window; just stored state).

**On opening a workspace:**

1. Look up its `windowId` via `Workspace.getWindowId(workspaceId)` / `WorkspaceList`.
2. If `windowId` exists and `windowExists(windowId)`:

   * Focus that window (`chrome.windows.update({ focused: true })`).
   * Done.
3. Else:

   * Create a **new window** with tabs from `workspace.tabs`.
   * Apply pinned/active flags per tab.
   * Associate `workspaceId → new windowId` in `WorkspaceList`.
   * Run *activation hooks* (visual decoration, marker tab, etc.).

**On closing a workspace window (user closes window):**

* `chrome.windows.onRemoved` fires.
* If the window was linked to a workspace:

  * Optionally call `Workspace.sync(windowId)` *before* it’s gone (you may need to rely on tab events; see below).
  * Clear `windowId` for that workspace in `WorkspaceList`.
  * Workspace itself (name, tabs snapshot) remains.

### 2.2. Keeping workspace state in sync

The pattern:

* Every time tabs change in a workspace window, `Workspace.sync(windowId)` updates the workspace model.
* No grouping logic is needed here.

Tabs will now naturally belong to a workspace by virtue of being in that window.

### 2.3. Startup & session restore


* After restart, windows that contain the marker tab will automatically re-bind to the right workspace.
* Windows without marker tabs are treated as “normal” windows, not controlled by the extension (unless user attaches them manually via UI you might add later).

---

## 3. Visual differentiation of workspace windows

We can’t recolor the title bar, but we can combine several mechanisms.

### 3.1. Core idea: “Marker tab” (label tab)

**Concept:**

* For each workspace window, the extension ensures there is a special tab (probably pinned, at index 0) with a URL like:

  * `chrome-extension://<id>/workspace-label.html?ws=<workspaceId>`
* This page:

  * Has title: `Workspace: <Name>` (or just `<Name>`).
  * Sets a favicon that encodes the workspace color and maybe the first letter.
  * Optionally shows some mini-UI (workspace name, controls).

**Behavior details:**

* **On workspace open / new window created:**

  * After `chrome.windows.create`, insert the marker tab (or convert first tab into marker) and pin it.
  * Update `WorkspaceList` with the windowId.
* **On startup / window creation:**

  * In `windows.onCreated` / `tabs.onCreated/tabs.onUpdated`, look for tabs whose URL starts with the label page URL.
  * Parse `workspaceId` from the query/hash.
  * Call `WorkspaceList.update(workspaceId, window.id)`.
* **If user closes or moves the label tab:**

  * `tabs.onRemoved` or `tabs.onUpdated` sees the marker missing for a window that’s bound to a workspace.
  * Optionally re-create it (debounced, to avoid fighting with the user).
  * Or let them hide it and only rely on the extension icon / title prefix.

**How this visually helps:**

* When the label tab is active:

  * The window title bar shows `Workspace: Sales` etc.
  * The tab text shows the workspace name.
* When it’s pinned:

  * Only the favicon is visible on the left, but:

    * The icon can be color-coded and letter-coded by workspace.
    * Hover tooltip shows the full title.
* It also gives you a **reliable, persistent marker** for mapping windows back to workspaces after restarts.

### 3.2. Optional: title prefix injection (aggressive)

**Feature flag, off by default.**

* Content script runs on allowed pages.

* For tabs in a workspace window, it updates `document.title` to:

  * `[Sales] <original title>`

* Keep the “original title” in a variable so you can add/remove the prefix if the tab moves between windows or the workspace name changes.

Pros:

* Most obvious cue: the workspace name appears directly in the tab title and OS window title.

Cons:

* It alters site titles (might mildly affect sites relying on title, but usually harmless).
* Doesn’t work on restricted URLs (`chrome://`, Chrome Web Store, etc.), so indicator is not 100% consistent.

You might want to keep this as an **advanced setting** for power users.
