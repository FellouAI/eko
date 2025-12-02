const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "src");

module.exports = {
  mode: "development",
  devtool: "source-map",
  entry: {
    sidebar: path.join(srcDir, "sidebar/index.tsx"),
    options: path.join(srcDir, "options/index.tsx"),
    background: path.join(srcDir, "background/index.ts"),
    content_script: path.join(srcDir, "content/index.ts"),
  },
  output: {
    path: path.join(__dirname, "dist/js"),
    filename: "[name].js",
  },
  optimization: {
    minimize: false,
    splitChunks: {
      name: "vendor",
      chunks(chunk) {
        return chunk.name !== "background";
      },
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(woff2?|ttf|eot|otf|svg)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/[name][ext]",
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [{ from: "public", to: "../" }],
      options: {},
    }),
  ],
};
