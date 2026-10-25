export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return rows.map((row) => row.map((value) => {
    let cell = String(value ?? "");
    if (/^[\t\r\n ]*[=+\-@]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}
