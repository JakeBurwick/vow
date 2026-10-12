const args = Deno.args;

if (args.length < 1) {
  console.log("error: missing arguments");
  Deno.exit(1);
}

const iniContent = args[0];
const queries = args.slice(1);

interface Config {
  [section: string]: {
    [key: string]: string;
  };
}

const config: Config = {};
let currentSection: string | null = null;
const lines = iniContent.split("\n");
let hasError = false;

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  let line = lines[lineNum - 1];

  // Trim spaces
  line = line.trim();

  // Ignore blank lines and comments
  if (line === "" || line.startsWith(";") || line.startsWith("#")) {
    continue;
  }

  // Check if it's a section header
  if (line.startsWith("[") && line.endsWith("]")) {
    const sectionName = line.slice(1, -1).trim();
    // Validate section name (lowercase letters, digits, underscores)
    if (!/^[a-z0-9_]+$/.test(sectionName)) {
      console.log(`error line ${lineNum}: bad line`);
      hasError = true;
      break;
    }
    currentSection = sectionName;
    if (!config[currentSection]) {
      config[currentSection] = {};
    }
    continue;
  }

  // Check if it's a key = value line
  const eqIdx = line.indexOf("=");
  if (eqIdx !== -1) {
    if (currentSection === null) {
      console.log(`error line ${lineNum}: key outside section`);
      hasError = true;
      break;
    }

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    // Validate key name (lowercase letters, digits, underscores)
    if (!/^[a-z0-9_]+$/.test(key)) {
      console.log(`error line ${lineNum}: bad line`);
      hasError = true;
      break;
    }

    config[currentSection][key] = value;
    continue;
  }

  // If we get here, it's an unrecognized line
  console.log(`error line ${lineNum}: bad line`);
  hasError = true;
  break;
}

if (!hasError) {
  // Process queries
  for (const query of queries) {
    const parts = query.split(".");
    if (parts.length === 2) {
      const [section, key] = parts;
      if (config[section] && config[section][key] !== undefined) {
        console.log(`${query} = ${config[section][key]}`);
      } else {
        console.log(`${query} missing`);
      }
    } else {
      console.log(`${query} missing`);
    }
  }
}
