/** Tool declarations for Gemini Live — JSON schema uses lowercase types. */

function buildToolDeclarations() {
  return [
    {
      name: 'open_app',
      description: 'Open or launch an application on this PC by name.',
      parameters: {
        type: 'object',
        properties: {
          app_name: { type: 'string', description: 'Application name e.g. Chrome, Spotify, Notepad' },
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
      description: 'Set Windows master volume percent 0-100.',
      parameters: {
        type: 'object',
        properties: {
          percent: { type: 'number', description: 'Volume 0-100' },
        },
        required: ['percent'],
      },
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
