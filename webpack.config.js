const path = require('path');

const CleanWebpackPlugin = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackTemplate = require('html-webpack-template');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { ProvidePlugin } = require('webpack');

module.exports = {
  mode: 'production',
  target: 'web',
  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].js'
  },
  entry: {
    index: './ui/entry-index.js',
    perf: './ui/entry-perf.js',
    logviewer: './ui/entry-logviewer.js',
    login: './ui/entry-login.jsx',
    userguide: './ui/entry-userguide.js',
    testview: './ui/test-view/index.jsx',
    'intermittent-failures': './ui/intermittent-failures/index.jsx',
  },
  resolve: {
    extensions: [
      '.js',
      '.jsx',
    ]
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            options: {
              attrs: [
                'img:src',
                'link:href',
              ]
            }
          }
        ]
      },
      {
        test: /\.jsx?$/,
        include: [
          path.resolve(__dirname, 'ui'),
        ],
        use: [
          {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              babelrc: false,
              plugins: [
                '@babel/plugin-syntax-dynamic-import',
                [
                  '@babel/plugin-proposal-class-properties',
                  {
                    loose: true
                  }
                ]
              ],
              presets: [
                [
                  '@babel/preset-env',
                  {
                    debug: false,
                    modules: false,
                    useBuiltIns: 'entry',
                    targets: {
                      browsers: [
                        'last 1 Chrome versions',
                        'last 1 Edge versions',
                        'last 1 Firefox versions',
                        'last 1 Safari versions'
                      ]
                    }
                  }
                ],
                [
                  '@babel/preset-react',
                  {
                    development: false,
                    useBuiltIns: true
                  }
                ]
              ]
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 0
            }
          }
        ]
      },
      {
        test: /\.(eot|ttf|woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[hash].[ext]'
            }
          }
        ]
      },
      {
        test: /\.(ico|png|jpg|jpeg|gif|svg|webp)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 8192,
              name: '[name].[hash].[ext]'
            }
          }
        ]
      },
    ]
  },
  node: {
    Buffer: false,
    fs: 'empty',
    tls: 'empty'
  },
  optimization: {
    minimize: false,
    splitChunks: {
      chunks: 'all',
      name: false
    },
    runtimeChunk: 'single'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './ui/index.html',
      inject: true,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'index.html',
      chunks: [
        'index'
      ]
    }),
    new HtmlWebpackPlugin({
      template: './ui/perf.html',
      inject: true,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'perf.html',
      chunks: [
        'perf'
      ]
    }),
    new HtmlWebpackPlugin({
      template: './ui/logviewer.html',
      inject: true,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'logviewer.html',
      chunks: [
        'logviewer'
      ]
    }),
    new HtmlWebpackPlugin({
      template: HtmlWebpackTemplate,
      inject: false,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'login.html',
      chunks: [
        'login'
      ],
      title: 'Treeherder Login'
    }),
    new HtmlWebpackPlugin({
      template: './ui/userguide.html',
      inject: true,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'userguide.html',
      chunks: [
        'userguide'
      ]
    }),
    new HtmlWebpackPlugin({
      template: HtmlWebpackTemplate,
      inject: false,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'testview.html',
      chunks: [
        'testview'
      ],
      title: 'Treeherder Test View'
    }),
    new HtmlWebpackPlugin({
      template: HtmlWebpackTemplate,
      inject: false,
      appMountId: 'root',
      xhtml: true,
      mobile: true,
      minify: {
        useShortDoctype: true,
        keepClosingSlash: true,
        collapseWhitespace: true,
        preserveLineBreaks: true
      },
      filename: 'intermittent-failures.html',
      chunks: [
        'intermittent-failures'
      ],
      title: 'Intermittent Failures View'
    }),
    new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' }),
    new CleanWebpackPlugin(['dist']),
    new CopyWebpackPlugin([
      'ui/contribute.json',
      'ui/revision.txt',
      'ui/robots.txt'
    ]),
    new ProvidePlugin({
      jQuery: 'jquery',
      'window.jQuery': 'jquery'
    }),
  ],
  stats: 'minimal',
  performance: false,
};
