import Table from "cli-table3";
import { Command } from "commander";

export function isJson(cmd: Command): boolean {
  return cmd.optsWithGlobals().json === true;
}

export function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers, style: { head: ["cyan"] } });
  rows.forEach((r) => table.push(r));
  console.log(table.toString());
}

export function formatWei(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") return "0.00";
  const num = Number(value) / 1e18;
  if (isNaN(num)) return "0.00";
  return num.toFixed(Math.abs(num) < 1 ? 6 : 2);
}

export function handleError(error: any): void {
  console.error("Error:", typeof error === "string" ? error : error?.message || JSON.stringify(error));
  process.exit(1);
}

/**
 * Print a standard transaction result (success message or failure with exit).
 */
export function printTxResult(program: Command, tx: any, successMsg: string): void {
  const status = tx?.effects?.status?.status;
  const error = tx?.effects?.status?.error;
  if (isJson(program)) return printJson({ digest: tx?.digest, status, error });
  if (status === "failure") {
    console.error(`Failed: ${error}`);
    process.exit(1);
  }
  console.log(`${successMsg} Tx: ${tx?.digest}`);
}

/**
 * Parse and validate amount string. Exits with error if invalid.
 */
export function parseAmount(raw: string): number {
  const val = Number(raw);
  if (isNaN(val) || val <= 0) {
    handleError(`Invalid amount: "${raw}". Must be a positive number.`);
  }
  return val;
}

/**
 * Normalize a symbol to include "-PERP" suffix if missing.
 */
export function normalizeSymbol(s: string): string {
  return s.includes("-") ? s : `${s}-PERP`;
}
