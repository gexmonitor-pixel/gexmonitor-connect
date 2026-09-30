'use strict';

const fs = require('fs');
const path = require('path');
const { CANONICAL_MCP_URL, REQUIRED_SKILL_FILES } = require('../constants');

class BaseClient {
  constructor(id, displayName) {
    this.id = id;
    this.displayName = displayName;
  }

  /**
   * Evidence-based detection.
   * @param {Record<string, any>} env 
   * @returns {Promise<{ detected: boolean, evidence: string[] }>}
   */
  async detect(env) {
    throw new Error('detect() must be implemented');
  }

  /**
   * Target directory where the skill is located.
   * @param {Record<string, any>} env 
   * @returns {string}
   */
  getSkillTargetDir(env) {
    throw new Error('getSkillTargetDir() must be implemented');
  }

  /**
   * Agent flag for `npx skills add -a <flag>`.
   * @returns {string}
   */
  getSkillAdapterArg() {
    return this.id;
  }

  /**
   * Flags passed to `skills add`.
   * @returns {string[]}
   */
  getSkillsCliFlags() {
    return ['-g', '-y', '--copy'];
  }

  /**
   * Path to the MCP configuration file if applicable.
   * @param {Record<string, any>} env 
   * @returns {string | null}
   */
  getMcpConfigPath(env) {
    return null;
  }

  /**
   * Verifies that the skill is installed and all required reference files exist.
   * @param {Record<string, any>} env 
   * @returns {Promise<{ installed: boolean, missingFiles: string[] }>}
   */
  async verifySkill(env) {
    const skillDir = this.getSkillTargetDir(env);
    if (!fs.existsSync(skillDir)) {
      return { installed: false, missingFiles: ['directory not found'] };
    }

    const missingFiles = [];
    for (const relFile of REQUIRED_SKILL_FILES) {
      const fullPath = path.join(skillDir, relFile);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push(relFile);
      } else {
        const stat = fs.statSync(fullPath);
        if (stat.size === 0) {
          missingFiles.push(`${relFile} (empty)`);
        }
      }
    }

    return {
      installed: missingFiles.length === 0,
      missingFiles
    };
  }

  /**
   * Inspects current MCP configuration.
   * @param {Record<string, any>} env 
   * @returns {Promise<{ hasServer: boolean, url: string | null }>}
   */
  async readMcpConfig(env) {
    throw new Error('readMcpConfig() must be implemented');
  }

  /**
   * Registers canonical MCP server.
   * @param {{ dryRun?: boolean, yes?: boolean, verbose?: boolean }} options 
   * @param {Record<string, any>} env 
   * @returns {Promise<{ success: boolean, alreadyConfigured?: boolean, urlMismatch?: boolean, existingUrl?: string, method: string }>}
   */
  async configureMcp(options, env) {
    throw new Error('configureMcp() must be implemented');
  }

  /**
   * Verifies that the MCP server is configured with the canonical URL.
   * @param {Record<string, any>} env 
   * @returns {Promise<{ configured: boolean, url: string | null }>}
   */
  async verifyMcp(env) {
    const state = await this.readMcpConfig(env);
    return {
      configured: state.hasServer && state.url === CANONICAL_MCP_URL,
      url: state.url
    };
  }

  /**
   * Instructions for session reload or restart.
   * @returns {string}
   */
  getRestartNotice() {
    return 'Start a new session to load GEX Monitor.';
  }
}

module.exports = BaseClient;
