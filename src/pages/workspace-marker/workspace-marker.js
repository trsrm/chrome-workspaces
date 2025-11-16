import Workspace from "../../workspace/Workspace.js"
import WorkspaceColor from "../../workspace/WorkspaceColor.js"
import { getUrlParams } from "../../util/utils.js"

const params = getUrlParams(window.location.href)
const workspaceId = params.workspaceId

async function initialize() {
    if (!workspaceId) {
        renderError("Missing workspace information")
        return
    }

    const workspace = await Workspace.get(workspaceId)
    if (!workspace) {
        renderError("Workspace not found")
        return
    }

    renderWorkspace(workspace)
}

function renderWorkspace(workspace) {
	const title = `Workspace: ${workspace.name}`
	document.title = title

	const nameElement = document.getElementById("workspace-name")
    if (nameElement) {
        nameElement.textContent = workspace.name
    }

	const badgeElement = document.getElementById("workspace-badge")
	const color = WorkspaceColor[workspace.color] ?? WorkspaceColor.grey

	if (badgeElement) {
		badgeElement.style.background = color
	}

	updateFavicon(color, workspace.name)
}

function renderError(message) {
	document.title = "Workspace"
    const nameElement = document.getElementById("workspace-name")
    if (nameElement) {
        nameElement.textContent = message
    }
}

initialize().catch((error) => {
	console.error("workspace-marker", error)
	renderError("Error loading workspace")
})

function updateFavicon(colorHex, workspaceName = "") {
	const canvas = document.createElement("canvas")
	canvas.width = 64
	canvas.height = 64
	const ctx = canvas.getContext("2d")
	if (!ctx) return

	drawRoundedRect(ctx, {
		x: 2,
		y: 2,
		width: 60,
		height: 60,
		radius: 14,
		color: colorHex
	})

	const letter = workspaceName?.trim()?.charAt(0)?.toUpperCase() || "?"
	ctx.fillStyle = "#ffffff"
	ctx.font = "bold 30px Inter, 'Segoe UI', sans-serif"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillText(letter, 32, 34)

	const dataUrl = canvas.toDataURL("image/png")
	let link = document.querySelector("link[rel*='icon']")
	if (!link) {
		link = document.createElement("link")
		link.rel = "icon"
		document.head.appendChild(link)
	}
	link.href = dataUrl
}

function drawRoundedRect(ctx, { x, y, width, height, radius, color }) {
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + width - radius, y)
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
	ctx.lineTo(x + width, y + height - radius)
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
	ctx.lineTo(x + radius, y + height)
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
	ctx.lineTo(x, y + radius)
	ctx.quadraticCurveTo(x, y, x + radius, y)
	ctx.closePath()
	ctx.fill()
}
