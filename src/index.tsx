import { Plugin } from "@opencode/plugin/tui"
import type { Project, SessionInfo } from "@opencode/client"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const GLOBAL_PROJECT = "global"
const LOG_FILE = "/tmp/opencode-session-migrate.log"
type PluginContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

let debug = false

function debugLog(...args: unknown[]): void {
  if (!debug) return
  const line = args.map((value) => (typeof value === "string" ? value : formatError(value))).join(" ")
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // Best-effort logging; never crash the plugin.
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function isOrphan(session: SessionInfo, projects: Project[]): boolean {
  const directory = session.location?.directory
  if (!directory || !fs.existsSync(directory)) return true
  if (session.projectID !== GLOBAL_PROJECT) return false

  return projects.some((project) => {
    const canonical = project.canonical
    return canonical !== "/" && (directory === canonical || directory.startsWith(canonical + path.sep))
  })
}

async function loadAllSessions(context: PluginContext): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = []
  let cursor: string | undefined

  for (let iteration = 0; iteration < 50; iteration++) {
    const result = await context.client.session.list({ limit: 200, cursor })
    sessions.push(...result.data)
    cursor = result.cursor.next ?? undefined
    if (!cursor) break
  }

  return sessions
}

async function openMigrateDialog(context: PluginContext): Promise<void> {
  debugLog("openMigrateDialog: start")

  try {
    const [sessions, projects] = await Promise.all([
      loadAllSessions(context),
      context.client.project.list(),
    ])
    debugLog(`openMigrateDialog: sessions=${sessions.length} projects=${projects.length}`)

    const projectNames = new Map(projects.map((project) => [project.id, project.name || project.canonical]))
    const orphans = new Set(sessions.filter((session) => isOrphan(session, projects)).map((session) => session.id))

    const selectedID = await context.ui.dialog.select({
      title: "Migrate Session",
      placeholder: "Search sessions",
      options: sessions.map((session) => ({
        title: `${orphans.has(session.id) ? "! " : ""}${session.title ?? session.id}`,
        value: session.id,
        description: session.location.directory,
        footer: formatTime(session.time.updated),
        category: projectNames.get(session.projectID) ?? session.projectID,
      })),
    })
    if (selectedID === undefined) return

    const session = sessions.find((item) => item.id === selectedID)
    if (!session) return

    const locationDirectory = context.location?.directory
    let current: Project | undefined
    try {
      const location = locationDirectory
        ? await context.client.location.get({ location: { directory: locationDirectory } })
        : await context.client.location.get()
      current = projects.find((project) => project.id === location.project.id)
    } catch (error) {
      debugLog("openMigrateDialog: failed to resolve current project", error)
    }
    if (!current && locationDirectory) {
      current = projects.find((project) => project.canonical === locationDirectory)
    }

    const currentDestination = current
      ? {
          title: current.name || current.canonical,
          value: { directory: locationDirectory ?? current.canonical },
          description: locationDirectory ?? current.canonical,
          category: "Current",
        }
      : undefined

    const destinations: Array<{ title: string; value: { directory: string }; description?: string; category?: string }> = [
      ...(currentDestination ? [currentDestination] : []),
      {
        title: "Home (~)",
        value: { directory: os.homedir() },
        description: os.homedir(),
        category: "Special",
      },
      ...projects
        .filter((project) => project.id !== current?.id && project.id !== GLOBAL_PROJECT)
        .map((project) => ({
          title: project.name || project.canonical,
          value: { directory: project.canonical },
          description: project.canonical,
          category: "Projects",
        })),
    ]

    const destination = await context.ui.dialog.select({
      title: `Migrate: ${session.title ?? session.id}`,
      placeholder: "Choose destination",
      options: destinations,
    })
    if (!destination) return

    const children = new Map<string, SessionInfo[]>()
    for (const candidate of sessions) {
      if (!candidate.parentID) continue
      const siblings = children.get(candidate.parentID) ?? []
      siblings.push(candidate)
      children.set(candidate.parentID, siblings)
    }

    const ordered: SessionInfo[] = []
    const visited = new Set<string>()
    const visit = (parent: SessionInfo): void => {
      if (visited.has(parent.id)) return
      visited.add(parent.id)
      ordered.push(parent)
      for (const child of children.get(parent.id) ?? []) visit(child)
    }
    visit(session)

    try {
      for (const item of ordered) {
        await context.client.session.move({ sessionID: item.id, directory: destination.directory })
      }
    } catch (error) {
      debugLog("migration failed", error)
      context.ui.toast.show({ variant: "error", title: "Migration failed", message: formatError(error) })
      return
    }

    for (const item of ordered) context.data.session.invalidate(item.id)
    context.data.project.invalidate()
    context.ui.toast.show({
      variant: "success",
      title: "Migration complete",
      message: `Moved ${ordered.length} session${ordered.length === 1 ? "" : "s"} to ${destination.directory}`,
    })
    debugLog(`migration complete: ${ordered.map((item) => item.id).join(",")}`)
    await openMigrateDialog(context)
  } catch (error) {
    debugLog("openMigrateDialog: error", error)
    context.ui.toast.show({ variant: "error", title: "Migration failed", message: formatError(error) })
  }
}

export default Plugin.define({
  id: "session-migrate",
  setup(context) {
    if (context.options.enabled === false) return

    debug = context.options.debug === true
    const key = typeof context.options.keybind === "string" ? context.options.keybind : "alt+m"
    debugLog("plugin: init", `keybind=${key}`)

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "session-migrate.open",
          title: "Migrate sessions",
          group: "Plugin",
          bind: key,
          palette: true,
          slash: { name: "migrate" },
          run: () => {
            debugLog("command: session-migrate.open triggered")
            void openMigrateDialog(context)
          },
        },
      ],
      bindings: ["session-migrate.open"],
    }))
  },
})
