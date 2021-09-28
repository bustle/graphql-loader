"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashedQueryMapKey = void 0;
const path_1 = require("path");
const util_1 = require("util");
const crypto_1 = require("crypto");
const printer_1 = require("graphql/language/printer");
const parser_1 = require("graphql/language/parser");
const validate_1 = require("graphql/validation/validate");
const graphql_1 = require("graphql");
const transforms_1 = require("./transforms");
const cachedSchemas = {};
const hashedQueryMap = {};
exports.hashedQueryMapKey = '__graphql-loader-hashed-query-map__';
async function readFile(loader, filePath) {
    var _a;
    const content = await (0, util_1.promisify)(loader.fs.readFile)(filePath);
    return (_a = content === null || content === void 0 ? void 0 : content.toString()) !== null && _a !== void 0 ? _a : '';
}
async function extractImports(loader, resolveContext, source, document) {
    const lines = source.split(/(\r\n|\r|\n)/);
    const imports = [];
    lines.forEach((line) => {
        // Find lines that match syntax with `#import "<file>"`
        if (line[0] !== '#')
            return;
        const comment = line.slice(1).trim().split(' ');
        if (comment[0] !== 'import')
            return;
        const filePathMatch = comment[1] && comment[1].match(/^["'](.+)["']/);
        if (!filePathMatch || !filePathMatch.length) {
            throw new Error('#import statement must specify a quoted file path');
        }
        const filePath = filePathMatch[1];
        imports.push(new Promise((resolve, reject) => {
            loader.resolve(resolveContext, filePath, (err, result) => {
                if (err) {
                    reject(err);
                }
                else if (!result) {
                    reject(Error('Could not resolve: ' + filePath));
                }
                else {
                    loader.addDependency(result);
                    resolve(result);
                }
            });
        }));
    });
    const files = await Promise.all(imports);
    const contents = await Promise.all(files.map(async (filePath) => [(0, path_1.dirname)(filePath), await readFile(loader, filePath)]));
    const nodes = await Promise.all(contents.map(([fileContext, content]) => loadSource(loader, fileContext, content)));
    const fragmentDefinitions = nodes.reduce((defs, node) => {
        defs.push(...node.definitions);
        return defs;
    }, []);
    const updatedDocument = {
        ...document,
        definitions: [...document.definitions, ...fragmentDefinitions]
    };
    return updatedDocument;
}
async function loadSource(loader, resolveContext, source) {
    let document = (0, parser_1.parse)(new graphql_1.Source(source, 'GraphQL/file'));
    document = await extractImports(loader, resolveContext, source, document);
    return document;
}
async function loadSchema(loader, options) {
    var _a;
    if (!options.schema)
        throw Error('schema option must be passed if validate is true');
    const schemaPath = (0, path_1.resolve)(loader.context, options.schema);
    let stats;
    try {
        stats = await (0, util_1.promisify)(loader.fs.stat)(schemaPath);
    }
    catch (e) {
        throw Error(`Could not find schema file: "${schemaPath}"`);
    }
    loader.addDependency(schemaPath);
    // Note that we always read the file before we check the cache. This is to put a
    // run-to-completion "mutex" around accesses to cachedSchemas so that updating the cache is not
    // deferred for concurrent loads. This should be reasonably inexpensive because the fs
    // read is already cached by memory-fs.
    const schemaString = await readFile(loader, schemaPath);
    // The cached version of the schema is valid as long its modification time has not changed.
    const lastChangedAt = (_a = stats === null || stats === void 0 ? void 0 : stats.mtime.getTime()) !== null && _a !== void 0 ? _a : -1;
    if (cachedSchemas[schemaPath] && lastChangedAt <= cachedSchemas[schemaPath].mtime) {
        return cachedSchemas[schemaPath].schema;
    }
    const schema = (0, graphql_1.buildClientSchema)(JSON.parse(schemaString));
    cachedSchemas[schemaPath] = {
        schema,
        mtime: lastChangedAt
    };
    return schema;
}
async function loader(source) {
    var _a, _b;
    this.cacheable();
    const done = this.async();
    if (!done)
        throw new Error('Loader does not support synchronous processing');
    try {
        const options = this.getOptions();
        const sourceDoc = await loadSource(this, this.context, source);
        const dedupedFragDoc = (0, transforms_1.removeDuplicateFragments)(sourceDoc);
        const cleanedSourceDoc = (0, transforms_1.removeSourceLocations)(dedupedFragDoc);
        const document = options.removeUnusedFragments ? (0, transforms_1.removeUnusedFragments)(cleanedSourceDoc) : cleanedSourceDoc;
        if (options.validate) {
            const schema = await loadSchema(this, options);
            const validationErrors = (0, validate_1.validate)(schema, document);
            if (validationErrors && validationErrors.length > 0) {
                validationErrors.forEach((err) => this.emitError(err));
            }
        }
        const documentContent = options.output === 'document' ? document : (0, printer_1.print)(document);
        const documentOutput = typeof documentContent === 'string' && options.minify ? minifyDocumentString(documentContent) : documentContent;
        const hashString = !!options.hash &&
            typeof documentOutput === 'string' &&
            ((_a = options.hashFunction) !== null && _a !== void 0 ? _a : defaultHashFunction)(documentOutput);
        const hashSource = hashString ? `export const hash=${JSON.stringify(hashString)}\n` : '';
        if (hashString && typeof documentOutput === 'string') {
            hashedQueryMap[hashString] = documentOutput;
            // @ts-ignore
            (_b = this._compilation) === null || _b === void 0 ? void 0 : _b[exports.hashedQueryMapKey] = hashedQueryMap;
        }
        const defaultExportSource = 'export default ' + (options.hash === 'replace' ? 'hash' : JSON.stringify(documentOutput));
        const outputSource = hashSource + defaultExportSource;
        done(null, outputSource);
    }
    catch (err) {
        const error = err instanceof Error ? err : Error('Unknown Error');
        done(error);
    }
}
exports.default = loader;
function minifyDocumentString(documentString) {
    return documentString
        .replace(/#.*/g, '') // remove comments
        .replace(/\\n/g, ' ') // replace line breaks with space
        .replace(/\s\s+/g, ' ') // replace consecutive whitespace with one space
        .replace(/\s*({|}|\(|\)|\.|:|,|=|@)\s*/g, '$1'); // remove whitespace before/after operators
}
function defaultHashFunction(documentString) {
    return (0, crypto_1.createHash)('sha256').update(documentString).digest('hex');
}
