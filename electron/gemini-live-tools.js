/** Tool declarations for Gemini Live — JSON schema uses lowercase types. */

function buildToolDeclarations() {
  return [
    {
      name: 'open_app',
      description:
        'Open or launch ANY installed Windows application by name — Notepad, Calculator, Spotify, Discord, Photos, Paint, Visual Studio Code, Chrome, etc. Uses Start Menu and installed apps on this PC. Pass the common English name; nicknames like vscode/code work too.',
      parameters: {
        type: 'object',
        properties: {
          app_name: {
            type: 'string',
            description:
              'Application name in English, e.g. Notepad, Spotify, Discord, Calculator, Photos, Cursor, Brave, Visual Studio Code',
          },
        },
        required: ['app_name'],
      },
    },
    {
      name: 'web_search',
      description: 'Search the web for information (opens browser with search).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'weather_report',
      description: 'Get weather for a city.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
    {
      name: 'open_panel',
      description: 'Navigate JARVIS UI: dashboard, presets, apps, search, tasks, settings, processes.',
      parameters: {
        type: 'object',
        properties: {
          panel: { type: 'string', description: 'Panel id' },
        },
        required: ['panel'],
      },
    },
    {
      name: 'launch_preset',
      description: 'Launch a saved workspace preset by name.',
      parameters: {
        type: 'object',
        properties: {
          preset_name: { type: 'string', description: 'Exact preset name' },
        },
        required: ['preset_name'],
      },
    },
    {
      name: 'set_volume',
      description:
        'Set Windows master speaker volume. Use ONLY when the user gives a clear number 0-100 (e.g. 30 for "thirty percent"). Do NOT guess from words like "to" or partial phrases. If unsure, ask first.',
      parameters: {
        type: 'object',
        properties: {
          percent: {
            type: 'number',
            description: 'Integer 0-100 only, e.g. 30 for thirty percent, 50 for half, 100 for max',
          },
        },
        required: ['percent'],
      },
    },
    {
      name: 'get_volume',
      description: 'Read current Windows master volume percent before changing it.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'save_memory',
      description: 'Silently save a fact about the user to long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'identity | preferences | projects | notes' },
          key: { type: 'string', description: 'Short key' },
          value: { type: 'string', description: 'Value to remember' },
        },
        required: ['category', 'key', 'value'],
      },
    },
  ];
}

module.exports = { buildToolDeclarations };
