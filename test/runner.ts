import { webpack } from 'webpack'
import { join } from 'path'
import MemoryFileSystem from 'memory-fs'

const loaderPath = require.resolve('../src/loader')

export type Bundler = 'webpack' | 'rspack'

export class TestRunError extends Error {
  constructor(public errors: Array<{ message: string }>) {
    super(`Test Run Compiler Error:\n${errors.map((e) => e.message).join('\n')}`)
  }
}

// Rspack v2 is ESM-only; load it lazily via dynamic import so we don't pay
// the cost when only the webpack tests run. The promise is cached across calls.
let rspackPromise: Promise<typeof import('@rspack/core').rspack> | undefined
const loadRspack = () => (rspackPromise ??= import('@rspack/core').then((m) => m.rspack))

export async function runFixture(fixtureName: string, bundler: Bundler = 'webpack'): Promise<{}> {
  const fixtureConfig = require(join(__dirname, 'fixtures', fixtureName, 'webpack.config.ts'))

  const config: any = {
    module: {
      rules: [{ test: /\.graphql$/, exclude: /node_modules/, use: [{ loader: loaderPath }] }]
    },
    output: { path: '/', filename: 'bundle.js', library: { type: 'commonjs2' }, iife: false },
    ...fixtureConfig
  }

  const compiler: any = bundler === 'rspack' ? (await loadRspack())(config) : webpack(config)

  return new Promise((resolve, reject) => {
    const fs = new MemoryFileSystem()
    compiler.outputFileSystem = fs

    compiler.run((err: Error | null, stats: any) => {
      if (err) return reject(err)
      if (!stats) return reject(Error('No stats'))
      if (stats.hasErrors()) {
        const errors = stats.toJson().errors
        return reject(errors ? new TestRunError(errors) : Error('Unknown error'))
      }
      resolve(eval(fs.readFileSync('/bundle.js').toString()))
    })
  })
}
