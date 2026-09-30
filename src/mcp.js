'use strict';

const { CANONICAL_MCP_URL, CANONICAL_MCP_NAME, ERROR_CODES } = require('./constants');
const { verbose, warn } = require('./utils/output');

/**
 * Configures Remote MCP for the client.
 * @param {import('./clients/base')} client 
 * @param {{ dryRun?: boolean, yes?: boolean, verbose?: boolean }} options 
 * @param {Record<string, any>} [env] 
 * @returns {Promise<{ success: boolean, alreadyConfigured?: boolean, urlMismatch?: boolean, existingUrl?: string, method: string, error?: string, errorCode?: string }>}
 */
async function configureMcp(client, options = {}, env = process.env) {
  verbose(`Checking MCP configuration for ${client.displayName}...`);

  const initialState = await client.readMcpConfig(env);

  if (initialState.hasServer && initialState.url === CANONICAL_MCP_URL) {
    verbose(`Canonical MCP server already configured for ${client.displayName}`);
    return {
      success: true,
      alreadyConfigured: true,
      method: 'existing'
    };
  }

  if (initialState.hasServer && initialState.url && initialState.url !== CANONICAL_MCP_URL) {
    if (!options.yes) {
      warn(`Existing ${CANONICAL_MCP_NAME} MCP server points to "${initialState.url}" (expected: "${CANONICAL_MCP_URL}")`);
      return {
        success: false,
        urlMismatch: true,
        existingUrl: initialState.url,
        errorCode: ERROR_CODES.MCP_URL_MISMATCH,
        error: `Existing MCP URL mismatch: "${initialState.url}" != "${CANONICAL_MCP_URL}". Pass --yes to update.`,
        method: 'check'
      };
    }
  }

  if (options.dryRun) {
    return {
      success: true,
      method: 'dry-run'
    };
  }

  try {
    const configResult = await client.configureMcp(options, env);
    if (!configResult.success) {
      return {
        success: false,
        errorCode: configResult.errorCode || ERROR_CODES.MCP_CONFIG_FAILED,
        error: configResult.error || 'Failed to configure MCP server',
        method: configResult.method
      };
    }

    // Verify post-configuration
    const verifyState = await client.verifyMcp(env);
    if (!verifyState.configured) {
      return {
        success: false,
        errorCode: ERROR_CODES.VERIFICATION_FAILED,
        error: `Post-config verification failed. Server URL: "${verifyState.url}", expected: "${CANONICAL_MCP_URL}"`,
        method: configResult.method
      };
    }

    return {
      success: true,
      alreadyConfigured: false,
      method: configResult.method
    };
  } catch (err) {
    return {
      success: false,
      errorCode: ERROR_CODES.MCP_CONFIG_FAILED,
      error: err.message,
      method: 'error'
    };
  }
}

module.exports = {
  configureMcp
};
