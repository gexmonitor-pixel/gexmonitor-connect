'use strict';

const readline = require('readline');
const { detectClients } = require('./detect');
const { getClientById, getAllClients } = require('./clients');
const { installSkill } = require('./skills');
const { configureMcp } = require('./mcp');
const { CANONICAL_MCP_URL, ERROR_CODES } = require('./constants');
const {
  setVerbose,
  verbose,
  log,
  warn,
  error,
  printSuccess,
  printPartial,
  printDryRun
} = require('./utils/output');

/**
 * Parses CLI arguments into an options object.
 * @param {string[]} argv 
 */
function parseArgs(argv) {
  const options = {
    help: false,
    version: false,
    dryRun: false,
    client: null,
    yes: false,
    verbose: false,
    skipSkill: false,
    skipMcp: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--client') {
      options.client = argv[++i] || null;
    } else if (arg.startsWith('--client=')) {
      options.client = arg.slice(9);
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--skip-skill') {
      options.skipSkill = true;
    } else if (arg === '--skip-mcp') {
      options.skipMcp = true;
    }
  }

  return options;
}

/**
 * Prompts user interactively to select from detected clients.
 * @param {Array<{ client: import('./clients/base'), evidence: string[] }>} detected 
 * @returns {Promise<import('./clients/base')[]>}
 */
async function promptClientSelection(detected) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('');
    console.log('Multiple supported AI clients were detected:');
    detected.forEach((item, index) => {
      console.log(`  [${index + 1}] ${item.client.displayName} (${item.client.id})`);
    });
    console.log(`  [A] All detected clients`);
    console.log('');

    rl.question('Select client to configure (1-' + detected.length + ' or A): ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toUpperCase();
      if (trimmed === 'A' || trimmed === 'ALL') {
        resolve(detected.map(d => d.client));
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= detected.length) {
          resolve([detected[num - 1].client]);
        } else {
          // Default to first
          resolve([detected[0].client]);
        }
      }
    });
  });
}

/**
 * Main CLI execution entry point.
 * @param {string[]} argv 
 * @param {Record<string, any>} [env] 
 * @returns {Promise<number>} exit code
 */
async function run(argv, env = process.env) {
  const options = parseArgs(argv);

  if (options.verbose) {
    setVerbose(true);
  }

  if (options.version) {
    const pkg = require('../package.json');
    console.log(`gexmonitor-connect v${pkg.version}`);
    return 0;
  }

  if (options.help) {
    console.log(`
Usage:
  npx gexmonitor-connect [options]

One-command setup for GEX Monitor Skill + Remote MCP across AI clients.

Supported Clients:
  - Claude Code
  - OpenAI Codex
  - Cursor
  - OpenCode
  - OpenClaw / Memoh

Options:
  -h, --help            Show this help message
  -v, --version         Show version
  --dry-run             Preview actions without making filesystem or config changes
  --client <name>       Target a specific client (claude-code, codex, cursor, opencode, openclaw)
  -y, --yes             Skip confirmation prompts and update mismatched URLs
  --verbose             Show detailed diagnostic output
  --skip-skill          Skip Skill installation and configure MCP only
  --skip-mcp            Skip MCP registration and install Skill only

Canonical Remote MCP:
  https://gexmonitor.com/api/mcp
`);
    return 0;
  }

  // 1. Identify target clients
  let targetClients = [];

  if (options.client) {
    const matched = getClientById(options.client);
    if (!matched) {
      error(ERROR_CODES.CLIENT_NOT_FOUND, `Client "${options.client}" is not recognized.`);
      console.log('Supported clients: ' + getAllClients().map(c => c.id).join(', '));
      return 1;
    }
    targetClients = [matched];
  } else {
    verbose('Detecting installed AI clients...');
    const { detected } = await detectClients(env);

    if (detected.length === 0) {
      console.log('');
      console.log('No supported AI clients were detected in your environment.');
      console.log('');
      console.log('Supported clients:');
      for (const c of getAllClients()) {
        console.log(`  - ${c.displayName} (--client ${c.id})`);
      }
      console.log('');
      console.log('You can explicitly specify a target using:');
      console.log('  npx gexmonitor-connect --client <name>');
      console.log('');
      return 1;
    }

    if (detected.length === 1) {
      verbose(`Found exactly one client: ${detected[0].client.displayName}`);
      targetClients = [detected[0].client];
    } else {
      // Multiple detected
      if (options.yes || !process.stdin.isTTY) {
        verbose(`Multiple clients detected in non-interactive/yes mode: configuring all.`);
        targetClients = detected.map(d => d.client);
      } else {
        targetClients = await promptClientSelection(detected);
      }
    }
  }

  // 2. Dry run preview
  if (options.dryRun) {
    const actions = [];
    for (const client of targetClients) {
      const skillTarget = client.getSkillTargetDir(env);
      const mcpTarget = client.getMcpConfigPath(env);

      actions.push({
        clientName: client.displayName,
        skillAction: options.skipSkill
          ? 'skipped (--skip-skill)'
          : `Install skill 'gexmonitor' to ${skillTarget}`,
        mcpAction: options.skipMcp
          ? 'skipped (--skip-mcp)'
          : `Register remote MCP '${CANONICAL_MCP_URL}'`,
        configPath: mcpTarget,
        restartNotice: client.getRestartNotice()
      });
    }
    printDryRun(actions);
    return 0;
  }

  // 3. Execution
  let overallSuccess = true;

  for (const client of targetClients) {
    let skillResult = { success: true, alreadyInstalled: false, method: 'skipped' };
    let mcpResult = { success: true, alreadyConfigured: false, method: 'skipped' };

    // Skill step
    if (!options.skipSkill) {
      skillResult = await installSkill(client, options, env);
    }

    // MCP step
    if (!options.skipMcp) {
      mcpResult = await configureMcp(client, options, env);
    }

    const skillPass = skillResult.success;
    const mcpPass = mcpResult.success;

    if (skillPass && mcpPass) {
      const skillStatus = options.skipSkill
        ? 'skipped'
        : (skillResult.alreadyInstalled ? 'already installed' : 'installed');
      const mcpStatus = options.skipMcp
        ? 'skipped'
        : (mcpResult.alreadyConfigured ? `${CANONICAL_MCP_URL} (already configured)` : CANONICAL_MCP_URL);

      printSuccess({
        clientName: client.displayName,
        skillStatus,
        mcpStatus,
        restartNotice: client.getRestartNotice()
      });
    } else if (skillPass || mcpPass) {
      overallSuccess = false;
      const failedStep = !skillPass ? 'Skill install' : 'MCP configuration';
      const stepError = !skillPass ? skillResult.error : mcpResult.error;

      printPartial({
        clientName: client.displayName,
        skillStatus: skillPass ? 'installed' : 'failed',
        mcpStatus: mcpPass ? CANONICAL_MCP_URL : 'failed',
        error: `${failedStep} failed: ${stepError}`
      });
    } else {
      overallSuccess = false;
      error(
        skillResult.errorCode || mcpResult.errorCode || ERROR_CODES.MCP_CONFIG_FAILED,
        `Installation failed for ${client.displayName}: ${skillResult.error || mcpResult.error}`
      );
    }
  }

  return overallSuccess ? 0 : 1;
}

module.exports = {
  parseArgs,
  run
};
