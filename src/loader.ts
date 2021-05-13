import { join, dirname } from 'path'
import { promisify } from 'util'
import { LoaderContext } from 'webpack'
import { print as graphqlPrint } from 'graphql/language/printer'
import { parse as graphqlParse } from 'graphql/language/parser'
import { validate as graphqlValidate } from 'graphql/validation/validate'
import { DocumentNode, DefinitionNode, GraphQLSchema, IntrospectionQuery, buildClientSchema, Source } from 'graphql'
import { removeDuplicateFragments, removeSourceLocations, removeUnusedFragments } from './transforms'

interface LoaderOptions {
  schema?: string
  validate?: boolean
  esModule?: boolean
  output?: 'string' | 'document'
  removeUnusedFragments?: boolean
  minify?: boolean
}

interface CachedSchema {
  mtime: number
  schema: GraphQLSchema
}

const cachedSchemas: Record<string, CachedSchema> = {}

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
    if (line[0] !== '#') {
      return
    }

    const comment = line.slice(1).split(' ')
    if (comment[0] !== 'import') {
      return
    }

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
  let schema = null

  if (options.schema) {
    const schemaPath = await findFileInTree(loader, loader.context, options.schema)
    loader.addDependency(schemaPath)

    const stats = await promisify(loader.fs.stat)(schemaPath)
    const lastChangedAt = stats?.mtime.getTime() ?? -1

    // Note that we always read the file before we check the cache. This is to put a
    // run-to-completion "mutex" around accesses to cachedSchemas so that updating the cache is not
    // deferred for concurrent loads. This should be reasonably inexpensive because the fs
    // read is already cached by memory-fs.
    const schemaString = await readFile(loader, schemaPath)

    // The cached version of the schema is valid as long its modification time has not changed.
    if (cachedSchemas[schemaPath] && lastChangedAt <= cachedSchemas[schemaPath].mtime) {
      return cachedSchemas[schemaPath].schema
    }

    schema = buildClientSchema(JSON.parse(schemaString) as IntrospectionQuery)
    cachedSchemas[schemaPath] = {
      schema,
      mtime: lastChangedAt
    }
  }

  if (!schema) {
    throw new Error('schema option must be passed if validate is true')
  }

  return schema
}

async function loadOptions(loader: LoaderContext<LoaderOptions>) {
  const options = loader.getOptions()
  return {
    ...options,
    esModule: typeof options.esModule !== 'undefined' ? options.esModule : true,
    schema: options.validate ? await loadSchema(loader, options) : undefined
  }
}

/**
 * findFileInTree returns the path for the requested file given the current context,
 * walking up towards the root until it finds the file. If the function fails to find
 * the file, it will throw an error.
 */
async function findFileInTree(loader: LoaderContext<LoaderOptions>, context: string, schemaPath: string) {
  const stat = promisify(loader.fs.stat)
  let currentContext = context
  while (true) {
    const fileName = join(currentContext, schemaPath)
    try {
      if ((await stat(fileName))?.isFile()) return fileName
    } catch {}

    const parent = dirname(currentContext)
    if (parent === currentContext) {
      // Reached root of the fs, but we still haven't found anything.
      throw new Error(`Could not find schema file '${schemaPath} from any parent of '${context}'`)
    }
    currentContext = parent
  }
}

export default async function loader(this: LoaderContext<LoaderOptions>, source: string) {
  this.cacheable()
  const done = this.async()
  if (!done) throw new Error('Loader does not support synchronous processing')

  try {
    const options = await loadOptions(this)
    const sourceDoc = await loadSource(this, this.context, source)
    const dedupedFragDoc = removeDuplicateFragments(sourceDoc)
    const cleanedSourceDoc = removeSourceLocations(dedupedFragDoc)
    const document = options.removeUnusedFragments ? removeUnusedFragments(cleanedSourceDoc) : cleanedSourceDoc

    if (options.schema) {
      const validationErrors = graphqlValidate(options.schema, document)
      if (validationErrors && validationErrors.length > 0) {
        validationErrors.forEach((err) => this.emitError(err))
      }
    }

    const documentContent = options.output === 'document' ? document : graphqlPrint(document)
    const documentOutput =
      typeof documentContent === 'string' && options.minify ? minifyDocumentString(documentContent) : documentContent
    const defaultExportDef = options.esModule ? 'export default ' : 'module.exports='
    const outputSource = defaultExportDef + JSON.stringify(documentOutput)
    done(null, outputSource)
  } catch (err) {
    done(err)
  }
}

function minifyDocumentString(documentString: string) {
  return documentString
    .replace(/#.*/g, '') // remove comments
    .replace(/\\n/g, ' ') // replace line breaks with space
    .replace(/\s\s+/g, ' ') // replace consecutive whitespace with one space
    .replace(/\s*({|}|\(|\)|\.|:|,|=|@)\s*/g, '$1') // remove whitespace before/after operators
}

export { removeDuplicateFragments, removeSourceLocations, removeUnusedFragments } from './transforms'
