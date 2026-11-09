export const freeChapterPath = "/learn/dasar/chapter-1";

// R06 accepts only this destination, never arbitrary redirect URLs.
export function freeChapterDestination(value: string | null) {
  return value === freeChapterPath ? freeChapterPath : null;
}
