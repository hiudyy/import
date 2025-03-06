# @hiudyy/import

Enhanced dynamic module importer for NPM, Yarn, and GitHub packages with improved features, parallel downloads, and CLI support.

## Features

- 🚀 Dynamic importing of modules from NPM, Yarn, and GitHub without installation
- ⚡ Parallel downloads with rate limiting for better performance
- 🔄 Automatic dependency resolution with circular dependency detection
- 💪 Resilient imports - continues even if some submodules fail
- 📦 Smart module resolution (supports both ESM and CommonJS)
- 💾 In-memory module caching with management utilities
- 🎨 Modern CLI interface with colored output and progress tracking
- 🔍 Detailed logging and error tracking
- 🔄 Configurable retry logic with exponential backoff

## Installation

```bash
npm install @hiudyy/import
```

## Usage

### Programmatic Usage

```javascript
const importer = require('@hiudyy/import');

// Import modules
await importer.import([
  'npm:axios',                    // Latest version from NPM
  'yarn:lodash@4.17.21',         // Specific version from Yarn
  'npm:chalk@4.1.2',             // Specific version from NPM
  'npm:@types/node@18',          // Scoped package
  'github:owner/repo'            // GitHub repository
]);

// List cached modules
const modules = importer.list();
console.log(modules);

// Clear module cache
importer.clear();
```

### CLI Usage

The package includes a CLI tool for easy module management:

```bash
# Import modules
npm-cached import axios
npm-cached import chalk@4.17.21
npm-cached import myexpress@npm:express@4.17.1
npm-cached import mylodash@yarn:lodash@4.17.21
npm-cached import mylib@github:user/repo

# Import multiple modules at once
npm-cached import express@4.17.1 cors body-parser

# List cached modules
npm-cached list

# Clear module cache
npm-cached clear

# Show help
npm-cached help
```

## Enhanced Features

### Parallel Downloads
- Modules and their dependencies are downloaded in parallel with smart rate limiting
- Configurable concurrent download limits to prevent overwhelming the network
- Progress tracking for multiple simultaneous downloads

### Multiple Package Sources
- NPM Registry (primary source)
- Yarn Registry support
- GitHub repositories
- Automatic fallback between sources for better reliability

### Improved Error Handling
- Continues importing even if some submodules fail
- Detailed error reporting with full stack traces
- Summary of failed imports at the end
- Exponential backoff retry strategy for network requests

### Performance Optimizations
- Streaming downloads for large files
- In-memory caching of package metadata
- Smart retry logic with exponential backoff
- Efficient module resolution and loading

## Module Resolution

The importer intelligently resolves modules using the following priority:
1. ESM modules (package.json "module" field)
2. CommonJS modules (package.json "main" field)
3. Default index.js

## Error Handling

- Automatic retries for failed network requests with exponential backoff
- Detailed error messages with status codes
- Circular dependency detection
- Proper error propagation
- Summary of failed imports

## Cache Management

Modules are cached in memory for better performance. The cache can be:
- Listed using `importer.list()` or `npm-cached list`
- Cleared using `importer.clear()` or `npm-cached clear`

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT © Hiudy
