# Connect GEX Monitor to your AI

One command to install the **GEX Monitor Skill** and configure the **Remote MCP** endpoint across your AI clients.

## Install

```bash
npx gexmonitor-connect
```

That's it. Your AI client is automatically detected and configured.

---

## Supported AI Clients

| Client | Skill Support | MCP Method | First Use Auth |
| :--- | :--- | :--- | :--- |
| **Claude Code** | Global Skill (`~/.claude/skills`) | Official CLI / `~/.claude.json` | Browser OAuth |
| **OpenAI Codex** | Global Skill (`~/.codex/skills`) | `~/.codex/config.toml` | Browser OAuth |
| **Cursor** | Global Skill (`~/.cursor/skills`) | `~/.cursor/mcp.json` | Browser OAuth |
| **OpenCode** | Global Skill (`~/.config/opencode/skills`) | Official CLI / `opencode.json` | Browser OAuth |
| **OpenClaw / Memoh** | Global Skill (`~/.openclaw/skills`) | `~/.openclaw/openclaw.json` | Browser OAuth |

---

## What It Does

1. **Detects AI client**: Locates supported environments on your machine.
2. **Installs GEX Monitor Skill**: Adds domain workflows and options knowledge from [`gexmonitor-skills`](https://github.com/gexmonitor-pixel/gexmonitor-skills).
3. **Registers Remote MCP**: Connects to the canonical live research tools endpoint (`https://gexmonitor.com/api/mcp`).
4. **Preserves Existing Config**: Safely updates only the `gexmonitor` entry, preserving all existing MCP servers and client settings.
5. **Zero Token Handling**: The installer never touches, asks for, or stores OAuth tokens or client secrets. Authentication happens naturally via your AI client on first live request.

---

## Usage & Options

```bash
# Default interactive or single-client setup
npx gexmonitor-connect

# Preview actions without modifying any files
npx gexmonitor-connect --dry-run

# Target a specific client
npx gexmonitor-connect --client claude-code
npx gexmonitor-connect --client codex
npx gexmonitor-connect --client cursor
npx gexmonitor-connect --client opencode
npx gexmonitor-connect --client openclaw

# Non-interactive mode (automatically configure all detected clients)
npx gexmonitor-connect --yes

# Advanced options
npx gexmonitor-connect --skip-skill    # Configure MCP only
npx gexmonitor-connect --skip-mcp      # Install Skill only
npx gexmonitor-connect --verbose       # Show debug output
```

---

## After Installation

1. Start a new session or reload your AI client window.
2. Ask your AI:
   > "Use GEX Monitor to analyze BTC market structure."
3. On your first live query, your AI client may open a browser window for a one-time GEX Monitor login.

---

## Canonical Resources

- **Skill Repository**: [gexmonitor-pixel/gexmonitor-skills](https://github.com/gexmonitor-pixel/gexmonitor-skills)
- **Production Remote MCP Endpoint**: `https://gexmonitor.com/api/mcp`
- **Documentation**: [gexmonitor.com](https://gexmonitor.com)

## License

MIT © GEX Monitor
