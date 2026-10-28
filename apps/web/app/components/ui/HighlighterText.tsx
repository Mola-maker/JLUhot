import { memo, useMemo, type ReactNode } from "react";

interface HighlighterTextProps {
  text: string;
  className?: string;
  /** Force a specific highlighter color or let auto choose between pink and blue */
  variant?: "auto" | "pink" | "blue" | "yellow";
  /** If true, highlight key news phrases and numbers automatically */
  enabled?: boolean;
}

const HIGHLIGHT_REGEX = /(?:吉林大学|吉大|大模型|人工智能|\bAI\b|深度学习|计算机|软件学院|通信工程|电子学院|科研|重大突破|突破|国家重点|自然科学基金|国家自然科学|ESI|高被引|顶会|顶级期刊|Nature|Science|Cell|IEEE|ACM|NeurIPS|ICML|CVPR|ACL|AAAI|一等奖|二等奖|特等奖|首个|首届|第一|全球首个|全国首个|院士|杰青|重要通知|重磅发布|重磅|最新发布|\b\d+(?:\.\d+)?(?:%|个|项|所|万|亿|篇|场|位|名|条|首|星|分)\b)/gi;

export const HighlighterText = memo(function HighlighterText({
  text,
  className = "",
  variant = "auto",
  enabled = true,
}: HighlighterTextProps) {
  const elements = useMemo(() => {
    if (!enabled || !text) return text;

    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let counter = 0;

    // Reset regex index
    HIGHLIGHT_REGEX.lastIndex = 0;

    while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = HIGHLIGHT_REGEX.lastIndex;

      // Text before match
      if (matchStart > lastIndex) {
        parts.push(text.slice(lastIndex, matchStart));
      }

      const matchedText = match[0];
      const colorClass =
        variant === "pink"
          ? "hl-pink"
          : variant === "blue"
            ? "hl-blue"
            : variant === "yellow"
              ? "hl-yellow"
              : counter % 2 === 0
                ? "hl-pink"
                : "hl-blue";

      counter++;
      parts.push(
        <mark
          key={`${matchStart}-${counter}`}
          className={`font-medium ${colorClass} bg-transparent text-inherit`}
          style={{ WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}
        >
          {matchedText}
        </mark>
      );

      lastIndex = matchEnd;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }, [text, enabled, variant]);

  return <span className={className}>{elements}</span>;
});
