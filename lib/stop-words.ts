// Common English words too frequent to say anything about a text's topic.
// Both keyword extractors (the offline fake AI and the fallback embedding)
// skip them.
export const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "are", "was",
  "but", "not", "you", "your", "they", "their", "there", "what", "when",
  "which", "will", "into", "about", "than", "then", "been", "were", "also",
  "more", "most", "some", "such", "these", "those", "would", "could", "should",
  "make", "made", "much", "many", "very", "just", "only", "over", "after",
  "before", "between", "where", "while",
]);
