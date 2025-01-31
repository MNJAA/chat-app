const webpack = require("webpack");

module.exports = function override(config, env) {
  config.resolve.fallback = {
    crypto: require.resolve("crypto-browserify"),
    assert: require.resolve("assert/"),
    stream: require.resolve("stream-browserify"),
    process: require.resolve("process/browser"),
    vm: require.resolve("vm-browserify")
  };

  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser"
    })
  );

  return config;
};