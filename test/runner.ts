import { webpack } from 'webpack'
import { join } from 'path'
import * as MemoryFileSystem from 'memory-fs'

const loaderPath = require.resolve('../src/loader')

export class TestRunError extends Error {
  constructor(public errors: webpack.StatsError[]) {
    super(`Test Run Compiler Error:\n${errors.map((err) => err.message).join('\n')}`)
    Object.setPrototypeOf(this, TestRunError.prototype)
  }
}

export function runFixture(fixtureName: string): Promise<{}> {
  const config = require(join(__dirname, 'fixtures', fixtureName, 'webpack.config.ts'))

  return new Promise((resolve, reject) => {
    const fs = new MemoryFileSystem()

    const compiler = webpack({
      module: {
        rules: [
          {
            test: /\.graphql$/,
            exclude: /node_modules/,
            use: [{ loader: loaderPath }]
          }
        ]
      },
      output: {
        path: '/',
        filename: 'bundle.js',
        library: { type: 'commonjs2' },
        iife: false
      },
      ...config
    })

    compiler.outputFileSystem = fs

    compiler.run((err, stats) => {
      if (err) {
        reject(err)
      } else if (!stats) {
        reject(Error('No stats'))
      } else {
        if (stats.hasErrors()) {
          const errors = stats.toJson().errors
          reject(errors ? new TestRunError(errors) : Error('Unknown error'))
          return
        }
        const output = fs.readFileSync('/bundle.js').toString() as string
        resolve(eval(output))
      }
    })
  })
}
