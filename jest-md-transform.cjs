/** Jest：将 .md 当作纯文本导出（对齐 webpack asset/source，供 workspace-*-bootstrap 等 import） */
const fs = require('fs');

module.exports = {
  process(_sourceText, filename) {
    const text = fs.readFileSync(filename, 'utf8');
    return { code: `module.exports = ${JSON.stringify(text)};` };
  },
};
