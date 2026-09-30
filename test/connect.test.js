'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { run, parseArgs } = require('../src/index');
const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME, REQUIRED_SKILL_FILES, ERROR_CODES } = require('../src/constants');
const { detectClients } = require('../src/detect');
const { getClientById, getAllClients } = require('../src/clients');
const CursorClient = require('../src/clients/cursor');
const CodexClient = require('../src/clients/codex');
const ClaudeCodeClient = require('../src/clients/claude-code');
const OpenCodeClient = require('../src/clients/opencode');
const OpenClawClient = require('../src/clients/openclaw');
const { safeMutateFile } = require('../src/utils/config');
const { parseJson, formatJson } = require('../src/utils/json');
const { findTomlMcpServer, updateTomlMcpServer, validateTomlBasic } = require('../src/utils/toml');

function createSandbox(name = 'gex-test') {
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

function mockSkillFiles(skillDir) {
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# GEX Monitor Skill\n');
  fs.writeFileSync(path.join(skillDir, 'references', 'tools.md'), '# Tools\n');
  fs.writeFileSync(path.join(skillDir, 'references', 'workflows.md'), '# Workflows\n');
  fs.writeFileSync(path.join(skillDir, 'references', 'data-contract.md'), '# Data Contract\n');
  fs.writeFileSync(path.join(skillDir, 'references', 'terminology.md'), '# Terminology\n');
}

test('1. zero detected clients', async () => {
  const sandbox = createSandbox('zero-clients');
  try {
    const fakeEnv = {
      HOME: sandbox.dir,
      USERPROFILE: sandbox.dir,
      PATH: '',
      IS_TEST: 'true',
      XDG_CONFIG_HOME: path.join(sandbox.dir, '.config')
    };

    const { detected } = await detectClients(fakeEnv);
    assert.equal(detected.length, 0, 'Should detect 0 clients in empty sandbox');

    const exitCode = await run([], fakeEnv);
    assert.equal(exitCode, 1, 'CLI should exit with code 1 when no clients detected');
  } finally {
    sandbox.cleanup();
  }
});

test('2. one detected client', async () => {
  const sandbox = createSandbox('one-client');
  try {
    const fakeHome = sandbox.dir;
    fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });

    const fakeEnv = {
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PATH: '',
      IS_TEST: 'true',
      XDG_CONFIG_HOME: path.join(fakeHome, '.config')
    };

    const { detected } = await detectClients(fakeEnv);
    assert.equal(detected.length, 1);
    assert.equal(detected[0].client.id, 'cursor');
  } finally {
    sandbox.cleanup();
  }
});

test('3. multiple detected clients', async () => {
  const sandbox = createSandbox('multi-clients');
  try {
    const fakeHome = sandbox.dir;
    fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.codex', 'config.toml'), '# codex\n');
    fs.writeFileSync(path.join(fakeHome, '.claude.json'), '{}\n');

    const fakeEnv = {
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PATH: '',
      IS_TEST: 'true',
      XDG_CONFIG_HOME: path.join(fakeHome, '.config')
    };

    const { detected } = await detectClients(fakeEnv);
    assert.ok(detected.length >= 3);
    const ids = detected.map(d => d.client.id);
    assert.ok(ids.includes('cursor'));
    assert.ok(ids.includes('codex'));
    assert.ok(ids.includes('claude-code'));
  } finally {
    sandbox.cleanup();
  }
});

test('4. dry-run no mutation', async () => {
  const sandbox = createSandbox('dry-run');
  try {
    const fakeHome = sandbox.dir;
    fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });

    const fakeEnv = {
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PATH: '',
      IS_TEST: 'true',
      XDG_CONFIG_HOME: path.join(fakeHome, '.config')
    };

    const filesBefore = fs.readdirSync(path.join(fakeHome, '.cursor'));
    const exitCode = await run(['--dry-run', '--yes'], fakeEnv);
    assert.equal(exitCode, 0);

    const filesAfter = fs.readdirSync(path.join(fakeHome, '.cursor'));
    assert.deepEqual(filesBefore, filesAfter, 'Dry run must not create any files');
  } finally {
    sandbox.cleanup();
  }
});

test('5. existing Skill', async () => {
  const sandbox = createSandbox('existing-skill');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const skillDir = client.getSkillTargetDir(fakeEnv);
    mockSkillFiles(skillDir);

    const verify = await client.verifySkill(fakeEnv);
    assert.equal(verify.installed, true);
    assert.equal(verify.missingFiles.length, 0);
  } finally {
    sandbox.cleanup();
  }
});

test('6. existing correct MCP', async () => {
  const sandbox = createSandbox('existing-mcp');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const mcpConfigPath = client.getMcpConfigPath(fakeEnv);
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(mcpConfigPath, JSON.stringify({
      mcpServers: {
        [CANONICAL_MCP_NAME]: {
          url: CANONICAL_MCP_URL
        }
      }
    }, null, 2));

    const state = await client.readMcpConfig(fakeEnv);
    assert.equal(state.hasServer, true);
    assert.equal(state.url, CANONICAL_MCP_URL);

    const configureRes = await client.configureMcp({}, fakeEnv);
    assert.equal(configureRes.success, true);
    assert.equal(configureRes.alreadyConfigured, true);
  } finally {
    sandbox.cleanup();
  }
});

test('7. existing wrong MCP URL', async () => {
  const sandbox = createSandbox('wrong-url');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const mcpConfigPath = client.getMcpConfigPath(fakeEnv);
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(mcpConfigPath, JSON.stringify({
      mcpServers: {
        [CANONICAL_MCP_NAME]: {
          url: 'https://staging.gexmonitor.com/mcp'
        }
      }
    }, null, 2));

    // Without --yes
    const resNoYes = await client.configureMcp({ yes: false }, fakeEnv);
    assert.equal(resNoYes.success, false);
    assert.equal(resNoYes.urlMismatch, true);
    assert.equal(resNoYes.existingUrl, 'https://staging.gexmonitor.com/mcp');

    // With --yes
    const resYes = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(resYes.success, true);

    const stateAfter = await client.readMcpConfig(fakeEnv);
    assert.equal(stateAfter.url, CANONICAL_MCP_URL);
  } finally {
    sandbox.cleanup();
  }
});

test('8. config with multiple unrelated MCP servers', async () => {
  const sandbox = createSandbox('multi-mcp');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const mcpConfigPath = client.getMcpConfigPath(fakeEnv);
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(mcpConfigPath, JSON.stringify({
      theme: 'dark',
      mcpServers: {
        postgres: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres']
        },
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github']
        }
      }
    }, null, 2));

    await client.configureMcp({ yes: true }, fakeEnv);

    const afterRaw = fs.readFileSync(mcpConfigPath, 'utf8');
    const afterData = parseJson(afterRaw);

    assert.equal(afterData.theme, 'dark', 'Preserved top-level settings');
    assert.ok(afterData.mcpServers.postgres, 'Preserved postgres server');
    assert.ok(afterData.mcpServers.github, 'Preserved github server');
    assert.equal(afterData.mcpServers[CANONICAL_MCP_NAME].url, CANONICAL_MCP_URL, 'Added gexmonitor server');
  } finally {
    sandbox.cleanup();
  }
});

test('9. malformed config handling', async () => {
  const sandbox = createSandbox('malformed-config');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const mcpConfigPath = client.getMcpConfigPath(fakeEnv);
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(mcpConfigPath, '{ "mcpServers": { broken json ... ');

    await assert.rejects(async () => {
      await client.configureMcp({ yes: true }, fakeEnv);
    });
  } finally {
    sandbox.cleanup();
  }
});

test('10. atomic rollback after failure', async () => {
  const sandbox = createSandbox('atomic-rollback');
  try {
    const testFile = path.join(sandbox.dir, 'test.json');
    const initialContent = JSON.stringify({ key: 'original_value' });
    fs.writeFileSync(testFile, initialContent);

    assert.throws(() => {
      safeMutateFile(
        testFile,
        () => JSON.stringify({ key: 'mutated_bad_value' }),
        () => {
          throw new Error('Validation artificially failed');
        }
      );
    });

    const restoredContent = fs.readFileSync(testFile, 'utf8');
    assert.equal(restoredContent, initialContent, 'Original content must be restored after validation failure');

    const dirFiles = fs.readdirSync(sandbox.dir);
    const backupFiles = dirFiles.filter(f => f.includes('.bak.'));
    assert.equal(backupFiles.length, 0, 'Temporary backups must be cleaned up');
  } finally {
    sandbox.cleanup();
  }
});

test('11. idempotent second run', async () => {
  const sandbox = createSandbox('idempotent');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    // Run 1
    const res1 = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res1.success, true);

    // Run 2
    const res2 = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res2.success, true);
    assert.equal(res2.alreadyConfigured, true, 'Second run must report alreadyConfigured');
  } finally {
    sandbox.cleanup();
  }
});

test('12. spaces and unicode in home paths', async () => {
  const sandbox = createSandbox('path unicode 移动 1t test');
  try {
    const fakeHome = sandbox.dir;
    const client = new CursorClient();
    const fakeEnv = { HOME: fakeHome, USERPROFILE: fakeHome };

    const res = await client.configureMcp({ yes: true }, fakeEnv);
    assert.equal(res.success, true);

    const verify = await client.verifyMcp(fakeEnv);
    assert.equal(verify.configured, true);
  } finally {
    sandbox.cleanup();
  }
});

test('13. no secret or token leakage in stdout/stderr', async () => {
  const outputModule = require('../src/utils/output');
  const logged = [];
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => logged.push(args.join(' '));
  console.error = (...args) => logged.push(args.join(' '));
  console.warn = (...args) => logged.push(args.join(' '));

  try {
    outputModule.printSuccess({
      clientName: 'Claude Code',
      skillStatus: 'installed',
      mcpStatus: CANONICAL_MCP_URL,
      restartNotice: 'Start a new session.'
    });

    const fullOutput = logged.join('\n');
    assert.ok(!fullOutput.includes('bearer'), 'No bearer token in output');
    assert.ok(!fullOutput.includes('secret'), 'No secret in output');
    assert.ok(!fullOutput.includes('token:'), 'No token field in output');
    assert.ok(!fullOutput.includes('supabase'), 'No internal infra leaked');
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }
});

test('14. canonical endpoint exactness', () => {
  assert.equal(CANONICAL_MCP_URL, 'https://gexmonitor.com/api/mcp');
  assert.ok(!CANONICAL_MCP_URL.endsWith('/'), 'Canonical endpoint must not have trailing slash');
  assert.ok(CANONICAL_MCP_URL.startsWith('https://'), 'Canonical endpoint must be HTTPS');
});

test('15. unsupported client version behavior', async () => {
  const exitCode = await run(['--client', 'unsupported-ai-client']);
  assert.equal(exitCode, 1, 'Unknown client should exit with code 1');
});
