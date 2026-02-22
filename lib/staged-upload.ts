// Module-level file staging between homepage and /dashboard/new.
// Survives client-side navigation (router.push) within the same tab.
// Does not survive a hard refresh — user re-selects the file in that case.

let stagedFile: File | null = null

export function stageFile(file: File): void {
  stagedFile = file
}

export function getStagedFile(): File | null {
  return stagedFile
}

export function clearStagedFile(): void {
  stagedFile = null
}
