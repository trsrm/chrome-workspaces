export function randomString(length) {
	return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

export function getUrlParams(url) {
	return Object.fromEntries(
		url.split("?")[1].split("&").map(keyValue => keyValue.split("="))
	);
}

export const WORKSPACE_MARKER_PATH = "src/pages/workspace-marker/workspace-marker.html"

let workspaceMarkerUrlPrefix

function getWorkspaceMarkerUrlPrefix() {
	if (!workspaceMarkerUrlPrefix) {
		if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
			workspaceMarkerUrlPrefix = chrome.runtime.getURL(WORKSPACE_MARKER_PATH)
		} else {
			workspaceMarkerUrlPrefix = WORKSPACE_MARKER_PATH
		}
	}

	return workspaceMarkerUrlPrefix
}

export function isWorkspaceMarkerUrl(url) {
	if (!url) return false

	try {
		return url.startsWith(getWorkspaceMarkerUrlPrefix())
	} catch {
		return false
	}
}

/**
 * Returns true if the browser window exists, false otherwise.
 * @returns {Promise<boolean>}
 */
export async function windowExists(windowId) {
	if (!windowId) return false

	try {
		await chrome.windows.get(windowId)
		return true
	} catch {
		return false
	}
}
