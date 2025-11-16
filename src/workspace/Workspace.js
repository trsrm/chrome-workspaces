import { assert } from "../util/assert.js"
import { randomString } from "../util/utils.js"
import WorkspaceList from "./WorkspaceList.js"
import WorkspaceTab from "./WorkspaceTab.js"
import Storage from "../storage/Storage.js"
import Observable from "../util/Observable.js"

/**
 * @typedef {'grey'|'blue'|'red'|'yellow'|'green'|'pink'|'purple'|'cyan'} WorkspaceColor
 */

/**
 * @typedef {Object} Workspace
 * @property {string} id
 * @property {string} name
 * @property {WorkspaceColor} color
 * @property {WorkspaceTab[]} tabs
 */

const Workspace = {
	onUpdate: new Observable("Workspace.onUpdate"),

	/**
	 * Create and save a new workspace.
	 * @param {Object} args
	 * @param {string} args.name Title of the workspace
	 * @param {WorkspaceColor} args.color Color of the workspace
	 * @param {WorkspaceTab[]} [args.tabs] List of the workspace tabs
	 * @param {number} [args.windowId] Window ID of the workspace
	 * @returns {Promise<Workspace>}
	 */
	async create({ name, color, tabs, windowId }) {
		if (windowId) {
			tabs = await WorkspaceTab.createAllFromWindow(windowId)
		}
		if (!tabs || tabs.length === 0) {
			tabs = [WorkspaceTab.createEmpty()]
		}

		const workspaceId = await generateWorkspaceId()
		const workspace = { id: workspaceId, name, color, tabs }

		await WorkspaceList.add(workspaceId, windowId)
		await Workspace.save(workspace)

		return workspace
	},

	/**
	 * Update workspace properties.
	 * @param {string} workspaceId ID of the workspace
	 * @param {Object} props Updated properties
	 * @param {string} [props.name] Title of the workspace
	 * @param {WorkspaceColor} [props.color] Color of the workspace
	 */
	 async update(workspaceId, props) {
		const workspace = await Workspace.get(workspaceId)
		if (!workspace) return

		if (["name", "color"].some((prop) => prop in props && props[prop] !== workspace[prop])) {
			await Workspace.save({ ...workspace, ...props })
		}

		await Workspace.onUpdate.notify(workspaceId)
	 },

	/**
	 * Legacy hook kept for compatibility with existing calls.
	 * Tab groups have been removed, so activating a workspace is now a no-op.
	 */
	async activate() {},

	/**
	 * Legacy hook kept for compatibility with existing calls.
	 * Without tab groups there is nothing to deactivate.
	 */
	async deactivate() {},

	/**
	 * Get workspace by ID.
	 * @param {string} workspaceId
 	 * @returns {Promise<Workspace|null>}
	 */
	async get(workspaceId) {
		return await Storage.get(workspaceId)
	},

	/**
	 * Save changes to an existing workspace.
	 * @param {Workspace} workspace
	 */
	async save(workspace) {
		assert(Array.isArray(workspace.tabs))
		assert(workspace.tabs.every(tab => typeof tab === "object"))

		await Storage.set(workspace.id, workspace)
	},

	/**
	 * Remove workspace by ID.
	 * @param {string} workspaceId
	 */
	async remove(workspaceId) {
		await WorkspaceList.remove(workspaceId)
		await Storage.remove(workspaceId)
	},

	/**
	 * Sync window changes to workspace.
	 * @param {number} windowId
	 */
	async sync(windowId) {
		if (!windowId) return

		const workspaceId = await WorkspaceList.findWorkspaceForWindow(windowId)
		if (!workspaceId) return

		const workspace = await Workspace.get(workspaceId)
		if (!workspace) return

		// Workspace ownership is per-window: every tab currently open in the
		// window belongs to this workspace snapshot (WorkspaceTab filters out
		// internal marker tabs before persisting).
		const tabs = await chrome.tabs.query({ windowId })
		workspace.tabs = tabs.map(WorkspaceTab.create).filter(Boolean)

		await Workspace.save(workspace)
	},

	/**
	 * Get a browser window ID associated with the workspace
	 * @param {string} workspaceId
	 */
	async getWindowId(workspaceId) {
		return await WorkspaceList.findWindowForWorkspace(workspaceId)
	},

	/**
	 * Legacy helper retained for API compatibility.
	 * Always returns null because tab groups are no longer used.
	 */
	async getGroupId() {
		return null
	}
}

async function generateWorkspaceId(attempt = 0) {
	const workspaceId = `${Storage.Key.WORKSPACE_PREFIX}${randomString(8)}`
	const existingWorkspace = await Workspace.get(workspaceId)

	if (existingWorkspace) {
		if (attempt < 10) {
			return await generateWorkspaceId(attempt + 1)
		} else {
			throw new Error(`Could not generate unique workspace ID: ${workspaceId}`)
		}
	}

	return workspaceId
}

export default Workspace
