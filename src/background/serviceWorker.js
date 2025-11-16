import "./importLibraries.js"

import Workspace from "../workspace/Workspace.js"
import Config from "../storage/Config.js"
import Action from "../Action.js"
import WorkspaceList from "../workspace/WorkspaceList.js"
import WorkspaceUpdateService from "../service/WorkspaceUpdateService.js"
import MigrationService from "../service/MigrationService.js"
import WorkspaceOpenService from "../service/WorkspaceOpenService.js"
import ContextMenuService from "../service/ContextMenuService.js"
import PermissionsService from "../service/PermissionsService.js"
import Observable from "../util/Observable.js"
import { getUrlParams, isWorkspaceMarkerUrl } from "../util/utils.js"

globalThis.isBackground = true

const { WindowType } = chrome.windows

ContextMenuService.initialize()

chrome.runtime.onMessage.addListener(handleMessage)
chrome.runtime.onInstalled.addListener(handleInstall)
chrome.runtime.onStartup.addListener(handleStartup)
chrome.tabs.onActivated.addListener(handleTabActivate)
chrome.tabs.onCreated.addListener(handleTabCreate)
chrome.tabs.onMoved.addListener(handleTabMove)
chrome.tabs.onRemoved.addListener(handleTabRemove)
chrome.tabs.onUpdated.addListener(handleTabUpdate)
chrome.tabs.onAttached.addListener(handleTabAttach)
chrome.tabs.onDetached.addListener(handleTabDetach)
chrome.windows.onCreated.addListener(handleWindowOpen)
chrome.windows.onRemoved.addListener(handleWindowClose)


async function handleMessage(request, sender, sendResponse) {
	// Always send response
	sendResponse({ status: "ok" })

	switch (request.type) {
		case Action.Type.OPEN_WORKSPACE: {
			await WorkspaceOpenService.open(request.workspaceId)
			break
		}
		case Action.Type.NOTIFY_OBSERVERS: {
			Observable.notify(request.eventName, request.args)
			break
		}
	}

	return true
}

async function handleStartup() {
	await WorkspaceList.initialize()
}

async function handleTabActivate({ windowId, tabId }) {
	const openingWorkspace = await Config.get(Config.Key.OPENING_WORKSPACE)

	if (!openingWorkspace) {
		WorkspaceUpdateService.scheduleUpdate(windowId)
	}
}

async function handleTabCreate(tab) {
	const openingWorkspace = await Config.get(Config.Key.OPENING_WORKSPACE)
	if (openingWorkspace) return

	WorkspaceUpdateService.scheduleUpdate(tab.windowId)
}

async function handleTabMove(tabId, { windowId }) {
	const openingWorkspace = await Config.get(Config.Key.OPENING_WORKSPACE)
	if (openingWorkspace) return

	await WorkspaceUpdateService.update(windowId)
}

async function handleTabRemove(tabId, { windowId, isWindowClosing }) {
	if (isWindowClosing) {
		WorkspaceUpdateService.cancelUpdate(windowId)
	} else {
		await WorkspaceUpdateService.update(windowId)
	}
}

async function handleTabUpdate(tabId, changeInfo, tab) {
	const openingWorkspace = await Config.get(Config.Key.OPENING_WORKSPACE)
	if (openingWorkspace) return

	if ("url" in changeInfo || "pinned" in changeInfo) {
		PermissionsService.checkLocalFileAccess(tab)
		WorkspaceUpdateService.scheduleUpdate(tab.windowId)
	}
}

async function handleTabAttach(tabId, attachInfo) {
	WorkspaceUpdateService.scheduleUpdate(attachInfo.newWindowId)
}

async function handleTabDetach(tabId, { oldWindowId }) {
	WorkspaceUpdateService.scheduleUpdate(oldWindowId)
}

async function handleWindowOpen(window) {
	const openingWorkspace = await Config.get(Config.Key.OPENING_WORKSPACE)

	if (window.type !== WindowType.NORMAL) return
	if (openingWorkspace) return

	const workspaceId = await findWorkspaceForWindowByMarker(window.id)
	if (workspaceId) {
		await WorkspaceList.update(workspaceId, window.id)
	}
}

async function handleWindowClose(windowId) {
	const workspaceId = await WorkspaceList.findWorkspaceForWindow(windowId)
	if (workspaceId) {
		await Config.set(Config.Key.LAST_WORKSPACE_ID, workspaceId)
		await WorkspaceList.update(workspaceId, null)
	}
}

async function handleInstall({ reason, previousVersion }) {
	if (reason === "update") {
		await MigrationService.migrate({
			previousVersion: previousVersion
		})
	}

	if (reason === "install") {
		await chrome.tabs.create({
			url: chrome.runtime.getURL("src/pages/welcome/welcome.html")
		})
	}
}

// ----------------------------------------------------------------------------

async function findWorkspaceForWindowByMarker(windowId) {
	if (!windowId) return null

	const tabs = await chrome.tabs.query({ windowId })
	const markerTabs = tabs.filter((tab) => isWorkspaceMarkerUrl(tab.url ?? tab.pendingUrl))

	if (markerTabs.length === 0) {
		return null
	}

	if (markerTabs.length > 1) {
		console.warn(`Multiple workspace markers found in window ${windowId}. Using the first marker.`)
	}

	for (const markerTab of markerTabs) {
		const params = getUrlParams(markerTab.url ?? markerTab.pendingUrl ?? "")
		const workspaceId = params.workspaceId
		if (!workspaceId) continue

		const workspace = await Workspace.get(workspaceId)
		if (workspace) {
			return workspace.id
		}
	}

	return null
}
