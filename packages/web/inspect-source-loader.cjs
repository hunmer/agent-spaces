const { transform } = require("@react-dev-inspector/babel-plugin");

module.exports = function inspectSourceLoader(source) {
  return transform({
    rootPath: this.rootContext,
    filePath: this.resourcePath,
    sourceCode: source,
  });
};
