module.exports = {
  context: __dirname,
  entry: './query.graphql',
  module: {
    rules: [
      {
        test: /\.graphql$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('../../../src/loader'),
            options: { validate: true, schema: './schema.json' }
          }
        ]
      }
    ]
  }
}
