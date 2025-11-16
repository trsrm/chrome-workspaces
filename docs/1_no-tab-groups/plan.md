## Task 1 — Remove Tab Group dependency

**Title**: Remove chrome.tabGroups usage and make workspaces window-only

**Context**

The extension currently uses Chrome Tab Groups as an internal marker for workspaces (`Workspace.activate/deactivate/getGroupId`, `handleTabGroupCreate/Update`, `addTabToGroup`, `findMatchingWorkspace`, and `"tabGroups"` permission). Chrome/Brave now persist tab groups, which leads to duplicated groups and bugs. We want to stop using tab groups entirely and rely only on windows + stored workspace data.

**Goal**

Refactor the extension so it **no longer uses tab groups at all**, while keeping basic workspace behavior working:

* Workspaces still open in their own windows.
* Tabs in those windows are still saved/restored.
* Workspace list / context menu still work.

**Scope / Files to inspect**

* `manifest.json` (permissions) 
* `src/background/serviceWorker.js` (event handlers, tabGroups listeners) 
* `src/workspace/Workspace.js` — `activate`, `deactivate`, `getGroupId`, `save` 
* Any other file referencing `chrome.tabGroups`.

**What to change**

1. **Remove `"tabGroups"` permission** from `manifest.json`.
2. In `serviceWorker.js`:

   * Remove `chrome.tabGroups.onCreated.addListener` and `chrome.tabGroups.onUpdated.addListener`.
   * Remove `handleTabGroupCreate`, `handleTabGroupUpdate`, `addTabToGroup`, `findMatchingWorkspace`.
   * Simplify `handleTabCreate` / `handleTabUpdate` so they no longer try to add tabs to a group — they should now only schedule workspace syncs.
   * Simplify `handleWindowOpen` to no longer call `findMatchingWorkspace`. For now, a newly opened window should **not** be auto-bound to a workspace based on tab groups.
3. In `Workspace.js`:

   * Remove or stub out `getGroupId`, `activate`, `deactivate` and any `chrome.tabGroups` usage.
   * Adjust `save()` so it only writes to storage and **does not** touch tab groups.
   * Ensure `remove()` no longer calls `deactivate()` (or make `deactivate()` a no-op) so tab ungrouping is not necessary.

**Constraints**

* Don’t introduce new features yet; this is a behavior-preserving refactor (minus visual tab groups).
* Keep public function signatures (like `Workspace.activate(workspaceId)`) for now if other parts call them; they can become no-ops.

**Acceptance criteria**

* The project builds and the extension loads without `"tabGroups"` permission.
* No remaining references to `chrome.tabGroups` in the codebase.
* Opening/closing a workspace still:

  * Creates a dedicated window with the workspace tabs.
  * Saves tab state as before (via `Workspace.sync` / `WorkspaceUpdateService`).
* No runtime errors in the console related to missing tab group APIs.

---

## Task 2 — Make Workspace syncing robust without tab groups

**Title**: Ensure Workspace.sync uses only windows/tabs, no tab-group assumptions

**Context**

After removing tab group usage, `Workspace.sync` must still correctly save the set of opened tabs for each workspace just by windowId. The logic currently assumes “all tabs in a workspace window belong to that workspace”, which is still fine, but we should double-check it doesn’t rely on groupId.

**Goal**

Confirm and tighten the `Workspace.sync()` logic so saving/restoring workspaces does not depend on tab groups.

**Scope / Files**

* `src/workspace/Workspace.js` (`sync`, `getWindowId`) 
* `src/workspace/WorkspaceList.js` (`findWorkspaceForWindow`, `findWindowForWorkspace`, `initialize`) 
* `src/service/WorkspaceUpdateService.js` 

**What to change**

1. Verify `Workspace.sync(windowId)`:

   * Uses `WorkspaceList.findWorkspaceForWindow(windowId)`.
   * Queries `chrome.tabs.query({ windowId })`.
   * Maps tabs via `WorkspaceTab.create`.
2. Confirm there’s no remaining assumption that some tabs are “inside a group” vs not.
3. Double-check `WorkspaceList.initialize()`:

   * It currently clears all `windowId`s on startup. That’s OK for now (we’ll re-attach windows later using markers), but make sure it still runs correctly and doesn’t use tab group APIs.
4. Where helpful, add small comments indicating that “all tabs in a given window belong to the workspace associated with that window”.

**Constraints**

* No new behavior; this task is mainly to make the post-tab-groups world explicit and safe.
* Avoid functional changes to `WorkspaceUpdateService` unless absolutely necessary.

**Acceptance criteria**

* The extension still automatically syncs workspace tabs when:

  * Tabs are created, moved, removed, or updated.
* There’s no leftover reference to tab groups in workspace syncing.
* Code is easy to understand for “window-only” workspaces (thanks to comments).

---

## Task 3 — Introduce workspace marker URL and ignore it in syncing

**Title**: Add internal workspace marker tab support (URL + filtering)

**Context**

We want a **marker tab** per workspace window so we can a) visually differentiate workspace windows and b) detect them later (e.g. after browser restart) without relying on tab groups. First step: define a marker URL pattern and make sure saving logic **ignores** marker tabs so they don’t pollute workspace history.

**Goal**

* Define a special marker URL like:
  `chrome-extension://…/src/pages/workspace-marker/workspace-marker.html?workspaceId=…`
* Make `WorkspaceTab` / `Workspace.sync` filter out this URL so markers are never stored in `workspace.tabs`.

**Scope / Files**

* `src/util/utils.js` (already has `getUrlParams`) 
* `src/workspace/WorkspaceTab.js` 
* `src/workspace/Workspace.js` (`sync`) 

**What to change**

1. Add a small helper or constant describing the marker URL prefix, e.g. in `utils.js` or a new `WorkspaceConstants.js`:

   * Something like `const WORKSPACE_MARKER_PATH = "src/pages/workspace-marker/workspace-marker.html"`.
2. Extend `WorkspaceTab.create(tab)` (or the place where we map from tab to workspace tab) to:

   * **Skip** any tab whose `url` starts with the marker URL (or has `workspaceId` param on that path).
3. Ensure `Workspace.sync(windowId)`:

   * Uses the updated `WorkspaceTab.create` so marker tabs are filtered out.
   * Does not accidentally set a marker tab as pinned/active workspace tab.

**Constraints**

* Don’t create the marker page yet; just assume it will exist and filter by URL prefix.
* Keep the filtering logic robust: ignore both fully loaded `url` and possible `pendingUrl` if needed.

**Acceptance criteria**

* Marker URL constant is defined in a single place.
* If a window had a fake tab with that marker URL, calling `Workspace.sync` would **not** include it in saved workspace tabs.
* No behavior regression for normal tabs.

---

## Task 4 — Use marker tab when opening a workspace window

**Title**: Prepend workspace marker tab on workspace open

**Context**

We now have a marker URL pattern; we need to actually create a marker tab when opening a workspace so that each workspace window has a clear “label tab” (leftmost / pinned).

**Goal**

When a workspace is opened via `WorkspaceOpenService.open`:

* The created window has a **first tab** that loads the marker URL with `workspaceId` in the query.
* The rest of the tabs correspond to the workspace’s stored tabs.
* The marker tab can later be used to detect which workspace a window belongs to.

**Scope / Files**

* `src/service/WorkspaceOpenService.js` (`createWorkspaceWindow`, `updateWindowTabs`) 
* `src/workspace/Workspace.js` / marker constants if needed.

**What to change**

1. In `createWorkspaceWindow(workspace, currentWindow)`:

   * Build `createArgs.url` as:
     `[markerUrlFor(workspace.id), ...workspace.tabs.map(tab => tab.url)]`
2. Update `updateWindowTabs(workspace, window)`:

   * Remember that `window.tabs[0]` is the marker.
   * Iterate over `workspace.tabs` and map them to `window.tabs[index + 1]` (offset by +1).
   * Apply `active`/`pinned` flags only to non-marker tabs.
3. Optionally make the marker tab pinned & inactive:

   * After window creation, call `chrome.tabs.update(markerTabId, { pinned: true, active: false })`.

**Constraints**

* Keep existing behavior for window geometry (position, size, maximized/fullscreen) intact.
* Don’t alter existing `Options` logic (`otherWorkspaces` minimize/close) in this task.

**Acceptance criteria**

* Opening a workspace now creates:

  * A first tab with the marker URL.
  * All workspace tabs after it.
* The user’s previously active workspace tab is still active (not the marker).
* Maker tab is not stored in workspace tabs (thanks to Task 3).

---

## Task 5 — Re-attach windows to workspaces via marker tabs

**Title**: Detect workspace windows using marker tabs on window open

**Context**

On startup or session restore, Chrome/Brave may reopen windows that contain our marker tabs. We want to recognize those windows and re-bind them to their corresponding workspaces, instead of treating them as anonymous windows.

**Goal**

When a browser window is created (`chrome.windows.onCreated`), if that window contains a marker tab, the extension should:

* Read `workspaceId` from the marker URL.
* Call `WorkspaceList.update(workspaceId, window.id)` to associate them.
* This replaces the old `findMatchingWorkspace` tab-group logic.

**Scope / Files**

* `src/background/serviceWorker.js` (`handleWindowOpen`) 
* `src/util/utils.js` (`getUrlParams`) 
* Marker URL constant from Task 3.

**What to change**

1. Replace the old `findMatchingWorkspace(window)` implementation with a new one:

   * Query tabs for `window.id`.
   * Look for a tab whose URL matches the marker path.
   * Use `getUrlParams` to extract `workspaceId`.
   * Verify that `Workspace.get(workspaceId)` exists.
2. In `handleWindowOpen(window)`:

   * Ignore non-`normal` windows as before.
   * If `OPENING_WORKSPACE` flag is set, allow the existing behavior (we already call `WorkspaceList.update` in `WorkspaceOpenService` after creating the window, so this may be a no-op).
   * If not opening a workspace, but a marker tab is found, call `WorkspaceList.update(workspaceId, window.id)`.
3. Ensure we keep `handleWindowClose` behavior unchanged (it still clears `windowId` and updates `LAST_WORKSPACE_ID`). 

**Constraints**

* Be careful to handle the case where multiple markers exist (shouldn’t normally happen): choose the first or log a warning.
* Don’t fetch or mutate `Workspace` tabs inside `handleWindowOpen`; we only need to restore the association.

**Acceptance criteria**

* After a browser restart, if Chrome restores a workspace window (with the marker tab):

  * The extension recognizes which workspace it belongs to.
  * The workspace item in the popup is marked as “open” (same as today when opened via extension).
* No more dependency on tab groups for window–workspace matching.

---

## Task 6 — Create a simple workspace marker page (visual indicator)

**Title**: Implement `workspace-marker` HTML page that shows workspace name

**Context**

The marker tab should also give a **visual cue**: “You’re in workspace X”. Right now we only have a URL; we need an actual page that uses workspace metadata and looks like a small dashboard card.

**Goal**

Create a minimal extension page that:

* Shows the workspace name (and optionally color).
* Indicates that this window is tied to that workspace.
* Has a distinctive favicon and title text, so the tab is easily identifiable in the tab strip.

**Scope / Files**

* New files, e.g.:

  * `src/pages/workspace-marker/workspace-marker.html`
  * `src/pages/workspace-marker/workspace-marker.js`
  * `src/pages/workspace-marker/workspace-marker.css` (optional)
* Existing modules:

  * `src/workspace/Workspace.js` (for `Workspace.get`) 
  * `src/util/utils.js` (`getUrlParams`) 

**What to change**

1. HTML:

   * Basic layout with a `<div>` where the workspace name will be rendered.
   * Include a `<link rel="icon">` pointing to an existing extension icon, or a small colored icon.
   * `<title>` like `Workspace – <name>` (updated dynamically from JS).
2. JS (module script):

   * Parse `workspaceId` from `location.search`.
   * Call `Workspace.get(workspaceId)` to fetch workspace data.
   * Render:

     * Name.
     * A colored badge/label using `Workspace.color` mapped to a hex color (you can reuse `WorkspaceColor`). 
   * Update `document.title` to something like `Workspace: <name>`.
3. (Optional) CSS:

   * Small clean layout with background color derived from workspace color.
4. Ensure the path matches the marker URL used in Tasks 3–5.

**Constraints**

* Don’t add any interactive functionality yet; just show static info.
* Keep styling minimal and consistent with existing extension style.

**Acceptance criteria**

* When you manually open a marker URL in a tab (with a valid `workspaceId`), the page:

  * Shows the workspace name.
  * Has a title `Workspace: <name>`.
  * Uses the workspace color for some accent.
* Marker tab is visually distinctive in the tab bar.

---

## Task 7 — Add extension badge indicator for active workspace

**Title**: Use action badge to show current workspace name/code

**Context**

Besides the marker tab, we want the extension icon itself to hint which workspace is active. Chrome allows a short badge text on the action icon.

**Goal**

When a tab is active in a workspace window:

* The extension action badge shows a short workspace label (e.g. `G`, `PRJ`, or `#`).
* When the active tab is not part of any workspace window, the badge is cleared.

**Scope / Files**

* `src/background/serviceWorker.js` (tab/window events) 
* `src/workspace/WorkspaceList.js` (`findWorkspaceForWindow`) 
* `src/workspace/Workspace.js` (to get workspace name).

**What to change**

1. In the background script, add a helper like `updateBadgeForActiveTab(tabId, windowId)`:

   * Find `workspaceId` via `WorkspaceList.findWorkspaceForWindow(windowId)`.
   * If found, load workspace and derive a short label:

     * e.g. first 2–3 uppercase letters of workspace name.
   * Use `chrome.action.setBadgeText` and `chrome.action.setBadgeBackgroundColor` (color mapping from `WorkspaceColor`).
   * If not found, clear the badge text.
2. Call this helper on:

   * `chrome.tabs.onActivated` (we already listen).
   * `chrome.windows.onFocusChanged` (optional improvement).
3. Make sure marker tabs are treated like any other tab; the workspace is window-level anyway.

**Constraints**

* Badge text must be very short (max 3–4 characters).
* Don’t introduce new options/settings yet; use a simple, deterministic label.

**Acceptance criteria**

* When you focus a workspace window:

  * The badge shows a label derived from its workspace name.
* When you focus a non-workspace window:

  * The badge becomes empty.
* No badge flicker or console errors while switching tabs/windows.

---

## Task 8 — Update docs and tests to reflect window-only mode

**Title**: Adjust README and Test Plan for “no tab groups” design

**Context**

Docs and tests still talk about “tab groups” as the main visible artifact of a workspace. We’ve replaced this with a dedicated window plus a marker tab and badge.

**Goal**

Update documentation so future work (and your own memory 😄) matches the new behavior.

**Scope / Files**

* `README.md` (top-level description) 
* `test/Test Plan.md` (manual test scenarios) 
* Any text that mentions tab groups as a UX feature (`src/pages/welcome/welcome.html`). 

**What to change**

1. README:

   * Replace “tab group” references with “dedicated browser window with a workspace marker tab”.
   * Add a short section describing the new visual indicators (marker tab + action badge).
2. Test Plan:

   * Update steps like “EXP new tab group…” to “EXP new window with workspace marker tab and the saved tabs”.
   * Update “Indicate open workspaces” to reflect how open workspaces are shown now (list markings still apply; plus optional mention of marker/badge as additional cues).
3. Welcome page:

   * Adjust the paragraph that says “Tab Groups are not supported” so it’s still true, but no longer hints that they’re used internally. Now they’re simply irrelevant.

**Acceptance criteria**

* No references remain to “tab groups are used to mark individual Workspaces”.
* Docs clearly describe:

  * Workspaces = windows.
  * Workspace marker tab.
  * (Optional) Badge indicator.