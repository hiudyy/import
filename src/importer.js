const { Module } = require('module');
const path = require('path');
const semver = require('semver');
const Logger = require('./logger');
const { 
    fetchJson, 
    fetchWithRetry,
    getNpmPackageUrl,
    getNpmRegistryUrl,
    getNpmFileUrl,
    getYarnPackageUrl,
    getYarnFileUrl
} = require('./network');

// Cache for virtual modules
const virtualModules = new Map();

// Cache for package metadata to avoid redundant registry requests
const packageMetadataCache = new Map();

// Track dependencies being imported to prevent circular dependencies
const importingDependencies = new Set();

// Track failed imports for reporting
const failedImports = new Map();

// Maximum concurrent downloads
const MAX_CONCURRENT_DOWNLOADS = 5;

/**
 * Resolves the main file from package metadata
 * @param {Object} pkgJson - Package.json contents
 * @returns {string} - Resolved main file path
 */
function resolveMainFile(pkgJson) {
    // Priority: module (ESM) > main (CommonJS) > index.js (default)
    return pkgJson.module || pkgJson.main || 'index.js';
}

/**
 * Parses a package string in npm-style format
 * @param {string} input - Package string (e.g., "package", "package@1.0.0", "@scope/package", "pkg@npm:@scope/package")
 * @returns {Object} - Parsed package info
 */
function parsePackageString(input) {
    // Default values
    let result = {
        name: '',
        version: 'latest',
        source: 'npm',  // Default to npm
        originalName: input
    };

    // Split on @ to separate potential alias from the rest
    const [alias, ...rest] = input.split('@');
    const pkgSpec = rest.join('@'); // Rejoin in case there are @ in the package name

    // If there's no @, then it's just a package name
    if (!pkgSpec) {
        result.name = alias;
        return result;
    }

    // Check if it's an aliased import
    if (pkgSpec.startsWith('npm:') || pkgSpec.startsWith('github:') || pkgSpec.startsWith('yarn:')) {
        result.name = pkgSpec.substring(pkgSpec.indexOf(':') + 1);
        result.source = pkgSpec.substring(0, pkgSpec.indexOf(':'));
        result.alias = alias;
    } else if (alias.startsWith('@')) {
        // It's a scoped package
        result.name = `${alias}@${pkgSpec}`;
    } else {
        // Regular package with version
        result.name = alias;
        result.version = pkgSpec;
    }

    // Clean up version (remove ^ ~ etc)
    if (result.version !== 'latest') {
        result.version = result.version.replace(/[\^~]/g, '');
    }

    return result;
}

/**
 * Imports a package from NPM or Yarn
 * @param {string} pkg - Package string in npm/yarn format
 * @param {string} source - Source registry ('npm' or 'yarn')
 */
async function importFromRegistry(pkg, source = 'npm') {
    const parsed = parsePackageString(pkg);
    const { name, version, alias } = parsed;
    const moduleName = alias || name.split('/').pop();
    
    if (virtualModules.has(name)) {
        Logger.debug(`Module ${name} already loaded`);
        return;
    }

    if (importingDependencies.has(name)) {
        Logger.warn(`Circular dependency detected for ${name}, skipping`);
        return;
    }

    const spinner = Logger.progress(`📦 Importing ${name}@${version} from ${source.toUpperCase()}...`);
    importingDependencies.add(name);

    try {
        // Check cache first
        const cacheKey = `${name}@${version}`;
        let pkgJson = packageMetadataCache.get(cacheKey);

        if (!pkgJson) {
            try {
                // Try primary source first
                const packageUrl = source === 'yarn' ? 
                    getYarnPackageUrl(name, version) : 
                    getNpmPackageUrl(name, version);
                pkgJson = await fetchJson(packageUrl);
            } catch (err) {
                // Fallback to npm registry if primary source fails
                const registryUrl = getNpmRegistryUrl(name, version);
                pkgJson = await fetchJson(registryUrl);
            }
            packageMetadataCache.set(cacheKey, pkgJson);
        }

        // Import dependencies in parallel with rate limiting
        const dependencies = pkgJson.dependencies || {};
        const depEntries = Object.entries(dependencies);
        const results = [];

        // Process dependencies in chunks to limit concurrent downloads
        for (let i = 0; i < depEntries.length; i += MAX_CONCURRENT_DOWNLOADS) {
            const chunk = depEntries.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
            const promises = chunk.map(async ([depName, depVersion]) => {
                try {
                    const resolvedVersion = semver.validRange(depVersion) ? depVersion : 'latest';
                    await importFromRegistry(`${depName}@${resolvedVersion}`, source);
                    return { success: true, name: depName };
                } catch (err) {
                    Logger.warn(`Failed to import dependency ${depName}: ${err.message}`);
                    failedImports.set(depName, err.message);
                    return { success: false, name: depName, error: err.message };
                }
            });

            const chunkResults = await Promise.allSettled(promises);
            results.push(...chunkResults);
        }

        // Import the main module
        const mainFile = resolveMainFile(pkgJson);
        const moduleUrl = source === 'yarn' ?
            getYarnFileUrl(name, pkgJson.version, mainFile) :
            getNpmFileUrl(name, pkgJson.version, mainFile);
        await importModuleFiles(name, moduleUrl);

        spinner.succeed(`✨ Successfully imported ${name}@${pkgJson.version}`);

        // Log any failed dependencies
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
        if (failed.length > 0) {
            Logger.warn(`Some dependencies of ${name} failed to import:`);
            failed.forEach(f => {
                const error = f.status === 'rejected' ? f.reason : f.value.error;
                Logger.warn(`  - ${f.value?.name || 'Unknown'}: ${error}`);
            });
        }
    } catch (err) {
        spinner.fail(`Failed to import ${name}: ${err.message}`);
        failedImports.set(name, err.message);
        throw err;
    } finally {
        importingDependencies.delete(name);
    }
}

/**
 * Imports a repository from GitHub
 * @param {string} repo - Repository string (e.g., "github:owner/repo")
 */
async function importFromGitHub(repo) {
    const [owner, name] = repo.replace('github:', '').split('/');
    
    if (virtualModules.has(name)) {
        Logger.debug(`Module ${name} already loaded`);
        return;
    }

    const spinner = Logger.progress(`🐙 Importing ${name} from GitHub (${owner}/${name})...`);

    try {
        // Try main branch first, then master if main fails
        const branches = ['main', 'master'];
        let content = null;
        let error = null;

        for (const branch of branches) {
            try {
                const url = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/package.json`;
                const pkgJson = await fetchJson(url);
                const mainFile = resolveMainFile(pkgJson);
                const moduleUrl = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${mainFile}`;
                content = await fetchWithRetry(moduleUrl);
                break;
            } catch (err) {
                error = err;
                continue;
            }
        }

        if (!content) {
            throw error || new Error('Failed to fetch repository content');
        }

        await importModuleFiles(name, content, true);
        spinner.succeed(`✨ Successfully imported ${name} from GitHub`);
    } catch (err) {
        spinner.fail(`Failed to import ${name} from GitHub: ${err.message}`);
        failedImports.set(name, err.message);
        throw err;
    }
}

/**
 * Imports module files into virtual modules
 * @param {string} name - Module name
 * @param {string} urlOrContent - URL to fetch from or content string
 * @param {boolean} isContent - Whether urlOrContent is direct content
 */
async function importModuleFiles(name, urlOrContent, isContent = false) {
    try {
        const code = isContent ? urlOrContent : await fetchWithRetry(urlOrContent);
        const modulePath = `/virtual_modules/${name}.js`;

        const mod = new Module(modulePath, module);
        mod.filename = modulePath;
        mod.paths = Module._nodeModulePaths('/virtual_modules');

        try {
            mod._compile(code, modulePath);
        } catch (err) {
            throw new Error(`Failed to compile ${name}: ${err.message}`);
        }

        require.cache[modulePath] = mod;
        virtualModules.set(name, modulePath);
    } catch (err) {
        Logger.error(`Failed to load ${name}: ${err.message}`);
        throw err;
    }
}

/**
 * Lists all currently loaded virtual modules
 * @returns {Array<Object>} Array of module information
 */
function listVirtualModules() {
    return Array.from(virtualModules.entries()).map(([name, path]) => ({
        name,
        path,
        loaded: !!require.cache[path]
    }));
}

/**
 * Clears the virtual module cache
 */
function clearVirtualModules() {
    for (const [name, path] of virtualModules.entries()) {
        delete require.cache[path];
    }
    virtualModules.clear();
    packageMetadataCache.clear();
    failedImports.clear();
    Logger.success('Virtual module cache cleared');
}

// Patch require to support virtual modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function(moduleName) {
    if (virtualModules.has(moduleName)) {
        return originalRequire.call(this, virtualModules.get(moduleName));
    }
    return originalRequire.apply(this, arguments);
};

/**
 * Main import function with improved package resolution
 * @param {string[]} modules - Array of module specifiers to import
 * @returns {Promise<Object>} - Object containing imported modules and any errors
 */
async function importModules(modules) {
    const results = {};
    failedImports.clear();
    
    // Process modules in parallel with rate limiting
    for (let i = 0; i < modules.length; i += MAX_CONCURRENT_DOWNLOADS) {
        const chunk = modules.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
        const promises = chunk.map(async (mod) => {
            try {
                const parsed = parsePackageString(mod);
                const { source, name, version, alias } = parsed;
                const moduleName = alias || name.split('/').pop();

                switch (source) {
                    case 'npm':
                    case 'yarn':
                        results[moduleName] = await importFromRegistry(mod, source);
                        break;
                    case 'github':
                        results[moduleName] = await importFromGitHub(mod);
                        break;
                    default:
                        results[moduleName] = await importFromRegistry(mod, 'npm');
                }
                return { success: true, name: moduleName };
            } catch (err) {
                return { success: false, name: mod, error: err.message };
            }
        });

        const chunkResults = await Promise.allSettled(promises);
        
        // Log any failures from this chunk
        chunkResults
            .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
            .forEach(r => {
                const error = r.status === 'rejected' ? r.reason : r.value.error;
                const name = r.value?.name || 'Unknown';
                Logger.warn(`Failed to import ${name}: ${error}`);
            });
    }

    // If there were any failures, log a summary
    if (failedImports.size > 0) {
        Logger.warn('\nImport completed with some failures:');
        for (const [name, error] of failedImports.entries()) {
            Logger.warn(`  - ${name}: ${error}`);
        }
    }

    return results;
}

module.exports = {
    import: importModules,
    list: listVirtualModules,
    clear: clearVirtualModules
};
