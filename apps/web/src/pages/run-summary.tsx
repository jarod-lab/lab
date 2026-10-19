import type { ReactNode } from "react"
import * as css from "sugar-high/lang/css"
import * as diff from "sugar-high/lang/diff"
import * as go from "sugar-high/lang/go"
import * as html from "sugar-high/lang/html"
import * as javascript from "sugar-high/lang/javascript"
import * as json from "sugar-high/lang/json"
import * as markdown from "sugar-high/lang/markdown"
import * as plaintext from "sugar-high/lang/plaintext"
import * as python from "sugar-high/lang/python"
import * as rust from "sugar-high/lang/rust"
import * as shell from "sugar-high/lang/shell"
import * as sql from "sugar-high/lang/sql"
import * as typescript from "sugar-high/lang/typescript"
import * as yaml from "sugar-high/lang/yaml"
import { parse } from "sugar-high/core"
import { lang } from "sugar-high/lang"
import Markdown, { type Components } from "react-markdown"

// The run's summary, written by the agent as Markdown. Raw HTML in the Markdown is not rendered
// (react-markdown ignores it without a raw-HTML plugin). Fenced code is tokenized by sugar-high and
// rendered as React spans, so no markup is injected; each token colours through `--sh-<type>`, which
// app.css maps onto the theme's semantic tokens.

type Grammar = Parameters<typeof parse>[1]

const GRAMMARS: Record<string, Grammar> = {
  css,
  diff,
  go,
  html,
  javascript,
  json,
  markdown,
  plaintext,
  python,
  rust,
  shell,
  sql,
  typescript,
  yaml,
} as Record<string, Grammar>

function CodeBlock({ code, language }: { code: string; language: string | undefined }) {
  const canonical = language ? lang(language) : undefined
  const name = canonical && canonical in GRAMMARS ? canonical : "plaintext"
  const grammar = GRAMMARS[name] ?? plaintext
  const parsed = parse(code, grammar as Grammar)
  return (
    <pre className="run-code" data-language={name}>
      <code>
        {parsed.lines.map((line, lineIndex) => (
          <span key={lineIndex} className="sh__line">
            {line.tokens.map((token, tokenIndex) => (
              <TokenSpan key={tokenIndex} type={token.type} value={token.value} />
            ))}
            {lineIndex < parsed.lines.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  )
}

function TokenSpan({ type, value }: { type: string; value: string }): ReactNode {
  if (type === "space" || type === "break") return value
  return <span className={`sh__token--${type}`}>{value}</span>
}

/** The text of a code element's children: react-markdown gives strings (or a list of them). */
const textOf = (node: ReactNode): string => {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map((child: ReactNode) => textOf(child)).join("")
  return ""
}

const components: Components = {
  // react-markdown wraps fenced code in <pre>; CodeBlock is the <pre>, so the wrapper goes.
  pre: ({ children }) => <>{children}</>,
  code({ className, children }) {
    const language = /language-([\w+-]+)/.exec(className ?? "")?.[1]
    const text = textOf(children).replace(/\n$/, "")
    if (language === undefined && !text.includes("\n")) {
      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{text}</code>
    }
    return <CodeBlock code={text} language={language} />
  },
  a({ href, children }) {
    return (
      <a href={href} className="underline underline-offset-3" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
}

export function RunSummary({ markdown }: { markdown: string }) {
  return (
    <div className="run-summary flex flex-col gap-3 text-[15px] leading-relaxed text-foreground">
      <Markdown components={components}>{markdown}</Markdown>
    </div>
  )
}
