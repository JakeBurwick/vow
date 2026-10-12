const iniContent = Deno.args[0];
const queries = Deno.args.slice(1);

interface IniData {
  [section: string]: {
    [key: string]: string;
  };
}

// Parse INI content
const iniLines = iniContent.split("\n");
const data: IniData = {};
let currentSection: string | null = null;

for (let lineNum = 0; lineNum < iniLines.length; lineNum++) {
  let line = iniLines[lineNum].trim();
  
  // Remove comments after trimming
  if (line.startsWith(";") || line.startsWith("#")) {
    continue;
  }
  
  // Skip blank lines
  if (line === "") {
    continue;
  }
  
  // Check for section
  if (line.startsWith("[") && line.endsWith("]")) {
    const section = line.slice(1, -1).toLowerCase();
    // Validate section name
    if (!/^[a-z0-9_]*$/.test(section)) {
      console.log(`error line ${lineNum + 1}: bad line`);
      Deno.exit(0);
    }
    currentSection = section;
    data[currentSection] = {};
    continue;
  }
  
  // Check for key = value
  const eqIndex = line.indexOf("=");
  if (eqIndex !== -1) {
    if (currentSection === null) {
      console.log(`error line ${lineNum + 1}: key outside section`);
      Deno.exit(0);
    }
    
    const key = line.slice(0, eqIndex).trim().toLowerCase();
    const value = line.slice(eqIndex + 1).trim();
    
    // Validate key name
    if (!/^[a-z0-9_]*$/.test(key)) {
      console.log(`error line ${lineNum + 1}: bad line`);
      Deno.exit(0);
    }
    
    data[currentSection][key] = value;
    continue;
  }
  
  // Unrecognized line
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
  
  const section = parts[0];
  const key = parts[1];
  
  if (data[section] && data[section][key] !== undefined) {
    console.log(`${query} = ${data[section][key]}`);
  } else {
    console.log(`${query} missing`);
  }
}
