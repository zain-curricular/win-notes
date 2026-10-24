/** Links a note may open in another app: the schemes the desktop app allows too (src/main/index.ts). */
export const isOpenableLink = (url: string): boolean => /^(https?|mailto):/i.test(url)
