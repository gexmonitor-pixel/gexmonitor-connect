'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseClient = require('./base');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME } = require('../constants');
const { findTomlMcpServer, updateTomlMcpServer, validateTomlBasic } = require('../utils/toml');
const { safeMutateFile } = require('../utils/config');

class CodexClient extends BaseClient {
  constructor() {
    super('codex', 'OpenAI Codex');
  }

  getHomeDir(env = process.env) {
    return env.CODEX_HOME || (env.HOME ? path.join(env.HOME, '.codex') : '');
  }

  getConfigTomlPath(env = process.env) {
    return path.join(this.getHomeDir(env), 'config.toml');
  }

  async detect(env = process.env) {
    const evidence = [];
    const codexHome = this.getHomeDir(env);
    const userHome = env.HOME || process.env.USERPROFILE || '';

    // 1. Check CLI in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where codex' : 'which codex';
      const codexBin = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
      if (codexBin) {
        evidence.push(`Executable found at ${codexBin}`);
      }
    } catch {
      // Ignored
    }

    // 2. Check config.toml
    const configPath = this.getConfigTomlPath(env);
    if (fs.existsSync(configPath)) {
      evidence.push(`Configuration found at ${configPath}`);
    }

    // 3. Check codex directory
    if (fs.existsSync(codexHome)) {
      evidence.push(`Directory found at ${codexHome}`);
    }

    return {
      detected: evidence.length > 0,
      evidence
    };
  }

  getSkillTargetDir(env = process.env) {
    return path.join(this.getHomeDir(env), 'skills', 'gexmonitor');
  }

  getSkillAdapterArg() {
    return 'codex';
  }

  getSkillsCliFlags() {
    return ['-g', '-y', '--copy'];
  }

  getMcpConfigPath(env = process.env) {
    return this.getConfigTomlPath(env);
  }

  async readMcpConfig(env = process.env) {
    const configPath = this.getConfigTomlPath(env);
    if (!fs.existsSync(configPath)) {
      return { hasServer: false, url: null, rawConfig: null };
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const server = findTomlMcpServer(raw, CANONICAL_MCP_NAME);
      return {
        hasServer: server.exists,
        url: server.url,
        rawConfig: raw
      };
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

    const configPath = this.getConfigTomlPath(env);
    safeMutateFile(
      configPath,
      (currentContent) => {
        const base = currentContent || '';
        return updateTomlMcpServer(base, CANONICAL_MCP_NAME, { url: CANONICAL_MCP_URL });
      },
      (newContent) => {
        if (!validateTomlBasic(newContent)) return false;
        const s = findTomlMcpServer(newContent, CANONICAL_MCP_NAME);
        return s.exists && s.url === CANONICAL_MCP_URL;
      }
    );

    return { success: true, method: 'config-mutation' };
  }

  getRestartNotice() {
    return 'Start a new session in Codex to load the GEX Monitor Skill and MCP tools.';
  }
}

module.exports = CodexClient;
