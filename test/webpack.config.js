/*eslint-env node */
const webpack = require('webpack');
const path = require('path');

module.exports = {
    context: __dirname,
    entry: './fixtures/loader.js',
    output: {
        filename: 'bundle.js',
        path: path.join(__dirname, './fixtures')
    },
    performance: { hints: false },
    optimization: { minimize: false },
    module: {
        rules: [{
            test: /\.js$/,
            enforce: 'pre',
            use: ['source-map-loader']
        }]
    },
    devtool: 'source-map',
    resolve: {
        fallback: {
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            util: 'util',
            buffer: 'buffer'
        },
        alias: {
            process: 'process/browser'
        }
    },
    plugins: [
        new webpack.ProvidePlugin({
            process: 'process'
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]
};
