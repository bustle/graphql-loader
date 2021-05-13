import { join } from 'path'
import { WebpackPluginInstance, Compiler, Compilation, sources } from 'webpack'
import { hashedQueryMapKey } from './loader'

const PluginName = 'GraphQLLoaderPlugin'

interface GraphQLLoaderPluginOptions {
  hashManifestFilename?: string
}

export default class GraphQLLoaderPlugin implements WebpackPluginInstance {
  private hashManifestFilename: string

  constructor(options?: GraphQLLoaderPluginOptions) {
    this.hashManifestFilename = options?.hashManifestFilename || 'graphql-hash-manifest.json'
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

          const hashedQueryMapSorted = hashes.sort().reduce((sorted, hash) => {
            sorted[hash] = hashedQueryMap[hash]
            return sorted
          }, {} as Record<string, string>)

          const content = JSON.stringify(hashedQueryMapSorted, null, 2)
          compilation.emitAsset(this.hashManifestFilename, new sources.RawSource(content))
        }
      )
    })
  }
}
