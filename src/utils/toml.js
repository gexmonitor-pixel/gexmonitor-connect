'use strict';

/**
 * Find an MCP server in TOML content.
 * Checks for [mcp_servers.<name>] or [mcp_servers."<name>"].
 * @param {string} content 
 * @param {string} serverName 
 * @returns {{ exists: boolean, url: string | null, startLine: number, endLine: number }}
 */
function findTomlMcpServer(content, serverName) {
  const lines = content.split('\n');
  const targetHeaderRegex = new RegExp(`^\\s*\\[mcp_servers\\.(?:"${serverName}"|'${serverName}'|${serverName})\\]\\s*$`);
  const anyHeaderRegex = /^\s*\[[^\]]+\]\s*$/;

  let startLine = -1;
  let endLine = -1;
  let url = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (startLine === -1) {
      if (targetHeaderRegex.test(line)) {
        startLine = i;
      }
    } else {
      if (anyHeaderRegex.test(line)) {
        endLine = i - 1;
        break;
      }
      const urlMatch = line.match(/^\s*url\s*=\s*["']([^"']+)["']/);
      if (urlMatch) {
        url = urlMatch[1];
      }
    }
  }

  if (startLine !== -1 && endLine === -1) {
    endLine = lines.length - 1;
  }

  return {
    exists: startLine !== -1,
    url,
    startLine,
    endLine
  };
}

/**
 * Updates or adds an MCP server entry in TOML content.
 * Preserves existing formatting, comments, and all other sections.
 * @param {string} content 
 * @param {string} serverName 
 * @param {{ url: string }} config 
 * @returns {string}
 */
function updateTomlMcpServer(content, serverName, config) {
  const serverInfo = findTomlMcpServer(content, serverName);
  const lines = content.split('\n');

  if (serverInfo.exists) {
    // Update existing server section
    let urlUpdated = false;
    for (let i = serverInfo.startLine + 1; i <= serverInfo.endLine; i++) {
      if (/^\s*url\s*=/.test(lines[i])) {
        lines[i] = `url = "${config.url}"`;
        urlUpdated = true;
        break;
      }
    }
    if (!urlUpdated) {
      lines.splice(serverInfo.startLine + 1, 0, `url = "${config.url}"`);
    }
    return lines.join('\n');
  }

  // Server doesn't exist yet. Check if [mcp_servers] exists.
  const mcpServersHeaderIdx = lines.findIndex(l => /^\s*\[mcp_servers\]\s*$/.test(l));

  const newSection = [
    `[mcp_servers.${serverName}]`,
    `url = "${config.url}"`,
    ''
  ];

  if (mcpServersHeaderIdx !== -1) {
    // Insert after [mcp_servers]
    lines.splice(mcpServersHeaderIdx + 1, 0, '', ...newSection);
  } else {
    // Append to end of file
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(...newSection);
  }

  return lines.join('\n');
}

/**
 * Basic syntax validation for TOML:
 * Ensures headers and key-value pairs are balanced and parseable.
 * @param {string} content 
 * @returns {boolean}
 */
function validateTomlBasic(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.startsWith('[')) {
      if (!trimmed.endsWith(']')) {
        return false;
      }
      continue;
    }
    // Key-value line
    if (!trimmed.includes('=')) {
      return false;
    }
  }
  return true;
}

module.exports = {
  findTomlMcpServer,
  updateTomlMcpServer,
  validateTomlBasic
};
