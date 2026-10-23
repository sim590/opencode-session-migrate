# opencode-session-migrate

A [opencode](https://opencode.ai) TUI plugin to migrate sessions between projects and rescue orphaned sessions.

## DEVELOPMENT STOPPED

Version 2.0 of opencode introduced `/cd` command and lets the users retrieve all their sessions from all projects within the session dialog using `ctrl-a`. This pluing is now redered obsolete and will no longer be maintained. It is still available for download, but it may not work with future versions of opencode.

## Features

- List sessions across **all** projects, not just the current one.
- Detect orphaned sessions (directory no longer exists on disk, or a global session whose directory lives inside a known project worktree).
- Migrate a session to another project, worktree, or your home directory.
- Migrate child (forked) sessions along with the parent.

## Requirements

- opencode `>=2.0.0` (CLI plugin API)

## OpenCode v1

The `1.x` line targets the OpenCode v2 plugin API and is **not compatible with OpenCode v1**. The last release supporting OpenCode v1 is **0.2.1**.

If you are still on OpenCode v1, install that exact version:

```sh
opencode plugin -g opencode-session-migrate@0.2.1
```

Or pin it in your `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-session-migrate@0.2.1"]
}
```

Pin the exact version. OpenCode only checks *unpinned* packages for updates and skips exact npm versions when updating, so `@0.2.1` will not drift to `latest` (`1.x`, which requires OpenCode v2). An unpinned entry, on the other hand, resolves to `latest`.

## Installation

### CLI plugin

```sh
opencode plugin add github:sim590/opencode-session-migrate
```

Alternatively, add the package to `cli.json` (global config at `~/.config/opencode/cli.json`, or `$XDG_CONFIG_HOME/opencode/cli.json`):

```json
{
  "$schema": "https://opencode.ai/cli.json",
  "plugins": ["opencode-session-migrate"]
}
```

To configure options, use the object form:

```json
{
  "$schema": "https://opencode.ai/cli.json",
  "plugins": [
    {
      "package": "opencode-session-migrate",
      "options": { "enabled": true, "keybind": "alt+m", "debug": false }
    }
  ]
}
```

See the [CLI plugins documentation](https://opencode.ai/v2/docs/cli/plugins) for configuration details.

Restart opencode after changing your config.

## Usage

- Press `alt+m` anywhere, or run `/migrate` (or find "Migrate sessions" in the command palette).
- Pick a session, then a destination: the current project, your home directory, or any other project.

> `alt+m` ("M" for *Migrate*) is the default because OpenCode v2 already uses `ctrl+o` for its built-in "open menu".

## Options

| Option    | Type    | Default    | Description                                              |
|-----------|---------|------------|----------------------------------------------------------|
| `enabled` | boolean | `true`     | Set to `false` to disable the plugin.                    |
| `keybind` | string  | `"alt+m"`  | Key binding that opens the migrate dialog.               |
| `debug`   | boolean | `false`    | Write debug logs to `/tmp/opencode-session-migrate.log`. |

## How it works

- Sessions across projects are listed through the V2 API. Orphans are detected client-side by checking whether each session's directory still exists on disk, or whether a global session's directory lives inside a known project canonical directory.
- Migration uses the native `session.move` endpoint (`POST /api/session/{sessionID}/move`) rather than writing directly to SQLite. Child sessions are moved too, and migration refreshes the session and project caches.

## Limitations

- The built-in select does not support a colored gutter, so orphaned sessions are marked with a leading `!` in the title.
- The `alt+m` hint does not appear in the built-in session list footer (the plugin API does not allow extending it). Use the command palette or `/migrate` if you forget the binding.

## License

MIT
