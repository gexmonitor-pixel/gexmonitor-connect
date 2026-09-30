'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseClient = require('./base');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME } = require('../constants');
const { parseJson, formatJson } = require('../utils/json');
const { safeMutateFile } = require('../utils/config');

class CursorClient extends BaseClient {
  constructor() {
    super('cursor', 'Cursor');
  }

  getHomeDir(env = process.env) {
    return env.HOME || process.env.USERPROFILE || '';
  }

  getCursorDir(env = process.env) {
    return path.join(this.getHomeDir(env), '.cursor');
  }

  getMcpConfigPath(env = process.env) {
    return path.join(this.getCursorDir(env), 'mcp.json');
  }

  async detect(env = process.env) {
    const evidence = [];
    const home = this.getHomeDir(env);

    // 1. Check CLI in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where cursor' : 'which cursor';
      const cursorBin = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
      if (cursorBin) {
        evidence.push(`Executable found at ${cursorBin}`);
      }
    } catch {
      // Ignored
    }

    // 2. Check Applications on macOS or Linux/Windows
    const appPaths = [
      path.join(home, 'Applications', 'Cursor.app')
    ];
    if (!env.IS_TEST && process.platform === 'darwin') {
      appPaths.unshift('/Applications/Cursor.app');
    }
    for (const app of appPaths) {
      if (fs.existsSync(app)) {
        evidence.push(`Application found at ${app}`);
        break;
      }
    }

    // 3. Check ~/.cursor directory
    const cursorDir = this.getCursorDir(env);
    if (fs.existsSync(cursorDir)) {
      evidence.push(`Directory found at ${cursorDir}`);
    }

    // 4. Check system App Support / config
    const supportDirs = [
      path.join(home, 'Library', 'Application Support', 'Cursor'),
      path.join(home, '.config', 'Cursor')
    ];
    for (const d of supportDirs) {
      if (fs.existsSync(d)) {
        evidence.push(`Data directory found at ${d}`);
        break;
      }
    }

    return {
      detected: evidence.length > 0,
      evidence
    };
  }

  getSkillTargetDir(env = process.env) {
    return path.join(this.getCursorDir(env), 'skills', 'gexmonitor');
  }

  getSkillAdapterArg() {
    return 'cursor';
  }

  getSkillsCliFlags() {
    return ['-g', '-y', '--copy'];
  }

  async readMcpConfig(env = process.env) {
    const configPath = this.getMcpConfigPath(env);
    if (!fs.existsSync(configPath)) {
      return { hasServer: false, url: null, rawConfig: null };
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const data = parseJson(raw);
      const server = data?.mcpServers?.[CANONICAL_MCP_NAME];
      if (server) {
        return {
          hasServer: true,
          url: server.url || null,
          rawConfig: data
        };
      }
      return { hasServer: false, url: null, rawConfig: data };
    } catch {
      return { hasServer: false, url: null, rawConfig: null };
    }
  }

  async configureMcp(options = {}, env = process.env) {
    const state = await this.readMcpConfig(env);
    if (state.hasServer && state.url === CANONICAL_MCP_URL) {
      return { success: true, alreadyConfigured: true, method: 'config' };
    }

    if (state.hasServer && state.url && state.url !== CANONICAL_MCP_URL && !options.yes) {
      return {
        success: false,
        urlMismatch: true,
        existingUrl: state.url,
        method: 'config'
      };
    }

    if (options.dryRun) {
      return { success: true, method: 'dry-run' };
    }

    const configPath = this.getMcpConfigPath(env);
    safeMutateFile(
      configPath,
      (currentContent) => {
        let data = {};
        if (currentContent) {
          data = parseJson(currentContent);
        }
        if (!data.mcpServers || typeof data.mcpServers !== 'object') {
          data.mcpServers = {};
        }
        data.mcpServers[CANONICAL_MCP_NAME] = {
          url: CANONICAL_MCP_URL
        };
        return formatJson(data);
      },
      (newContent) => {
        const parsed = parseJson(newContent);
        return parsed?.mcpServers?.[CANONICAL_MCP_NAME]?.url === CANONICAL_MCP_URL;
      }
    );

    return { success: true, method: 'config-mutation' };
  }

  getRestartNotice() {
    return 'Reload Cursor window (Cmd+Shift+P -> "Developer: Reload Window") or start a new composer session.';
  }
}

module.exports = CursorClient;
