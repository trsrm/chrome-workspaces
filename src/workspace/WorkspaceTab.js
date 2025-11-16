import { isWorkspaceMarkerUrl } from "../util/utils.js"

/**
 * @typedef {Object} WorkspaceTab
 * @property {?string} title
 * @property {?string} url
 * @property {?boolean} pinned
 * @property {?boolean} active
 */

const WorkspaceTab = {
	/**
	 * Create a new workspace tab from a browser tab.
	 * @param tab Browser tab
	 * @returns {WorkspaceTab|null}
	 */
	create(tab) {
		const url = tab.url ?? tab.pendingUrl

		if (isWorkspaceMarkerUrl(url)) {
			return null
		}

		const workspaceTab = {
			title: tab.title?.slice(0, 40),
			url
		}
		if (tab.pinned) {
			workspaceTab.pinned = true
		}
		if (tab.active) {
			workspaceTab.active = true
		}

		return workspaceTab
	},

	/**
	 * Create workspace tabs from given browser window. 
	 * @param windowId Window ID
	 * @returns {Promise<WorkspaceTab[]>}
	 */
	async createAllFromWindow(windowId) {
		const tabs = await chrome.tabs.query({ windowId })

		return tabs.map(WorkspaceTab.create).filter(Boolean)
	},

	/**
	 * Create empty workspace tab.
	 * @returns {WorkspaceTab}
	 */
	createEmpty() {
		return WorkspaceTab.create({
			url: "chrome://newtab/"
		})
	}
}

export default WorkspaceTab
