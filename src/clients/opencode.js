'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseClient = require('./base');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME } = require('../constants');
const { parseJson, formatJson } = require('../utils/json');
const { safeMutateFile } = require('../utils/config');

class OpenCodeClient extends BaseClient {
  constructor() {
    super('opencode', 'OpenCode');
  }

  getConfigDir(env = process.env) {
    const configHome = env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, '.config') : '');
    return path.join(configHome, 'opencode');
  }

  getOpenCodeJsonPath(env = process.env) {
    const dir = this.getConfigDir(env);
    const jsonc = path.join(dir, 'opencode.jsonc');
    if (fs.existsSync(jsonc)) {
      return jsonc;
    }
    return path.join(dir, 'opencode.json');
  }

  async detect(env = process.env) {
    const evidence = [];

    // 1. Check CLI in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where opencode' : 'which opencode';
      const bin = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
      if (bin) {
        evidence.push(`Executable found at ${bin}`);
      }
    } catch {
      // Ignored
    }

    // 2. Check config directory
    const configDir = this.getConfigDir(env);
    if (fs.existsSync(configDir)) {
      evidence.push(`Config directory found at ${configDir}`);
    }

    return {
      detected: evidence.length > 0,
      evidence
    };
  }

  getSkillTargetDir(env = process.env) {
    return path.join(this.getConfigDir(env), 'skills', 'gexmonitor');
  }

  getSkillAdapterArg() {
    return 'opencode';
  }

  getSkillsCliFlags() {
    return ['-g', '-y', '--copy'];
  }

  getMcpConfigPath(env = process.env) {
    return this.getOpenCodeJsonPath(env);
  }

  async readMcpConfig(env = process.env) {
    const configPath = this.getOpenCodeJsonPath(env);
    if (!fs.existsSync(configPath)) {
      return { hasServer: false, url: null, rawConfig: null };
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const data = parseJson(raw);
      // OpenCode stores MCP under root 'mcp'
      const server = data?.mcp?.[CANONICAL_MCP_NAME];
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

    // 1. Try official CLI registration if opencode executable is available
    let cliSucceeded = false;
    try {
      execSync(`opencode mcp add ${CANONICAL_MCP_NAME} --url ${CANONICAL_MCP_URL}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env
      });
      cliSucceeded = true;
    } catch {
      cliSucceeded = false;
    }

    if (cliSucceeded) {
      const postState = await this.readMcpConfig(env);
      if (postState.hasServer && postState.url === CANONICAL_MCP_URL) {
        return { success: true, method: 'official-cli' };
      }
    }

    // 2. Direct config mutation fallback
    const configPath = this.getOpenCodeJsonPath(env);
    safeMutateFile(
      configPath,
      (currentContent) => {
        let data = {};
        if (currentContent) {
          data = parseJson(currentContent);
        }
        if (!data.mcp || typeof data.mcp !== 'object') {
          data.mcp = {};
        }
        data.mcp[CANONICAL_MCP_NAME] = {
          type: 'remote',
          url: CANONICAL_MCP_URL
        };
        return formatJson(data);
      },
      (newContent) => {
        const parsed = parseJson(newContent);
        return parsed?.mcp?.[CANONICAL_MCP_NAME]?.url === CANONICAL_MCP_URL;
      }
    );

    return { success: true, method: 'config-mutation' };
  }

  getRestartNotice() {
    return 'Start a new session in OpenCode to load GEX Monitor.';
  }
}

module.exports = OpenCodeClient;
