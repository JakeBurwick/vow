const iniFile = Deno.args[0];
const queries = Deno.args.slice(1);

const lines = iniFile.split("\n");
const sections: { [key: string]: { [key: string]: string } } = {};
let currentSection: string | null = null;

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  let line = lines[lineNum - 1];

  // Trim spaces
  line = line.trim();

  // Skip blank lines and comments
  if (line === "" || line.startsWith(";") || line.startsWith("#")) {
    continue;
  }

  // Check for section
  if (line.startsWith("[")) {
    if (!line.endsWith("]")) {
      console.log(`error line ${lineNum}: bad line`);
      Deno.exit(0);
    }
    const sectionName = line.slice(1, -1).trim();
    // Validate section name: lowercase letters, digits, underscores
    if (!/^[a-z0-9_]*$/.test(sectionName) || sectionName === "") {
      console.log(`error line ${lineNum}: bad line`);
      Deno.exit(0);
    }
    currentSection = sectionName;
    if (!(currentSection in sections)) {
      sections[currentSection] = {};
    }
    continue;
  }

  // Check for key = value
  const eqIndex = line.indexOf("=");
  if (eqIndex !== -1) {
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    // Check if key is valid (lowercase letters, digits, underscores)
    if (!/^[a-z0-9_]+$/.test(key)) {
      console.log(`error line ${lineNum}: bad line`);
      Deno.exit(0);
    }

    if (currentSection === null) {
      console.log(`error line ${lineNum}: key outside section`);
      Deno.exit(0);
    }

    sections[currentSection][key] = value;
    continue;
  }

  // If we get here, it's a bad line (not blank, not comment, not section, not key=value)
  console.log(`error line ${lineNum}: bad line`);
  Deno.exit(0);
}

// Process queries
for (const query of queries) {
  const parts = query.split(".");
  if (parts.length !== 2) {
    console.log(`${query} missing`);
    continue;
  }

  const section = parts[0];
  const key = parts[1];

  if (section in sections && key in sections[section]) {
    console.log(`${query} = ${sections[section][key]}`);
  } else {
    console.log(`${query} missing`);
  }
}
