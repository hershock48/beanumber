// In-process TypeScript loader: tests work on restricted Windows hosts without child processes.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }, fileName: filename });
  module._compile(result.outputText, filename);
};
for (const filename of fs.readdirSync(path.join(__dirname, '../tests')).filter(f => f.endsWith('.test.ts')).sort()) {
  require(path.join(__dirname, '../tests', filename));
}
