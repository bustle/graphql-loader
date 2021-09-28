"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const webpack_1 = require("webpack");
const loader_1 = require("./loader");
const PluginName = 'GraphQLLoaderPlugin';
class GraphQLLoaderPlugin {
    constructor(options) {
        this.manifestFilename = (options === null || options === void 0 ? void 0 : options.manifestFilename) || 'graphql-hash-manifest.json';
    }
    apply(compiler) {
        compiler.hooks.thisCompilation.tap(PluginName, (compilation) => {
            compilation.hooks.processAssets.tap({
                name: PluginName,
                stage: webpack_1.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
            }, () => {
                // @ts-ignore
                const hashedQueryMap = compilation[loader_1.hashedQueryMapKey] || {};
                const hashes = Object.keys(hashedQueryMap);
                if (!hashes.length)
                    return;
                const manifest = hashes.sort().reduce((acc, hash) => {
                    acc[hash] = {
                        query: hashedQueryMap[hash],
                        extensions: {
                            persistedQuery: { version: 1, sha256Hash: hash }
                        }
                    };
                    return acc;
                }, {});
                compilation.emitAsset(this.manifestFilename, new webpack_1.sources.RawSource(JSON.stringify(manifest)));
            });
        });
    }
}
exports.default = GraphQLLoaderPlugin;
