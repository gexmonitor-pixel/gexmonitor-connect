'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseClient = require('./base');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME } = require('../constants');
const { parseJson, formatJson } = require('../utils/json');
const { safeMutateFile } = require('../utils/config');

class ClaudeCodeClient extends BaseClient {
  constructor() {
    super('claude-code', 'Claude Code');
  }

  getHomeDir(env = process.env) {
    return env.HOME || process.env.USERPROFILE || '';
  }

  getClaudeJsonPath(env = process.env) {
    return path.join(this.getHomeDir(env), '.claude.json');
  }

  async detect(env = process.env) {
    const evidence = [];
    const home = this.getHomeDir(env);

    // 1. Check CLI in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where claude' : 'which claude';
      const claudeBin = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
      if (claudeBin) {
        evidence.push(`Executable found at ${claudeBin}`);
      }
    } catch {
      // Ignored
    }

    // 2. Check ~/.claude.json
    const configPath = this.getClaudeJsonPath(env);
    if (fs.existsSync(configPath)) {
      evidence.push(`Configuration found at ${configPath}`);
    }

    // 3. Check ~/.claude directory
    const claudeDir = path.join(home, '.claude');
    if (fs.existsSync(claudeDir)) {
      evidence.push(`Directory found at ${claudeDir}`);
    }

    return {
      detected: evidence.length > 0,
      evidence
    };
  }

  getSkillTargetDir(env = process.env) {
    return path.join(this.getHomeDir(env), '.claude', 'skills', 'gexmonitor');
  }

  getSkillAdapterArg() {
    return 'claude-code';
  }

  getSkillsCliFlags() {
    return ['-g', '-y', '--copy'];
  }

  getMcpConfigPath(env = process.env) {
    return this.getClaudeJsonPath(env);
  }

  async readMcpConfig(env = process.env) {
    const configPath = this.getClaudeJsonPath(env);
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

    // Attempt official CLI registration if claude CLI is available
    let cliSucceeded = false;
    try {
      execSync(`claude mcp add -s user --transport http ${CANONICAL_MCP_NAME} ${CANONICAL_MCP_URL}`, {
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

    // Direct config mutation fallback
    const configPath = this.getClaudeJsonPath(env);
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
          type: 'http',
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
    return 'Start a new session in Claude Code to load GEX Monitor.';
  }
}

module.exports = ClaudeCodeClient;
