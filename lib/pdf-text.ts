// StandardFonts use WinAnsi encoding and throw on characters outside it. Map
// the common smart-punctuation we actually see, then drop anything still
// outside Latin-1 so a PDF always renders. Control characters (other than the
// newline the wrap step splits on) are inside Latin-1 yet still unencodable:
// they turn into spaces.
export function toWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x00-\xFF]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ");
}
