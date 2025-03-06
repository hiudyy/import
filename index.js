/**
 * @hiudyy/import - Importação dinâmica de módulos do NPM e GitHub
 *
 * Copyright (c) Hiudy (GitHub: hiudyy)
 *
 * 🚀 Carrega pacotes diretamente na memória, suportando:
 * - NPM: `npm:axios`, `npm:@whiskeysockets/baileys`
 * - GitHub: `github:owner/repo`
 */

const { Module } = require("module");
const https = require("https");

// Cache de módulos em memória
const virtualModules = new Map();

/**
 * Faz o download de um arquivo via HTTPS com retries.
 *
 * @param {string} url - URL do arquivo
 * @param {number} retries - Tentativas máximas
 * @returns {Promise<string>} - Conteúdo do arquivo
 */
async function fetch(url, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (n) => {
            https.get(url, (res) => {
                if (res.statusCode >= 400) {
                    if (n > 1) return attempt(n - 1);
                    return reject(new Error(`Erro ${res.statusCode} ao buscar ${url}`));
                }
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => resolve(data));
            }).on("error", (err) => {
                if (n > 1) return attempt(n - 1);
                reject(err);
            });
        };
        attempt(retries);
    });
}

/**
 * Importa um pacote do NPM.
 *
 * @param {string} pkg - Nome do pacote (ex: "npm:axios", "npm:@whiskeysockets/baileys")
 */
async function importFromNpm(pkg) {
    let cleanPkg = pkg.replace("npm:", "");
    let version = "latest";

    // Verificar se é um pacote com escopo (namespace)
    if (cleanPkg.includes('@')) {
        const parts = cleanPkg.split("@");
        const name = parts[0];
        version = parts[1] || "latest";
        cleanPkg = `${name}`;
    }

    const parts = cleanPkg.split("@");
    const name = parts[0];
    const requestedVersion = parts.length > 1 ? parts[1] : version;

    if (virtualModules.has(name)) return;
    console.log(`📦 Baixando ${name}@${requestedVersion} do NPM...`);

    try {
        const pkgJsonUrl = `https://registry.npmjs.org/${name}/${requestedVersion}`;
        const pkgJson = JSON.parse(await fetch(pkgJsonUrl));

        const mainFile = pkgJson.main || "index.js";
        const dependencies = pkgJson.dependencies || {};

        await Promise.all(Object.keys(dependencies).map(dep => importFromNpm(`npm:${dep}`)));
        await importModuleFiles(name, `https://unpkg.com/${name}@${requestedVersion}/${mainFile}`);
    } catch (err) {
        console.error(`❌ Erro ao importar ${name}: ${err.message}`);
    }
}

/**
 * Importa um repositório do GitHub.
 *
 * @param {string} repo - Repositório no formato "github:owner/repo"
 */
async function importFromGitHub(repo) {
    const [owner, name] = repo.replace("github:", "").split("/");
    if (virtualModules.has(name)) return;

    console.log(`🐙 Baixando ${name} do GitHub (${owner}/${name})...`);

    try {
        const url = `https://raw.githubusercontent.com/${owner}/${name}/main/index.js`;
        await importModuleFiles(name, url);
    } catch (err) {
        console.error(`❌ Erro ao importar ${name} do GitHub: ${err.message}`);
    }
}

/**
 * Baixa e carrega um módulo na memória.
 *
 * @param {string} name - Nome do módulo
 * @param {string} url - URL do arquivo principal
 */
async function importModuleFiles(name, url) {
    try {
        const code = await fetch(url, 3);
        const modulePath = `/virtual_modules/${name}.js`;

        const mod = new Module(modulePath, module);
        mod.filename = modulePath;
        mod.paths = Module._nodeModulePaths("/virtual_modules");
        mod._compile(code, modulePath);

        require.cache[modulePath] = mod;
        virtualModules.set(name, modulePath);
    } catch (err) {
        console.error(`❌ Erro ao carregar ${name}: ${err.message}`);
    }
}

// Intercepta `require()` para buscar módulos virtuais primeiro
const originalRequire = Module.prototype.require;
Module.prototype.require = function (moduleName) {
    if (virtualModules.has(moduleName)) return originalRequire.call(this, virtualModules.get(moduleName));
    return originalRequire.apply(this, arguments);
};

/**
 * Importa módulos do NPM ou GitHub de forma assíncrona.
 *
 * @param {string[]} modules - Lista de módulos para importar
 */
async function importModules(modules) {
    for (const mod of modules) {
        if (mod.startsWith("npm:")) await importFromNpm(mod);
        else if (mod.startsWith("github:")) await importFromGitHub(mod);
        else throw new Error(`Formato inválido: ${mod}`);
    }
}

// Exporta a função de importação
module.exports = { import: importModules };