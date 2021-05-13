# GraphQL Loader for Webpack

A webpack loader for `.graphql` file query documents. Support for outputting as Document ASTs or strings & schema validation.

### NOTE: This was originally forked from https://github.com/samsarahq/graphql-loader & then heavily modified. Thank you to the authors.

## Installation

```bash
npm install --save-dev @bustle/graphql-loader
```

## Configuration

Add the loader to your webpack config:

```js
module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.graphql$/,
        use: [
          {
            loader: '@bustle/graphql-loader',
            options: {
              // See "Loader Options" below
            }
          }
        ]
      }
    ]
  }
}
```

### Loader Options

#### schema _(string) (default="")_

The location of your graphql introspection query schema JSON file. If used with the `validate` option, this will be used to validate imported queries and fragments.

#### validate _(boolean) (default=false)_

If `true`, the loader will validate the imported document against your specified `schema` file.

#### output _("string" | "document") (default="string")_

Specifies whether or not the imported document should be a printed graphql string, or a graphql `DocumentNode` AST. The latter is useful for interop with [`graphql-tag`](https://github.com/apollographql/graphql-tag#webpack-preprocessing).

#### minify _(boolean) (default=false)_

If `true` and the `output` option is `string`, the loader will strip comments and whitespace from the graphql document strings. This helps to reduce bundled code size.

#### removeUnusedFragments _(boolean) (default=false)_

If `true`, the loader will remove unused fragments from the imported document. This may be useful if a query is importing fragments from a file, but does not use all fragments in that file. Also see [this issue](https://github.com/apollographql/graphql-tag/issues/102).

#### hash _(boolean | "replace") (default=false)_

If `true`, exports an additional constant named `hash` which is a sha256 hash of the query contents. This can be used for [persisted queries](https://www.apollographql.com/docs/apollo-server/performance/apq/).

If `'replace'` is specified, the default export will be replaced with the hash instead of exporting the query. Useful in a production environment if your server is aware of the persisted hashes and you don't want to bundle the queries.

#### hashFunction _(function) (default=defaultHashFunction)_

If using the `hash` option, you can supply a custom hashing function. If not specified, there is a default that uses the built-in node crypto.

## Import statements in `.graphql` files

The loader supports importing `.graphql` files from other `.graphql` files using an `#import` statement. For example:

`query.graphql`:

```graphql
#import "./fragments.graphql"

query {
  ...a
  ...b
}
```

`fragments.graphql`:

```graphql
fragment a on A {}
fragment b on A {
  foo(bar: 1)
}
```

In the above example, fragments `a` and `b` will be made available within `query.graphql`. Note that all fragments in the imported file should be used in the top-level query, or the `removeUnusedFragments` should be specified.
