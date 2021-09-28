import { join, dirname, resolve } from 'path'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { LoaderContext } from 'webpack'
import { print as graphqlPrint } from 'graphql/language/printer'
import { parse as graphqlParse } from 'graphql/language/parser'
import { validate as graphqlValidate } from 'graphql/validation/validate'
import { DocumentNode, DefinitionNode, GraphQLSchema, IntrospectionQuery, buildClientSchema, Source } from 'graphql'
import { removeDuplicateFragments, removeSourceLocations, removeUnusedFragments } from './transforms'

interface LoaderOptions {
  schema?: string
  validate?: boolean
  output?: 'string' | 'document'
  removeUnusedFragments?: boolean
  minify?: boolean
  hash?: boolean | 'replace'
  hashFunction?: (query: string) => string
}

interface CachedSchema {
  mtime: number
  schema: GraphQLSchema
}

const cachedSchemas: Record<string, CachedSchema> = {}

const hashedQueryMap: Record<string, string> = {}
export const hashedQueryMapKey = '__graphql-loader-hashed-query-map__'

async function readFile(loader: LoaderContext<LoaderOptions>, filePath: string): Promise<string> {
  const content = await promisify(loader.fs.readFile)(filePath)
  return content?.toString() ?? ''
}

async function extractImports(
  loader: LoaderContext<LoaderOptions>,
  resolveContext: string,
  source: string,
  document: DocumentNode
) {
  const lines = source.split(/(\r\n|\r|\n)/)
  const imports: Array<Promise<string>> = []
  lines.forEach((line) => {
    // Find lines that match syntax with `#import "<file>"`
    if (line[0] !== '#') return

    const comment = line.slice(1).trim().split(' ')
    if (comment[0] !== 'import') return

    const filePathMatch = comment[1] && comment[1].match(/^["'](.+)["']/)
    if (!filePathMatch || !filePathMatch.length) {
      throw new Error('#import statement must specify a quoted file path')
    }

    const filePath = filePathMatch[1]
    imports.push(
      new Promise((resolve, reject) => {
        loader.resolve(resolveContext, filePath, (err, result) => {
          if (err) {
            reject(err)
          } else if (!result) {
            reject(Error('Could not resolve: ' + filePath))
          } else {
            loader.addDependency(result)
            resolve(result)
          }
        })
      })
    )
  })

  const files = await Promise.all(imports)
  const contents = await Promise.all(
    files.map(async (filePath) => [dirname(filePath), await readFile(loader, filePath)])
  )

  const nodes = await Promise.all(contents.map(([fileContext, content]) => loadSource(loader, fileContext, content)))
  const fragmentDefinitions = nodes.reduce((defs, node) => {
    defs.push(...node.definitions)
    return defs
  }, [] as DefinitionNode[])

  const updatedDocument = {
    ...document,
    definitions: [...document.definitions, ...fragmentDefinitions]
  }
  return updatedDocument
}

async function loadSource(loader: LoaderContext<LoaderOptions>, resolveContext: string, source: string) {
  let document: DocumentNode = graphqlParse(new Source(source, 'GraphQL/file'))
  document = await extractImports(loader, resolveContext, source, document)
  return document
}

async function loadSchema(loader: LoaderContext<LoaderOptions>, options: LoaderOptions): Promise<GraphQLSchema> {
  if (!options.schema) throw Error('schema option must be passed if validate is true')

  const schemaPath = resolve(loader.context, options.schema)
  let stats
  try {
    stats = await promisify(loader.fs.stat)(schemaPath)
  } catch (e) {
    throw Error(`Could not find schema file: "${schemaPath}"`)
  }

  loader.addDependency(schemaPath)

  // Note that we always read the file before we check the cache. This is to put a
  // run-to-completion "mutex" around accesses to cachedSchemas so that updating the cache is not
  // deferred for concurrent loads. This should be reasonably inexpensive because the fs
  // read is already cached by memory-fs.
  const schemaString = await readFile(loader, schemaPath)

  // The cached version of the schema is valid as long its modification time has not changed.
  const lastChangedAt = stats?.mtime.getTime() ?? -1
  if (cachedSchemas[schemaPath] && lastChangedAt <= cachedSchemas[schemaPath].mtime) {
    return cachedSchemas[schemaPath].schema
  }

  const schema = buildClientSchema(JSON.parse(schemaString) as IntrospectionQuery)
  cachedSchemas[schemaPath] = {
    schema,
    mtime: lastChangedAt
  }

  return schema
}

export default async function loader(this: LoaderContext<LoaderOptions>, source: string) {
  this.cacheable()
  const done = this.async()
  if (!done) throw new Error('Loader does not support synchronous processing')

  try {
    const options = this.getOptions()
    const sourceDoc = await loadSource(this, this.context, source)
    const dedupedFragDoc = removeDuplicateFragments(sourceDoc)
    const cleanedSourceDoc = removeSourceLocations(dedupedFragDoc)
    const document = options.removeUnusedFragments ? removeUnusedFragments(cleanedSourceDoc) : cleanedSourceDoc

    if (options.validate) {
      const schema = await loadSchema(this, options)
      const validationErrors = graphqlValidate(schema, document)
      if (validationErrors && validationErrors.length > 0) {
        validationErrors.forEach((err) => this.emitError(err))
      }
    }

    const documentContent = options.output === 'document' ? document : graphqlPrint(document)
    const documentOutput =
      typeof documentContent === 'string' && options.minify ? minifyDocumentString(documentContent) : documentContent

    const hashString =
      !!options.hash &&
      typeof documentOutput === 'string' &&
      (options.hashFunction ?? defaultHashFunction)(documentOutput)
    const hashSource = hashString ? `export const hash=${JSON.stringify(hashString)}\n` : ''
    if (hashString && typeof documentOutput === 'string') {
      hashedQueryMap[hashString] = documentOutput
      // @ts-ignore
      this._compilation?.[hashedQueryMapKey] = hashedQueryMap
    }

    const defaultExportSource =
      'export default ' + (options.hash === 'replace' ? 'hash' : JSON.stringify(documentOutput))
    const outputSource = hashSource + defaultExportSource

    done(null, outputSource)
  } catch (err) {
    done(err)
  }
}

function minifyDocumentString(documentString: string): string {
  return documentString
    .replace(/#.*/g, '') // remove comments
    .replace(/\\n/g, ' ') // replace line breaks with space
    .replace(/\s\s+/g, ' ') // replace consecutive whitespace with one space
    .replace(/\s*({|}|\(|\)|\.|:|,|=|@)\s*/g, '$1') // remove whitespace before/after operators
}

function defaultHashFunction(documentString: string): string {
  return createHash('sha256').update(documentString).digest('hex')
}
