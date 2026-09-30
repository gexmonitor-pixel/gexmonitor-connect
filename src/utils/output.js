'use strict';

let isVerbose = false;

function setVerbose(val) {
  isVerbose = !!val;
}

function log(msg) {
  console.log(msg);
}

function verbose(msg) {
  if (isVerbose) {
    console.log(`[debug] ${msg}`);
  }
}

function warn(msg) {
  console.warn(`[warning] ${msg}`);
}

function error(code, msg) {
  console.error(`Error [${code}]: ${msg}`);
}

/**
 * Formats a clean success message.
 * @param {{ clientName: string, skillStatus: string, mcpStatus: string, restartNotice: string }} result 
 */
function printSuccess({ clientName, skillStatus = 'installed', mcpStatus = 'https://gexmonitor.com/api/mcp', restartNotice }) {
  console.log('');
  console.log('GEX Monitor connected.');
  console.log('');
  console.log(`Client: ${clientName}`);
  console.log(`Skill: ${skillStatus}`);
  console.log(`Remote MCP: ${mcpStatus}`);
  console.log('Authentication: OAuth on first use');
  console.log('');
  if (restartNotice) {
    console.log(restartNotice);
    console.log('');
  }
  console.log('Then try:');
  console.log('');
  console.log('  "Use GEX Monitor to analyze BTC market structure."');
  console.log('');
}

/**
 * Formats a partial install report.
 * @param {{ clientName: string, skillStatus: string, mcpStatus: string, error?: string }} param0 
 */
function printPartial({ clientName, skillStatus, mcpStatus, error: err }) {
  console.log('');
  console.log('GEX Monitor connection PARTIAL.');
  console.log('');
  console.log(`Client: ${clientName}`);
  console.log(`Skill: ${skillStatus}`);
  console.log(`Remote MCP: ${mcpStatus}`);
  if (err) {
    console.log(`Issue: ${err}`);
  }
  console.log('');
}

/**
 * Formats a dry-run summary.
 * @param {Array<{ clientName: string, skillAction: string, mcpAction: string, configPath: string | null, restartNotice: string }>} actions 
 */
function printDryRun(actions) {
  console.log('');
  console.log('=== GEX Monitor Connect: DRY RUN ===');
  console.log('No filesystem or configuration changes will be made.');
  console.log('');
  for (const a of actions) {
    console.log(`Client: ${a.clientName}`);
    console.log(`  Skill action:   ${a.skillAction}`);
    console.log(`  MCP action:     ${a.mcpAction}`);
    if (a.configPath) {
      console.log(`  Target config:  ${a.configPath}`);
    }
    console.log(`  Session reload: ${a.restartNotice}`);
    console.log('');
  }
}

module.exports = {
  setVerbose,
  log,
  verbose,
  warn,
  error,
  printSuccess,
  printPartial,
  printDryRun
};
