import Config from "../storage/Config.js"
import Options from "../storage/Options.js"
import { getWorkspaceMarkerUrl, windowExists } from "../util/utils.js"
import Workspace from "../workspace/Workspace.js"
import WorkspaceList from "../workspace/WorkspaceList.js"
import TabSuspendService from "./TabSuspendService.js"

/**
 * Open a workspace.
 * @param {string} workspaceId
 */
async function open(workspaceId) {
    const workspaceWindowId = await Workspace.getWindowId(workspaceId)
    const workspaceWindowExist = await windowExists(workspaceWindowId)
    const currentWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] })
    const currentWorkspaceId = await WorkspaceList.findWorkspaceForWindow(currentWindow.id)

    try {
        await Config.set(Config.Key.OPENING_WORKSPACE, true)
        
        if (workspaceWindowExist) {
            await focusWorkspace(workspaceWindowId)
        } else {
            await openWorkspace(workspaceId, currentWindow)
        }

        await Workspace.activate(workspaceId)

        if (currentWorkspaceId && currentWorkspaceId !== workspaceId) {
            await handleOldWindow(currentWindow)
        }
    } finally {
        await Config.set(Config.Key.OPENING_WORKSPACE, false)
    }
}

async function focusWorkspace(windowId) {
    await chrome.windows.update(windowId, { focused: true })
}

async function openWorkspace(workspaceId, currentWindow) {
    const workspace = await Workspace.get(workspaceId)
    await checkInvalidTabs(workspace)

    const window = await createWorkspaceWindow(workspace, currentWindow)
    await WorkspaceList.update(workspace.id, window.id)
}

async function checkInvalidTabs(workspace) {
    const allowLocalFiles = await chrome.extension.isAllowedFileSchemeAccess()

    if (!allowLocalFiles) {
        const filteredTabs = workspace.tabs.filter(tab => !tab.url.startsWith("file://"))
        const fileTabsCount = workspace.tabs.length - filteredTabs.length
        workspace.tabs = filteredTabs

        if (fileTabsCount > 0) {
            console.warn(`File access not allowed. Cannot open ${fileTabsCount} tabs with local files.`)
        }
    }
}

async function createWorkspaceWindow(workspace, currentWindow) {
    const markerUrl = getWorkspaceMarkerUrl(workspace.id)
    const createArgs = {
        url: [markerUrl, ...workspace.tabs.map(tab => tab.url)],
        focused: true,
    }

    if (currentWindow) {
        if (["maximized", "fullscreen"].includes(currentWindow.state)) {
            createArgs.state = currentWindow.state
        } else {
            createArgs.left = currentWindow.left
            createArgs.top = currentWindow.top
            createArgs.width = currentWindow.width
            createArgs.height = currentWindow.height
        }
    }

    const window = await chrome.windows.create(createArgs)

    if (window.tabs?.[0]) {
        await chrome.tabs.update(window.tabs[0].id, { pinned: true, active: false })
    }

    await updateWindowTabs(workspace, window)

    return window
}

async function updateWindowTabs(workspace, window) {
    const updatePromises = []

    workspace.tabs.forEach(({ url, active = false, pinned = false}, index) => {
        const browserTab = window.tabs[index + 1]
        if (!browserTab) return
        const tabId = browserTab.id

        if (url?.startsWith("http")) {
            TabSuspendService.scheduleSuspend(tabId)
        }

        if (active || pinned) {
            updatePromises.push(chrome.tabs.update(tabId, { active, pinned }))
        }
    })

    await Promise.all(updatePromises)
}

async function handleOldWindow(window) {
    const { otherWorkspaces } = await Options.get()

    if (otherWorkspaces === "minimize") {
        await chrome.windows.update(window.id, { state: "minimized" })
    } else if (otherWorkspaces === "close") {
        await chrome.windows.remove(window.id)
    }
}

export default { open }
