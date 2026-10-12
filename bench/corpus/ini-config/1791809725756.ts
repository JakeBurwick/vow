// INI parser
interface INIData {
  [section: string]: {
    [key: string]: string;
  };
}

function parseINI(iniText: string): { data: INIData; error?: string } {
  const data: INIData = {};
  let currentSection: string | null = null;
  const lines = iniText.split("\n");

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    let line = lines[lineNum - 1];

    // Trim spaces
    line = line.trim();

    // Skip blank lines and comments
    if (line === "" || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    // Check for section header
    if (line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.substring(1, line.length - 1).trim();
      // Validate section name: lowercase letters, digits, underscores
      if (!/^[a-z0-9_]+$/.test(sectionName)) {
        return { data, error: `error line ${lineNum}: bad line` };
      }
      currentSection = sectionName;
      if (!data[currentSection]) {
        data[currentSection] = {};
      }
      continue;
    }

    // Check for key = value
    const eqIndex = line.indexOf("=");
    if (eqIndex !== -1) {
      if (currentSection === null) {
        return { data, error: `error line ${lineNum}: key outside section` };
      }

      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();

      // Validate key name: lowercase letters, digits, underscores
      if (!/^[a-z0-9_]+$/.test(key)) {
        return { data, error: `error line ${lineNum}: bad line` };
      }

      data[currentSection][key] = value;
      continue;
    }

    // Unrecognized line
    return { data, error: `error line ${lineNum}: bad line` };
  }

  return { data };
}

function queryINI(data: INIData, query: string): string {
  const parts = query.split(".");
  if (parts.length !== 2) {
    return `${query} missing`;
  }

  const [section, key] = parts;
  if (data[section] && data[section][key] !== undefined) {
    return `${query} = ${data[section][key]}`;
  } else {
    return `${query} missing`;
  }
}

// Main
const iniText = Deno.args[0];

try {
  const { data, error } = parseINI(iniText);

  if (error) {
    console.log(error);
  } else {
    // Process queries from args 1 onwards
    for (let i = 1; i < Deno.args.length; i++) {
      console.log(queryINI(data, Deno.args[i]));
    }
  }
} catch (e) {
  if (e instanceof Error) {
    console.log(e.message);
  } else {
    console.log("error");
  }
}
