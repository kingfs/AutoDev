export function globMatches(pattern: string, filename: string): boolean {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += char?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
    }
  }
  return new RegExp(`${expression}$`).test(filename);
}
