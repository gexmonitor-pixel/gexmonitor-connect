'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CodexClient = require('../src/clients/codex');
const ClaudeCodeClient = require('../src/clients/claude-code');
const OpenCodeClient = require('../src/clients/opencode');
const OpenClawClient = require('../src/clients/openclaw');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME } = require('../src/constants');
const { findTomlMcpServer, updateTomlMcpServer } = require('../src/utils/toml');
const { parseJson } = require('../src/utils/json');

function createSandbox(name = 'adapter-test') {
  const tmpBase = os.tmpdir();
  const dir = fs.mkdtempSync(path.join(tmpBase, `${name}-`));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  };
}

test('Codex: TOML configuration creation and mutation', async () => {
  const sandbox = createSandbox('codex-toml');
  try {
    const fakeHome = sandbox.dir;
    const client = new CodexClient();
    const fakeEnv = { CODEX_HOME: fakeHome, HOME: fakeHome };

    // Initially no config.toml exists
    const res1 = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res1.success, true);

    const configPath = client.getConfigTomlPath(fakeEnv);
    assert.ok(fs.existsSync(configPath));
    const tomlContent = fs.readFileSync(configPath, 'utf8');
    const server = findTomlMcpServer(tomlContent, CANONICAL_MCP_NAME);
    assert.equal(server.exists, true);
    assert.equal(server.url, CANONICAL_MCP_URL);

    // Verify MCP check
    const verify = await client.verifyMcp(fakeEnv);
    assert.equal(verify.configured, true);

    // Idempotent second call
    const res2 = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res2.alreadyConfigured, true);
  } finally {
    sandbox.cleanup();
  }
});

test('Claude Code: JSON configuration creation and preservation', async () => {
  const sandbox = createSandbox('claude-json');
  try {
    const fakeHome = sandbox.dir;
    const client = new ClaudeCodeClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    // Pre-populate with other settings
    const configPath = client.getClaudeJsonPath(fakeEnv);
    fs.writeFileSync(configPath, JSON.stringify({
      projects: {
        '/some/proj': { allowedTools: ['bash'] }
      },
      mcpServers: {
        existingServer: { type: 'http', url: 'https://existing.dev/mcp' }
      }
    }, null, 2));

    const res = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res.success, true);

    const afterRaw = fs.readFileSync(configPath, 'utf8');
    const afterData = parseJson(afterRaw);
    assert.ok(afterData.projects['/some/proj']);
    assert.equal(afterData.mcpServers.existingServer.url, 'https://existing.dev/mcp');
    assert.equal(afterData.mcpServers[CANONICAL_MCP_NAME].url, CANONICAL_MCP_URL);
  } finally {
    sandbox.cleanup();
  }
});

test('OpenCode: JSON/JSONC configuration with "mcp" root key', async () => {
  const sandbox = createSandbox('opencode-json');
  try {
    const fakeHome = sandbox.dir;
    const client = new OpenCodeClient();
    const configDir = path.join(fakeHome, '.config', 'opencode');
    fs.mkdirSync(configDir, { recursive: true });
    const fakeEnv = { HOME: fakeHome, XDG_CONFIG_HOME: path.join(fakeHome, '.config') };

    // Pre-populate with comments (JSONC)
    const jsoncPath = path.join(configDir, 'opencode.jsonc');
    fs.writeFileSync(jsoncPath, `{\n  // OpenCode config\n  "model": "deepseek",\n  "mcp": {\n    "myTool": { "type": "remote", "url": "https://tool.com" }\n  }\n}\n`);

    const res = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res.success, true);

    const afterRaw = fs.readFileSync(jsoncPath, 'utf8');
    const afterData = parseJson(afterRaw);
    assert.equal(afterData.model, 'deepseek');
    assert.equal(afterData.mcp.myTool.url, 'https://tool.com');
    assert.equal(afterData.mcp[CANONICAL_MCP_NAME].url, CANONICAL_MCP_URL);
  } finally {
    sandbox.cleanup();
  }
});

test('OpenClaw: openclaw.json configuration', async () => {
  const sandbox = createSandbox('openclaw-json');
  try {
    const fakeHome = sandbox.dir;
    const client = new OpenClawClient();
    const openclawDir = path.join(fakeHome, '.openclaw');
    fs.mkdirSync(openclawDir, { recursive: true });
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const configPath = path.join(openclawDir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify({
      identity: { name: 'Assistant' },
      mcpServers: {
        weather: { command: 'weather-cli' }
      }
    }, null, 2));

    const res = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res.success, true);

    const afterRaw = fs.readFileSync(configPath, 'utf8');
    const afterData = parseJson(afterRaw);
    assert.equal(afterData.identity.name, 'Assistant');
    assert.ok(afterData.mcpServers.weather);
    assert.equal(afterData.mcpServers[CANONICAL_MCP_NAME].url, CANONICAL_MCP_URL);
  } finally {
    sandbox.cleanup();
  }
});
