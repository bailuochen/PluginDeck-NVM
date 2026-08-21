# PluginDeck NVM

NVM is a community plugin for [PluginDeck](https://github.com/bailuochen/PluginDeck). It provides a native-hosted workspace for managing local Node.js versions through an existing NVM installation.

## Features

- List installed Node.js versions and manage the default alias
- Browse the complete Node.js release index with LTS and macOS artifact metadata
- Install and uninstall versions using `nvm install` and `nvm uninstall`
- Detect `.nvmrc`, `.node-version`, and `package.json` engine requirements
- Open project or version-specific Terminal sessions
- Inspect NVM, shell profile, architecture, and directory health

## Requirements

- macOS 13 or later
- PluginDeck 0.5.0 or later
- NVM installed at `~/.nvm`, Homebrew's standard location, or a custom directory

## Install

Install the plugin from PluginDeck's marketplace. For local development, choose **Plugin Marketplace > Import Plugin > Local Directory** and select this repository.

## Development

The plugin owns its HTML, CSS, JavaScript, user input, and backend actions. PluginDeck only provides the sandboxed package loader, permission confirmation, and JSON-RPC bridge.

Run the backend checks with:

```sh
./tests/test-backend.sh
```

See PluginDeck's [plugin specification](https://github.com/bailuochen/PluginDeck/blob/main/docs/PLUGIN_SPEC.md) for the package contract.

## License

MIT
