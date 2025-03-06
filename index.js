/**
 * @hiudyy/import - Dynamic NPM and GitHub module importer
 * Lightweight, zero-dependency module importer with caching and CLI support
 */

const { import: importModules, list: listModules, clear: clearModules } = require('./src/importer');

/**
 * Main export object with core functionality
 * @type {Object}
 * @property {Function} import - Import modules from NPM or GitHub
 * @property {Function} list - List all cached virtual modules
 * @property {Function} clear - Clear the virtual module cache
 * 
 * @example
 * const importer = require('@hiudyy/import');
 * 
 * // Import latest version
 * await importer.import(['express']);
 * 
 * // Import specific version
 * await importer.import(['express@4.17.1']);
 * 
 * // Import with alias
 * await importer.import(['myexpress@npm:express@4.17.1']);
 * 
 * // Import from GitHub
 * await importer.import(['mylib@github:user/repo']);
 * 
 * // List cached modules
 * const modules = importer.list();
 * console.log(modules);
 * 
 * // Clear cache
 * importer.clear();
 */
module.exports = {
    import: importModules,
    list: listModules,
    clear: clearModules
};
