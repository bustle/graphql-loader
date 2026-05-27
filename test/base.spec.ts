import { runFixture, TestRunError, Bundler } from './runner'

const fixtures = [
  'simple',
  'fragments',
  'fragments-common-duplicates',
  'validator',
  'fail-invalid-document',
  'fail-invalid-field',
  'fail-invalid-schema-path',
  'fail-missing-fragment',
  'fail-missing-schema-path',
  'document-output',
  'filter-unused-fragments',
  'imports',
  'import-from-fragment',
  'two-loaders',
  'minify',
  'hash',
  'hash-replace'
]

const bundlers: Bundler[] = ['webpack', 'rspack']

// Normalize compiler error messages so the same snapshot is produced by both
// webpack and rspack. The two emit very different formatting around the same
// underlying loader/GraphQL errors: rspack prefixes lines with box-drawing
// characters and inlines its internal stack frames, while webpack returns a
// plain "Module ... failed (from <path>): <error>" string.
// Normalize compiler error messages so webpack and rspack produce identical
// snapshots. Strips ANSI color codes, rspack's box-drawing prefix (× ╰─▶ │),
// stack frames, machine-specific paths, and the bundler-specific
// "Module ... failed (from <loader path>):" preamble.
function normalizeError(message: string): string {
  return message
    .replace(/\x1b\[\d+m/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^[\s│╰─▶×]+/, '')
        .replace(/(?:\/[\w@.-]+)+(?::\d+:\d+)?/g, '<path>')
        .trimEnd()
    )
    .filter((line) => line && !/^at\b/.test(line) && !/^Module (build failed|Error) \(from /.test(line))
    .join('\n')
}

bundlers.forEach((bundler) => {
  describe(`graphql-loader (${bundler})`, function () {
    fixtures.forEach((fixturePath) =>
      it(fixturePath, async function () {
        try {
          const document = await runFixture(fixturePath, bundler)
          expect(document).toMatchSnapshot()
        } catch (err) {
          if (err instanceof TestRunError) {
            expect(err.errors.map((e) => normalizeError(e.message))).toMatchSnapshot()
          } else {
            throw err
          }
        }
      })
    )
  })
})
