import Workspace from "../../workspace/Workspace.js"
import WorkspaceColor from "../../workspace/WorkspaceColor.js"
import Options from "../../storage/Options.js"
import { getUrlParams } from "../../util/utils.js"

const params = getUrlParams(window.location.href)
const workspaceId = params.workspaceId

async function initialize() {
    if (!workspaceId) {
        renderError("Missing workspace information")
        return
    }

    const [workspace, options] = await Promise.all([
        Workspace.get(workspaceId),
        Options.get()
    ])
    if (!workspace) {
        renderError("Workspace not found")
        return
    }

    renderWorkspace(workspace, options)
}

function renderWorkspace(workspace, options) {
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

	const showLetter = shouldShowMarkerLetter(options)
	updateFavicon(color, workspace.name, showLetter)
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

function shouldShowMarkerLetter(options) {
	const preference = options?.[Options.Key.MARKER_ICON_LETTER] ?? "enabled"
	return preference !== "disabled"
}

function updateFavicon(colorHex, workspaceName = "", showLetter = true) {
	const canvas = document.createElement("canvas")
	canvas.width = 64
	canvas.height = 64
	const ctx = canvas.getContext("2d")
	if (!ctx) return

	drawRoundedRect(ctx, {
		x: 0,
		y: 0,
		width: 64,
		height: 64,
		radius: 14,
		color: colorHex
	})

	if (showLetter) {
		const letter = workspaceName?.trim()?.charAt(0)?.toUpperCase() || "?"
		ctx.fillStyle = getContrastingTextColor(colorHex)
		ctx.font = "bold 36px Inter, 'Segoe UI', sans-serif"
		ctx.textAlign = "center"
		ctx.textBaseline = "middle"
		ctx.fillText(letter, 32, 34)
	}

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

function getContrastingTextColor(hexColor) {
	if (!hexColor) return "#ffffff"
	const normalized = hexColor.replace("#", "")
	const bigint = parseInt(normalized, 16)
	const r = (bigint >> 16) & 255
	const g = (bigint >> 8) & 255
	const b = bigint & 255
	const luminance = 0.299 * r + 0.587 * g + 0.114 * b
	return luminance > 170 ? "#111111" : "#ffffff"
}
