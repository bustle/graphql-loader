import { join } from 'path'
import { WebpackPluginInstance, Compiler, Compilation, sources } from 'webpack'
import { hashedQueryMapKey } from './loader'

const PluginName = 'GraphQLLoaderPlugin'

interface GraphQLLoaderPluginOptions {
  manifestFilename?: string
}

export default class GraphQLLoaderPlugin implements WebpackPluginInstance {
  private manifestFilename: string

  constructor(options?: GraphQLLoaderPluginOptions) {
    this.manifestFilename = options?.manifestFilename || 'graphql-hash-manifest.json'
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap(PluginName, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PluginName,
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
        },
        () => {
          // @ts-ignore
          const hashedQueryMap = compilation[hashedQueryMapKey] || {}
          const hashes = Object.keys(hashedQueryMap)
          if (!hashes.length) return

          const manifest = hashes.sort().reduce<Record<string, object>>((acc, hash) => {
            acc[hash] = {
              query: hashedQueryMap[hash],
              extensions: {
                persistedQuery: { version: 1, sha256Hash: hash }
              }
            }
            return acc
          }, {})

          compilation.emitAsset(this.manifestFilename, new sources.RawSource(JSON.stringify(manifest)))
        }
      )
    })
  }
}
