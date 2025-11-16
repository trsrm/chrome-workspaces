import Workspace from "../workspace/Workspace.js";

const windowsToSync = new Set()
const refreshPeriod = 200 // ms
let refreshTimer = null

function scheduleUpdate(windowId) {
	if (!windowId) return

	windowsToSync.add(windowId)

	if (!refreshTimer) {
		refreshTimer = setTimeout(updateScheduled, refreshPeriod)
	}
}

function cancelUpdate(windowId) {
	if (!windowId) return

	windowsToSync.delete(windowId)
}

async function updateScheduled() {
	const windowList = Array.from(windowsToSync)
	refreshTimer = null
	windowsToSync.clear()

	await Promise.all(windowList.map(update))
}

async function update(windowId) {
	if (!windowId) return

	windowsToSync.delete(windowId)

	await Workspace.sync(windowId)
}

export default { scheduleUpdate, cancelUpdate, update }
