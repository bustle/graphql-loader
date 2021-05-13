import { join } from 'path'
import { WebpackPluginInstance, Compiler, Compilation, sources } from 'webpack'
import { hashedQueryMapKey } from './loader'

const PluginName = 'GraphQLLoaderPlugin'

export default class GraphQLLoaderPlugin implements WebpackPluginInstance {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(PluginName, (compilation) => {
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
          compilation.emitAsset('graphql-hash-manifest.json', new sources.RawSource(content))
        }
      )
    })
  }
}
