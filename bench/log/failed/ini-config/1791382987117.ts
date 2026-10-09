interface IniData {
  [section: string]: {
    [key: string]: string;
  };
}

try {
  const iniContent = Deno.args[0];
  const queries = Deno.args.slice(1);

  const lines = iniContent.split("\n");
  const data: IniData = {};
  let currentSection: string | null = null;
  let hasError = false;
  let errorMessage = "";

  // Parse the INI file
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmedLine = line.trim();

    // Skip blank lines and comments
    if (trimmedLine === "" || trimmedLine.startsWith(";") || trimmedLine.startsWith("#")) {
      continue;
    }

    // Check if it's a section header
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const sectionName = trimmedLine.slice(1, -1).toLowerCase();
      currentSection = sectionName;
      if (!data[currentSection]) {
        data[currentSection] = {};
      }
      continue;
    }

    // Check if it's a key=value pair
    if (trimmedLine.includes("=")) {
      if (currentSection === null) {
        // Error: key outside section
        hasError = true;
        errorMessage = `error line ${lineNum + 1}: key outside section`;
        break;
      }

      const eqIndex = trimmedLine.indexOf("=");
      const key = trimmedLine.substring(0, eqIndex).trim();
      const value = trimmedLine.substring(eqIndex + 1).trim();

      // Validate key: lowercase letters, digits, underscores only
      if (!/^[a-z0-9_]+$/.test(key)) {
        hasError = true;
        errorMessage = `error line ${lineNum + 1}: bad line`;
        break;
      }

      data[currentSection][key] = value;
      continue;
    }

    // If we get here, it's a bad line
    hasError = true;
    errorMessage = `error line ${lineNum + 1}: bad line`;
    break;
  }

  if (hasError) {
    console.log(errorMessage);
  } else {
    // Process queries
    for (const query of queries) {
      const [section, key] = query.split(".");

      if (data[section] && key in data[section]) {
        console.log(`${query} = ${data[section][key]}`);
      } else {
        console.log(`${query} missing`);
      }
    }
  }
} catch (error) {
  console.log("error");
}
