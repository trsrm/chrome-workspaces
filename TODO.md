# v0.7
- [x] Restore full-screen window (Issue #15)
- [x] Option to keep workspaces sorted by name (Issue #19)
- [x] file:// stops entire workspace from opening (Issue #29)
- [x] Import & export (Issue #18)
- [x] Mark open workspaces in the list
  
# v0.8
- [ ] Remove TabGroups support. 
    > Make workspaces to be purely an extension feature:
    > - Stored in extension storage (as they already are).
    > - Bound to browser windows (1 workspace - 0 or 1 windows).
    > 
    > The extension:
    > - Opens workspaces into windows.
    > - Tracks tabs inside those windows.
    > - Updates the saved state as tabs change.
    > - Recovers workspace/window mappings on browser restart without relying on tab groups.

# Future Backlog
- [ ] Dark theme
- [ ] Get rid of chrome-extension-async lib
- [ ] Show confirmation dialog before cleaning existing Tab Groups
- [ ] Synchronization
- [ ] Translations
- [ ] Show dialog to remove workspace when the last tab is closed
- [ ] Intro video
- [ ] Show info page instead of blank tab in empty workspace
- [ ] New window - offer to create a workspace
- [ ] Consider supporting multiple windows
