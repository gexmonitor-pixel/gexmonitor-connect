'use strict';

/**
 * Strips comments from JSONC (JSON with comments) strings without affecting string literals.
 * @param {string} text 
 * @returns {string}
 */
function stripJsonComments(text) {
  let insideString = false;
  let stringChar = '';
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === stringChar) {
        insideString = false;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      insideString = true;
      stringChar = char;
      result += char;
      continue;
    }

    // Single-line comment
    if (char === '/' && nextChar === '/') {
      const eol = text.indexOf('\n', i + 2);
      if (eol === -1) {
        break; // comment till EOF
      }
      i = eol - 1;
      continue;
    }

    // Multi-line comment
    if (char === '/' && nextChar === '*') {
      const closing = text.indexOf('*/', i + 2);
      if (closing === -1) {
        break; // unclosed comment till EOF
      }
      i = closing + 1;
      continue;
    }

    // Trailing commas cleanup (e.g. before closing } or ])
    result += char;
  }

  // Remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Parses JSON or JSONC string.
 * @param {string} content 
 * @returns {any}
 */
function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    const stripped = stripJsonComments(content);
    return JSON.parse(stripped);
  }
}

/**
 * Stringifies object to formatted JSON.
 * @param {any} value 
 * @returns {string}
 */
function formatJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

module.exports = {
  stripJsonComments,
  parseJson,
  formatJson
};
