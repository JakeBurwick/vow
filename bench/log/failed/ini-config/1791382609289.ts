// Main
const iniContent = Deno.args[0];
const queries = Deno.args.slice(1);

// Parse INI file
const config: Record<string, Record<string, string>> = {};
let currentSection: string | null = null;
const lines = iniContent.split("\n");

for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  let line = lines[lineNum];

  // Trim spaces
  line = line.trim();

  // Skip blank lines, comments
  if (line === "" || line.startsWith(";") || line.startsWith("#")) {
    continue;
  }

  // Check for section
  if (line.startsWith("[") && line.endsWith("]")) {
    const sectionName = line.slice(1, -1).toLowerCase();
    if (!config[sectionName]) {
      config[sectionName] = {};
    }
    currentSection = sectionName;
    continue;
  }

  // Check for key = value
  const eqIdx = line.indexOf("=");
  if (eqIdx !== -1) {
    if (currentSection === null) {
      console.log(`error line ${lineNum + 1}: key outside section`);
      Deno.exit(0);
    }

    const key = line.slice(0, eqIdx).trim().toLowerCase();
    const value = line.slice(eqIdx + 1).trim();
    config[currentSection][key] = value;
    continue;
  }

  // Bad line
  console.log(`error line ${lineNum + 1}: bad line`);
  Deno.exit(0);
}

// Process queries
for (const query of queries) {
  const parts = query.split(".");
  if (parts.length !== 2) {
    console.log(`${query} missing`);
    continue;
  }

  const section = parts[0].toLowerCase();
  const key = parts[1].toLowerCase();

  if (!config[section] || !(key in config[section])) {
    console.log(`${query} missing`);
  } else {
    console.log(`${query} = ${config[section][key]}`);
  }
}
