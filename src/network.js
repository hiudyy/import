const https = require('https');
const Logger = require('./logger');

class NetworkError extends Error {
    constructor(message, statusCode, url) {
        super(message);
        this.name = 'NetworkError';
        this.statusCode = statusCode;
        this.url = url;
    }
}

// Exponential backoff settings
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000;    // 10 seconds
const BACKOFF_FACTOR = 2;

/**
 * Fetches data from a URL with retry capability, timeout, and exponential backoff
 * @param {string} url - The URL to fetch from
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - The response data
 */
async function fetchWithRetry(url, options = {}) {
    const {
        retries = 3,
        timeout = 10000,
        initialDelay = INITIAL_RETRY_DELAY,
        maxDelay = MAX_RETRY_DELAY,
        backoffFactor = BACKOFF_FACTOR
    } = options;

    return new Promise((resolve, reject) => {
        const attempt = async (attemptsLeft, delay) => {
            Logger.debug(`Fetching ${url} (${retries - attemptsLeft + 1}/${retries})`);

            const req = https.get(url, { timeout }, (res) => {
                if (res.statusCode >= 400) {
                    const error = new NetworkError(
                        `HTTP ${res.statusCode} - ${res.statusMessage}`,
                        res.statusCode,
                        url
                    );

                    if (attemptsLeft > 1) {
                        const nextDelay = Math.min(delay * backoffFactor, maxDelay);
                        Logger.warn(`Request failed: ${error.message}. Retrying in ${nextDelay/1000}s...`);
                        setTimeout(() => attempt(attemptsLeft - 1, nextDelay), delay);
                        return;
                    }
                    reject(error);
                    return;
                }

                // Use streaming for better performance with large files
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString()));
            });

            req.on('timeout', () => {
                req.destroy();
                const error = new NetworkError('Request timeout', 408, url);
                
                if (attemptsLeft > 1) {
                    const nextDelay = Math.min(delay * backoffFactor, maxDelay);
                    Logger.warn(`Request timeout. Retrying in ${nextDelay/1000}s...`);
                    setTimeout(() => attempt(attemptsLeft - 1, nextDelay), delay);
                    return;
                }
                reject(error);
            });

            req.on('error', (err) => {
                if (attemptsLeft > 1) {
                    const nextDelay = Math.min(delay * backoffFactor, maxDelay);
                    Logger.warn(`Request error: ${err.message}. Retrying in ${nextDelay/1000}s...`);
                    setTimeout(() => attempt(attemptsLeft - 1, nextDelay), delay);
                    return;
                }
                reject(new NetworkError(err.message, 0, url));
            });
        };

        attempt(retries, initialDelay);
    });
}

/**
 * Fetches JSON data from a URL
 * @param {string} url - The URL to fetch from
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed JSON data
 */
async function fetchJson(url, options = {}) {
    const data = await fetchWithRetry(url, options);
    try {
        return JSON.parse(data);
    } catch (err) {
        throw new Error(`Invalid JSON response from ${url}: ${err.message}`);
    }
}

/**
 * Convert NPM package name to unpkg URL for package.json
 */
function getNpmPackageUrl(name, version) {
    const encodedName = name.startsWith('@') ? 
        `@${encodeURIComponent(name.slice(1))}` : 
        encodeURIComponent(name);
    return `https://unpkg.com/${encodedName}${version ? `@${version}` : ''}/package.json`;
}

/**
 * Convert NPM package name to unpkg URL for a specific file
 */
function getNpmFileUrl(name, version, filePath) {
    const encodedName = name.startsWith('@') ? 
        `@${encodeURIComponent(name.slice(1))}` : 
        encodeURIComponent(name);
    return `https://unpkg.com/${encodedName}${version ? `@${version}` : ''}/${filePath}`;
}

/**
 * Convert NPM package name to registry URL
 */
function getNpmRegistryUrl(name, version) {
    const scope = name.startsWith('@') ? name.split('/')[0] : '';
    const packageName = scope ? name.split('/')[1] : name;
    const registryPath = scope ? 
        `${scope}/${packageName}` : 
        packageName;
    return `https://registry.npmjs.org/${registryPath}/${version || 'latest'}`;
}

/**
 * Convert package name to Yarn registry URL for package.json
 * Note: Currently using unpkg as fallback since Yarn doesn't have a public CDN
 */
function getYarnPackageUrl(name, version) {
    // First try Yarn's registry if available
    const yarnRegistry = process.env.YARN_REGISTRY || 'https://registry.yarnpkg.com';
    const scope = name.startsWith('@') ? name.split('/')[0] : '';
    const packageName = scope ? name.split('/')[1] : name;
    const registryPath = scope ? 
        `${scope}/${packageName}` : 
        packageName;
    
    // If version is specified, append it to the URL
    return `${yarnRegistry}/${registryPath}${version ? `/${version}` : '/latest'}`;
}

/**
 * Convert package name to Yarn CDN URL for a specific file
 * Note: Currently using unpkg as fallback since Yarn doesn't have a public CDN
 */
function getYarnFileUrl(name, version, filePath) {
    // Fallback to unpkg for now
    return getNpmFileUrl(name, version, filePath);
}

module.exports = {
    fetchWithRetry,
    fetchJson,
    NetworkError,
    getNpmPackageUrl,
    getNpmRegistryUrl,
    getNpmFileUrl,
    getYarnPackageUrl,
    getYarnFileUrl
};
