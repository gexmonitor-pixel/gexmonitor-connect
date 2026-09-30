'use strict';

const CANONICAL_MCP_URL = 'https://gexmonitor.com/api/mcp';
const CANONICAL_MCP_NAME = 'gexmonitor';
const SKILLS_REPO = 'gexmonitor-pixel/gexmonitor-skills';
const SKILL_NAME = 'gexmonitor';

const REQUIRED_SKILL_FILES = [
  'SKILL.md',
  'references/tools.md',
  'references/workflows.md',
  'references/data-contract.md',
  'references/terminology.md'
];

const ERROR_CODES = {
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  SKILLS_CLI_UNAVAILABLE: 'SKILLS_CLI_UNAVAILABLE',
  SKILL_INSTALL_FAILED: 'SKILL_INSTALL_FAILED',
  MCP_CONFIG_FAILED: 'MCP_CONFIG_FAILED',
  CONFIG_PARSE_FAILED: 'CONFIG_PARSE_FAILED',
  MCP_URL_MISMATCH: 'MCP_URL_MISMATCH',
  UNSUPPORTED_CLIENT_VERSION: 'UNSUPPORTED_CLIENT_VERSION',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED'
};

module.exports = {
  CANONICAL_MCP_URL,
  CANONICAL_MCP_NAME,
  SKILLS_REPO,
  SKILL_NAME,
  REQUIRED_SKILL_FILES,
  ERROR_CODES
};
