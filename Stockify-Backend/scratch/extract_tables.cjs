const fs = require('fs');
const path = require('path');

function findTablesInDir(dir, tables = new Set()) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        findTablesInDir(fullPath, tables);
      }
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Match FROM <table>, JOIN <table>, INSERT INTO <table>, UPDATE <table>
      const regex = /(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z0-9_]+)/gi;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const table = match[1].toLowerCase();
        // Ignore keywords
        if (!['(select', 'select', 'where', 'and', 'or', 'set', 'values', 'on'].includes(table)) {
          tables.add(table);
        }
      }
    }
  }
  return tables;
}

const tables = findTablesInDir(__dirname);
console.log(Array.from(tables).sort());
