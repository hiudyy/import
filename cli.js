#!/usr/bin/env node

const { import: importModules, list: listModules, clear: clearModules } = require('./src/importer');
const Logger = require('./src/logger');

const COMMANDS = {
    IMPORT: 'import',
    LIST: 'list',
    CLEAR: 'clear',
    HELP: 'help'
};

function printHelp() {
    console.log(`
NPM Cached - Fast Package Importer

Usage:
  npm-cached <command> [options]

Commands:
  import <modules...>  Import one or more modules
                     Format: package[@version] or alias@[npm|yarn|github]:package
  list                List all cached virtual modules
  clear               Clear the virtual module cache
  help                Show this help message

Examples:
  # Import latest version
  $ npm-cached import express

  # Import specific version
  $ npm-cached import express@4.17.1

  # Import with alias
  $ npm-cached import myexpress@npm:express@4.17.1

  # Import from Yarn
  $ npm-cached import lodash@yarn:lodash@4.17.21

  # Import from GitHub
  $ npm-cached import mylib@github:user/repo

  # Import multiple packages
  $ npm-cached import express@4.17.1 cors body-parser

  # List cached modules
  $ npm-cached list

  # Clear the cache
  $ npm-cached clear
`);
}

function formatModuleList(modules) {
    if (modules.length === 0) {
        return 'No modules currently loaded.';
    }

    return modules.map(({ name, path, loaded }) => {
        const status = loaded ? '✓' : '✗';
        return `${status} ${name}\n   ${path}`;
    }).join('\n');
}

function formatErrorSummary(errors) {
    if (errors.length === 0) return '';
    
    return '\nErrors encountered:\n' + errors.map(err => 
        `  ✗ ${err.module}: ${err.message}`
    ).join('\n');
}

async function main() {
    const [,, command, ...args] = process.argv;

    if (!command || command === COMMANDS.HELP) {
        printHelp();
        return;
    }

    try {
        switch (command) {
            case COMMANDS.IMPORT:
                if (args.length === 0) {
                    Logger.error('Please specify at least one module to import');
                    console.log('\nExample: npm-cached import express');
                    process.exit(1);
                }

                const startTime = Date.now();
                await importModules(args);
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                
                Logger.success(`\nImport completed in ${duration}s`);
                break;

            case COMMANDS.LIST:
                const modules = listModules();
                console.log('\nCached Virtual Modules:');
                console.log('------------------------');
                console.log(formatModuleList(modules));
                console.log(''); // Empty line for better readability
                break;

            case COMMANDS.CLEAR:
                clearModules();
                Logger.success('Module cache cleared successfully');
                break;

            default:
                Logger.error(`Unknown command: ${command}`);
                console.log('\nUse "npm-cached help" to see available commands');
                process.exit(1);
        }
    } catch (err) {
        if (err.errors) {
            // Handle multiple errors
            Logger.error(`Command failed with ${err.errors.length} errors`);
            console.log(formatErrorSummary(err.errors));
        } else {
            Logger.error(`Command failed: ${err.message}`);
        }
        process.exit(1);
    }
}

// Run the CLI
main().catch(err => {
    Logger.error(`Unexpected error: ${err.message}`);
    process.exit(1);
});
