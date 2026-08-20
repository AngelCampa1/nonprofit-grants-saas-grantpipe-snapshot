export const PROHIBITED_REPLY_PATTERNS = [
  /The user is asking/i,
  /Let me find/i,
  /Looking at the/i,
  /matching howto/i,
  /in the context/i,
];

export function matchedExpectedTerms(reply, expectedTerms) {
  const normalizedReply = reply.toLowerCase();
  return expectedTerms
    .map((term) => {
      const alternatives = Array.isArray(term) ? term : [term];
      return alternatives.find((alternative) =>
        normalizedReply.includes(alternative.toLowerCase()),
      );
    })
    .filter(Boolean);
}

export function hasNoInternalReasoning(reply) {
  return !PROHIBITED_REPLY_PATTERNS.some((pattern) => pattern.test(reply));
}

export function hasCompleteReply(reply) {
  const trimmed = reply.trim();
  return trimmed.length >= 80 && /[.!?]$/.test(trimmed);
}

export function isScenarioReplyPass({ reply, expectedTerms, hasFreshChatResponse }) {
  if (!reply || !hasFreshChatResponse) {
    return {
      passed: false,
      matchedTerms: [],
      hasAllExpectedTerms: false,
      hasNoInternalReasoning: false,
      hasCompleteReply: false,
    };
  }

  const matchedTerms = matchedExpectedTerms(reply, expectedTerms);
  const hasAllExpectedTerms = matchedTerms.length === expectedTerms.length;
  const noInternalReasoning = hasNoInternalReasoning(reply);
  const completeReply = hasCompleteReply(reply);

  return {
    passed: hasAllExpectedTerms && noInternalReasoning && completeReply,
    matchedTerms,
    hasAllExpectedTerms,
    hasNoInternalReasoning: noInternalReasoning,
    hasCompleteReply: completeReply,
  };
}
