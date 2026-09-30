'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseClient = require('./base');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME, REQUIRED_SKILL_FILES } = require('../constants');
const { parseJson, formatJson } = require('../utils/json');
const { safeMutateFile } = require('../utils/config');

class OpenClawClient extends BaseClient {
  constructor() {
    super('openclaw', 'OpenClaw / Memoh');
  }

  getHomeDir(env = process.env) {
    return env.HOME || process.env.USERPROFILE || '';
  }

  getStateDir(env = process.env) {
    const home = this.getHomeDir(env);
    const openclawDir = path.join(home, '.openclaw');
    if (fs.existsSync(openclawDir)) return openclawDir;
    const clawdbotDir = path.join(home, '.clawdbot');
    if (fs.existsSync(clawdbotDir)) return clawdbotDir;
    return openclawDir;
  }

  getConfigPath(env = process.env) {
    const home = this.getHomeDir(env);
    const openclawJson = path.join(home, '.openclaw', 'openclaw.json');
    if (fs.existsSync(openclawJson)) return openclawJson;

    const clawdbotJson = path.join(home, '.clawdbot', 'clawdbot.json');
    if (fs.existsSync(clawdbotJson)) return clawdbotJson;

    const legacyOpenclawClawdbot = path.join(home, '.openclaw', 'clawdbot.json');
    if (fs.existsSync(legacyOpenclawClawdbot)) return legacyOpenclawClawdbot;

    return openclawJson;
  }

  async detect(env = process.env) {
    const evidence = [];
    const home = this.getHomeDir(env);

    // 1. Check CLI in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where openclaw' : 'which openclaw';
      const bin = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
      if (bin) {
        evidence.push(`Executable found at ${bin}`);
      }
    } catch {
      // Ignored
    }

    // 2. Check ~/.openclaw or ~/.clawdbot directory
    const stateDir = this.getStateDir(env);
    if (fs.existsSync(stateDir)) {
      evidence.push(`State directory found at ${stateDir}`);
    }

    // 3. Check config file
    const configPath = this.getConfigPath(env);
    if (fs.existsSync(configPath)) {
      evidence.push(`Configuration found at ${configPath}`);
    }

    // 4. Check Memoh container environment (/data/skills)
    if (!env.IS_TEST) {
      const memohSkillsDir = path.join('/data', 'skills');
      if (fs.existsSync(memohSkillsDir)) {
        evidence.push(`Memoh container skills directory found at ${memohSkillsDir}`);
      }
    }

    return {
      detected: evidence.length > 0,
      evidence
    };
  }

  getSkillTargetDir(env = process.env) {
    const stateDir = this.getStateDir(env);
    return path.join(stateDir, 'skills', 'gexmonitor');
  }

  getSkillAdapterArg() {
    return 'openclaw';
  }

  getSkillsCliFlags() {
    return ['-y', '--copy'];
  }

  getMcpConfigPath(env = process.env) {
    return this.getConfigPath(env);
  }

  async readMcpConfig(env = process.env) {
    const configPath = this.getConfigPath(env);
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

    const configPath = this.getConfigPath(env);
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

  async verifySkill(env = process.env) {
    const primaryResult = await super.verifySkill(env);
    if (!primaryResult.installed) {
      // Check if installed in Memoh /data/skills
      const memohDir = path.join('/data', 'skills', 'gexmonitor');
      if (fs.existsSync(memohDir)) {
        const missing = [];
        for (const rel of REQUIRED_SKILL_FILES) {
          const p = path.join(memohDir, rel);
          if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
            missing.push(rel);
          }
        }
        if (missing.length === 0) {
          return { installed: true, missingFiles: [] };
        }
      }
    }
    return primaryResult;
  }

  getRestartNotice() {
    return 'GEX Monitor is installed. Start a new session to load the Skill.';
  }
}

module.exports = OpenClawClient;
