/**
 * Mathematical LaTeX to Natural Spoken Speech Engine.
 *
 * Converts mathematical LaTeX syntax (delimiters, fractions, exponents,
 * roots, integrals, summations, limits, Greek letters, operators, matrices,
 * and sets) into fluid, human-readable spoken English with natural pauses
 * for high-fidelity neural TTS synthesis.
 */

/**
 * Extracts balanced group enclosed by openChar and closeChar starting at startIndex.
 */
export function extractBalancedGroup(
  str: string,
  startIndex: number,
  openChar: string = "{",
  closeChar: string = "}"
): { content: string; endIndex: number } | null {
  if (startIndex >= str.length || str[startIndex] !== openChar) return null;
  let depth = 0;
  let i = startIndex;

  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      // Skip escaped braces e.g. \{ or \}
      i += 2;
      continue;
    }
    if (str[i] === openChar) {
      depth++;
    } else if (str[i] === closeChar) {
      depth--;
      if (depth === 0) {
        return { content: str.slice(startIndex + 1, i), endIndex: i + 1 };
      }
    }
    i++;
  }
  return null;
}

// ─── Greek Letters Dictionary ────────────────────────────────────────

const GREEK_LETTERS: Record<string, string> = {
  "\\alpha": "alpha",
  "\\beta": "beta",
  "\\gamma": "gamma",
  "\\Gamma": "capital gamma",
  "\\delta": "delta",
  "\\Delta": "capital delta",
  "\\epsilon": "epsilon",
  "\\varepsilon": "epsilon",
  "\\zeta": "zeta",
  "\\eta": "eta",
  "\\theta": "theta",
  "\\Theta": "capital theta",
  "\\vartheta": "theta",
  "\\iota": "iota",
  "\\kappa": "kappa",
  "\\lambda": "lambda",
  "\\Lambda": "capital lambda",
  "\\mu": "mu",
  "\\nu": "nu",
  "\\xi": "xi",
  "\\Xi": "capital xi",
  "\\pi": "pi",
  "\\Pi": "capital pi",
  "\\varpi": "pi",
  "\\rho": "rho",
  "\\varrho": "rho",
  "\\sigma": "sigma",
  "\\Sigma": "capital sigma",
  "\\tau": "tau",
  "\\upsilon": "upsilon",
  "\\Upsilon": "capital upsilon",
  "\\phi": "phi",
  "\\Phi": "capital phi",
  "\\varphi": "phi",
  "\\chi": "chi",
  "\\psi": "psi",
  "\\Psi": "capital psi",
  "\\omega": "omega",
  "\\Omega": "capital omega",
};

// ─── Math Symbols & Relations Dictionary ─────────────────────────────

const MATH_SYMBOLS: Record<string, string> = {
  "\\pm": "plus or minus",
  "\\mp": "minus or plus",
  "\\times": "times",
  "\\cdot": "times",
  "\\div": "divided by",
  "\\ast": "times",
  "\\star": "star",
  "\\bullet": "bullet",
  "\\circ": "degrees",
  "\\degree": "degrees",
  "\\le": "is less than or equal to",
  "\\leq": "is less than or equal to",
  "\\ge": "is greater than or equal to",
  "\\geq": "is greater than or equal to",
  "\\ll": "is much less than",
  "\\gg": "is much greater than",
  "\\ne": "is not equal to",
  "\\neq": "is not equal to",
  "\\approx": "is approximately equal to",
  "\\sim": "is similar to",
  "\\simeq": "is asymptotically equal to",
  "\\equiv": "is equivalent to",
  "\\cong": "is congruent to",
  "\\propto": "is proportional to",
  "\\in": "in",
  "\\notin": "not in",
  "\\subset": "is a subset of",
  "\\subseteq": "is a subset of or equal to",
  "\\supset": "is a superset of",
  "\\supseteq": "is a superset of or equal to",
  "\\cup": "union",
  "\\cap": "intersection",
  "\\setminus": "minus set",
  "\\emptyset": "the empty set",
  "\\varnothing": "the empty set",
  "\\forall": "for all",
  "\\exists": "there exists",
  "\\nexists": "there does not exist",
  "\\nabla": "del",
  "\\partial": "partial",
  "\\infty": "infinity",
  "\\to": "approaches",
  "\\rightarrow": "approaches",
  "\\longrightarrow": "approaches",
  "\\leftarrow": "approached from",
  "\\longleftarrow": "approached from",
  "\\Rightarrow": "implies",
  "\\implies": "implies",
  "\\Leftarrow": "is implied by",
  "\\Leftrightarrow": "if and only if",
  "\\iff": "if and only if",
  "\\perp": "is perpendicular to",
  "\\parallel": "is parallel to",
  "\\angle": "angle",
  "\\triangle": "triangle",
  "\\hbar": "h-bar",
  "\\ell": "l",
  "\\Re": "real part of",
  "\\Im": "imaginary part of",
};

// ─── Mathematical Functions Dictionary ───────────────────────────────

const MATH_FUNCTIONS: Record<string, string> = {
  "\\sin": "sine",
  "\\cos": "cosine",
  "\\tan": "tangent",
  "\\sec": "secant",
  "\\csc": "cosecant",
  "\\cot": "cotangent",
  "\\arcsin": "arc sine",
  "\\arccos": "arc cosine",
  "\\arctan": "arc tangent",
  "\\sinh": "hyperbolic sine",
  "\\cosh": "hyperbolic cosine",
  "\\tanh": "hyperbolic tangent",
  "\\ln": "the natural log of",
  "\\log": "log",
  "\\exp": "exponential of",
  "\\det": "determinant of",
  "\\dim": "dimension of",
  "\\gcd": "greatest common divisor of",
  "\\deg": "degree of",
  "\\min": "minimum",
  "\\max": "maximum",
  "\\sup": "supremum",
  "\\inf": "infimum",
};

// ─── Standard Number Sets ────────────────────────────────────────────

const NUMBER_SETS: Record<string, string> = {
  "\\mathbb{R}": "the real numbers",
  "\\mathbb{C}": "the complex numbers",
  "\\mathbb{Z}": "the integers",
  "\\mathbb{N}": "the natural numbers",
  "\\mathbb{Q}": "the rational numbers",
  "\\mathbf{R}": "the real numbers",
  "\\mathbf{C}": "the complex numbers",
  "\\mathbf{Z}": "the integers",
  "\\mathbf{N}": "the natural numbers",
};

/**
 * Converts a pure LaTeX mathematical expression into natural human-spoken words.
 */
export function latexToHumanSpeech(latex: string): string {
  if (!latex || typeof latex !== "string") return "";

  let expr = latex.trim();

  // 1. Remove outer math wrappers if present
  expr = expr.replace(/^\$\$|\$\$$|^\\\[|\\\]$|^\\\(|\\\)$/g, "").trim();

  // 2. Normalize spaces and backslash formatting
  expr = expr.replace(/\\,/g, " ").replace(/\\;/g, " ").replace(/\\:/g, " ");
  expr = expr.replace(/\\quad/g, " ").replace(/\\qquad/g, " ").replace(/\\!/g, "");

  // 3. Separate digits and concatenated math variables for natural phonetic pronunciation early
  // e.g. 2a -> 2 a, 4ac -> 4 a c, mc -> m c
  expr = separateMathVariables(expr);

  // 4. Handle Number Sets
  for (const [pattern, spoken] of Object.entries(NUMBER_SETS)) {
    expr = expr.split(pattern).join(` ${spoken} `);
  }

  // 5. Handle Text & Styling Wrappers
  expr = replaceTextWrappers(expr);

  // 6. Handle Matrices & Environments
  expr = replaceEnvironments(expr);

  // 7. Handle Limits
  expr = replaceLimits(expr);

  // 8. Handle Sums, Products, and Integrals
  expr = replaceCalculusOperators(expr);

  // 9. Handle Fractions (recursive / balanced)
  expr = replaceFractions(expr);

  // 10. Handle Roots (e.g. \sqrt{x}, \sqrt[3]{x})
  expr = replaceRoots(expr);

  // 11. Handle Accents (\vec, \hat, \bar, \dot, \ddot)
  expr = replaceAccents(expr);

  // 12. Handle Exponents & Powers
  expr = replaceExponents(expr);

  // 13. Handle Subscripts
  expr = replaceSubscripts(expr);

  // 14. Replace Math Functions
  for (const [cmd, spoken] of Object.entries(MATH_FUNCTIONS)) {
    const regex = new RegExp(escapeRegex(cmd) + "(?![a-zA-Z])", "g");
    expr = expr.replace(regex, ` ${spoken} `);
  }

  // 15. Replace Greek Letters
  for (const [cmd, spoken] of Object.entries(GREEK_LETTERS)) {
    const regex = new RegExp(escapeRegex(cmd) + "(?![a-zA-Z])", "g");
    expr = expr.replace(regex, ` ${spoken} `);
  }

  // 16. Replace Math Symbols and Relations
  for (const [cmd, spoken] of Object.entries(MATH_SYMBOLS)) {
    const regex = new RegExp(escapeRegex(cmd) + "(?![a-zA-Z])", "g");
    expr = expr.replace(regex, ` ${spoken} `);
  }

  // 17. Parentheses, Brackets, and Groupings
  expr = expr.replace(/\\left\(/g, " ( ");
  expr = expr.replace(/\\right\)/g, " ) ");
  expr = expr.replace(/\\left\[/g, " [ ");
  expr = expr.replace(/\\right\]/g, " ] ");
  expr = expr.replace(/\\left\\\{/g, " the set of ");
  expr = expr.replace(/\\right\\\}/g, " ");
  expr = expr.replace(/\\\{/g, " the set of ");
  expr = expr.replace(/\\\}/g, " ");
  expr = expr.replace(/\\left\|/g, " absolute value of ");
  expr = expr.replace(/\\right\|/g, " ");

  // 18. Handle Ellipses (\cdots, \ldots, \dots)
  expr = expr.replace(/\\(cdots|ldots|dots|ddots|vdots)/g, " and so on ");

  // 19. Handle common operators and differential notation
  expr = replaceOperatorsAndSymbols(expr);

  // 20. Clean up any leftover LaTeX backslashes or empty braces
  expr = expr.replace(/\\[a-zA-Z]+/g, " ");
  expr = expr.replace(/[{}]/g, " ");

  // 21. Normalize whitespace and punctuation
  expr = expr.replace(/\s+/g, " ");
  expr = expr.replace(/\s*,\s*/g, ", ");
  expr = expr.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  expr = expr.replace(/,\s*,/g, ", ");

  return expr.trim();
}

/**
 * Scans normal markdown or conversational text and converts all LaTeX expressions
 * (both delimited and naked) into natural human-spoken phrases.
 */
export function convertLatexInText(text: string): string {
  if (!text || typeof text !== "string") return "";

  let result = text;

  // 1. Display math blocks: $$ ... $$ and \[ ... \]
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math) => {
    return " " + latexToHumanSpeech(math) + " ";
  });
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => {
    return " " + latexToHumanSpeech(math) + " ";
  });

  // 2. LaTeX environments: \begin{equation}...\end{equation}, \begin{align}...\end{align}, etc.
  result = result.replace(
    /\\begin\{(equation|align|gather|multline|cases|matrix|pmatrix|bmatrix|vmatrix)\*?\}[\s\S]*?\\end\{\1\*?\}/g,
    (math) => {
      return " " + latexToHumanSpeech(math) + " ";
    }
  );

  // 3. Inline math blocks: \( ... \)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => {
    return " " + latexToHumanSpeech(math) + " ";
  });

  // 4. Inline math with single dollar: $ ... $
  // Excludes simple currency strings like "$50" or "$19.99"
  result = result.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
    const trimmed = math.trim();
    // If it's just currency amount e.g. "50" or "50.00", keep original
    if (/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return match;
    }
    // If it has math indicators, LaTeX commands, or algebraic equations
    if (
      trimmed.includes("\\") ||
      trimmed.includes("^") ||
      trimmed.includes("_") ||
      trimmed.includes("=") ||
      trimmed.includes("+") ||
      trimmed.includes("-") ||
      trimmed.includes("*") ||
      trimmed.includes("/") ||
      /[a-zA-Z]/.test(trimmed)
    ) {
      return " " + latexToHumanSpeech(trimmed) + " ";
    }
    return match;
  });

  // 5. Naked LaTeX commands that appear without $ delimiters
  // e.g. \frac{1}{2}, \sqrt{16}, \alpha + \beta, etc.
  if (result.includes("\\")) {
    result = result.replace(
      /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|approx|le|ge|ne|times|pm|cdot)\b[^{}\s]*(\{[^{}]*\})?/g,
      (nakedCmd) => {
        return " " + latexToHumanSpeech(nakedCmd) + " ";
      }
    );
  }

  // Normalize spaces
  result = result.replace(/[ \t]{2,}/g, " ");
  return result;
}

// ─── Helper Implementations ──────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function separateMathVariables(str: string): string {
  let s = str;
  // Separate digits and letters (e.g. 2a -> 2 a, 4ac -> 4 ac)
  s = s.replace(/(\d)([a-zA-Z])/g, "$1 $2");
  s = s.replace(/([a-zA-Z])(\d)/g, "$1 $2");

  // Separate 2-letter or 3-letter variable products that aren't known words/commands
  // e.g. "mc" -> "m c", "ac" -> "a c", "ab" -> "a b", "xy" -> "x y"
  const knownWords = new Set([
    "is", "in", "to", "or", "of", "on", "at", "by", "as", "if", "an", "we", "he", "so",
    "and", "the", "for", "not", "sum", "row", "set", "log", "cos", "sin", "tan", "sec",
    "cot", "csc", "del", "bar", "hat", "dot", "root", "plus", "over", "from", "with",
    "cube", "into", "cases", "double", "prime", "sub", "net", "total", "max", "min",
    "one", "two", "half", "three", "four", "five", "six", "seven", "eight", "nine", "ten"
  ]);

  s = s.replace(/(^|[^\\])\b([a-zA-Z]{2,3})\b/g, (match, prefix, token) => {
    const lower = token.toLowerCase();
    if (knownWords.has(lower)) return match;
    // Split into individual letters
    return prefix + token.split("").join(" ");
  });

  return s;
}

function replaceTextWrappers(str: string): string {
  let result = "";
  let i = 0;
  while (i < str.length) {
    const match = str.slice(i).match(/^\\(text|mathrm|mathit|mathbf|mathcal|operatorname)\s*\{/);
    if (match) {
      const braceIndex = i + match[0].length - 1;
      const group = extractBalancedGroup(str, braceIndex, "{", "}");
      if (group) {
        let inner = group.content.trim();
        if (match[1] === "mathbf") {
          inner = `vector ${inner}`;
        }
        result += ` ${inner} `;
        i = group.endIndex;
        continue;
      }
    }
    result += str[i];
    i++;
  }
  return result;
}

function replaceEnvironments(str: string): string {
  return str.replace(
    /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|cases)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, env, body) => {
      if (env === "cases") {
        const rows = body.split("\\\\").map((r: string) => r.trim()).filter(Boolean);
        return " cases: " + rows.map((r: string) => latexToHumanSpeech(r)).join(", or, ") + " ";
      }
      // Matrix: read by rows
      const rows = body.split("\\\\").map((r: string) => r.trim()).filter(Boolean);
      const rowStrings = rows.map((row: string, idx: number) => {
        const cells = row.split("&").map((c: string) => latexToHumanSpeech(c.trim()));
        return `row ${idx + 1}: ${cells.join(", ")}`;
      });
      return ` matrix with ${rowStrings.join("; ")} `;
    }
  );
}

function replaceLimits(str: string): string {
  let result = "";
  let i = 0;
  while (i < str.length) {
    if (str.slice(i).startsWith("\\lim")) {
      let cursor = i + 4;
      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      if (str[cursor] === "_") {
        cursor++;
        while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
        let condition = "";
        if (str[cursor] === "{") {
          const group = extractBalancedGroup(str, cursor, "{", "}");
          if (group) {
            condition = group.content;
            cursor = group.endIndex;
          }
        } else {
          const tokenMatch = str.slice(cursor).match(/^[^\s^_{}]+/);
          if (tokenMatch) {
            condition = tokenMatch[0];
            cursor += tokenMatch[0].length;
          }
        }
        if (condition) {
          const spokenCondition = latexToHumanSpeech(condition)
            .replace(/approaches/g, "approaches")
            .replace(/to/g, "approaches");
          result += ` the limit as ${spokenCondition} of, `;
          i = cursor;
          continue;
        }
      }
      result += " the limit of ";
      i = cursor;
      continue;
    }
    result += str[i];
    i++;
  }
  return result;
}

function replaceCalculusOperators(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    const opMatch = str.slice(i).match(/^\\(sum|prod|int|iint|iiint|oint)(?![a-zA-Z])/);
    if (opMatch) {
      const op = opMatch[1];
      let cursor = i + opMatch[0].length;
      let lower = "";
      let upper = "";

      // Parse optional subscript and superscript in any order
      for (let pass = 0; pass < 2; pass++) {
        while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
        if (str[cursor] === "_") {
          cursor++;
          if (str[cursor] === "{") {
            const grp = extractBalancedGroup(str, cursor, "{", "}");
            if (grp) {
              lower = grp.content;
              cursor = grp.endIndex;
            }
          } else {
            const m = str.slice(cursor).match(/^[a-zA-Z0-9\\]+/);
            if (m) {
              lower = m[0];
              cursor += m[0].length;
            }
          }
        } else if (str[cursor] === "^") {
          cursor++;
          if (str[cursor] === "{") {
            const grp = extractBalancedGroup(str, cursor, "{", "}");
            if (grp) {
              upper = grp.content;
              cursor = grp.endIndex;
            }
          } else {
            const m = str.slice(cursor).match(/^[a-zA-Z0-9\\]+/);
            if (m) {
              upper = m[0];
              cursor += m[0].length;
            }
          }
        }
      }

      let opName = "the sum";
      if (op === "prod") opName = "the product";
      else if (op === "int") opName = "the integral";
      else if (op === "iint") opName = "the double integral";
      else if (op === "iiint") opName = "the triple integral";
      else if (op === "oint") opName = "the closed contour integral";

      if (lower && upper) {
        result += ` ${opName} from ${latexToHumanSpeech(lower)} to ${latexToHumanSpeech(upper)} of, `;
      } else if (lower) {
        result += ` ${opName} over ${latexToHumanSpeech(lower)} of, `;
      } else {
        result += ` ${opName} of, `;
      }

      i = cursor;
      continue;
    }

    result += str[i];
    i++;
  }

  return result;
}

function replaceFractions(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    const fracMatch = str.slice(i).match(/^\\(frac|dfrac|tfrac|cfrac)(?![a-zA-Z])/);
    if (fracMatch) {
      let cursor = i + fracMatch[0].length;
      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      const numGroup = extractBalancedGroup(str, cursor, "{", "}");
      if (numGroup) {
        cursor = numGroup.endIndex;
        while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
        const denGroup = extractBalancedGroup(str, cursor, "{", "}");
        if (denGroup) {
          const numRaw = numGroup.content.trim();
          const denRaw = denGroup.content.trim();

          // Special clean cases for common fractions
          if (numRaw === "1" && denRaw === "2") {
            result += " one half ";
          } else if (numRaw === "1" && denRaw === "3") {
            result += " one third ";
          } else if (numRaw === "2" && denRaw === "3") {
            result += " two thirds ";
          } else if (numRaw === "1" && denRaw === "4") {
            result += " one fourth ";
          } else if (numRaw === "3" && denRaw === "4") {
            result += " three fourths ";
          } else if (numRaw === "dy" && denRaw === "dx") {
            result += " d y by d x ";
          } else if (numRaw === "d" && denRaw === "dx") {
            result += " d by d x ";
          } else {
            const numSpoken = latexToHumanSpeech(numRaw);
            const denSpoken = latexToHumanSpeech(denRaw);
            result += ` ${numSpoken}, over ${denSpoken} `;
          }

          i = denGroup.endIndex;
          continue;
        }
      }
    }
    result += str[i];
    i++;
  }

  return result;
}

function replaceRoots(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    if (str.slice(i).startsWith("\\sqrt")) {
      let cursor = i + 5;
      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      let degree = "";

      if (str[cursor] === "[") {
        const optGroup = extractBalancedGroup(str, cursor, "[", "]");
        if (optGroup) {
          degree = optGroup.content.trim();
          cursor = optGroup.endIndex;
        }
      }

      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      const bodyGroup = extractBalancedGroup(str, cursor, "{", "}");
      if (bodyGroup) {
        const bodySpoken = latexToHumanSpeech(bodyGroup.content.trim());
        if (!degree || degree === "2") {
          result += ` the square root of ${bodySpoken} `;
        } else if (degree === "3") {
          result += ` the cube root of ${bodySpoken} `;
        } else if (degree === "4") {
          result += ` the fourth root of ${bodySpoken} `;
        } else {
          result += ` the ${latexToHumanSpeech(degree)}-th root of ${bodySpoken} `;
        }

        i = bodyGroup.endIndex;
        continue;
      }
    }

    result += str[i];
    i++;
  }

  return result;
}

function replaceAccents(str: string): string {
  let result = str;
  result = result.replace(/\\vec\{([^}]+)\}/g, "vector $1");
  result = result.replace(/\\hat\{([^}]+)\}/g, "$1 hat");
  result = result.replace(/\\bar\{([^}]+)\}/g, "$1 bar");
  result = result.replace(/\\dot\{([^}]+)\}/g, "$1 dot");
  result = result.replace(/\\ddot\{([^}]+)\}/g, "$1 double dot");
  result = result.replace(/\\tilde\{([^}]+)\}/g, "$1 tilde");
  result = result.replace(/\\overline\{([^}]+)\}/g, "bar over $1");
  return result;
}

function replaceExponents(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    if (str[i] === "^") {
      let cursor = i + 1;
      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      let expContent = "";

      if (str[cursor] === "{") {
        const group = extractBalancedGroup(str, cursor, "{", "}");
        if (group) {
          expContent = group.content.trim();
          cursor = group.endIndex;
        }
      } else {
        const singleMatch = str.slice(cursor).match(/^([a-zA-Z0-9\\]+)/);
        if (singleMatch) {
          expContent = singleMatch[1];
          cursor += singleMatch[1].length;
        }
      }

      if (expContent) {
        if (expContent === "2") {
          result += " squared ";
        } else if (expContent === "3") {
          result += " cubed ";
        } else if (expContent === "\\circ" || expContent === "\\degree") {
          result += " degrees ";
        } else if (expContent === "\\prime" || expContent === "'") {
          result += " prime ";
        } else if (expContent === "\\prime\\prime" || expContent === "''") {
          result += " double prime ";
        } else if (expContent === "-1") {
          result += " inverse ";
        } else {
          result += ` to the power of ${latexToHumanSpeech(expContent)} `;
        }
        i = cursor;
        continue;
      }
    }

    result += str[i];
    i++;
  }

  return result;
}

function replaceSubscripts(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    if (str[i] === "_") {
      let cursor = i + 1;
      while (cursor < str.length && /\s/.test(str[cursor])) cursor++;
      let subContent = "";

      if (str[cursor] === "{") {
        const group = extractBalancedGroup(str, cursor, "{", "}");
        if (group) {
          subContent = group.content.trim();
          cursor = group.endIndex;
        }
      } else {
        const singleMatch = str.slice(cursor).match(/^([a-zA-Z0-9\\]+)/);
        if (singleMatch) {
          subContent = singleMatch[1];
          cursor += singleMatch[1].length;
        }
      }

      if (subContent) {
        if (subContent === "net") result += " net ";
        else if (subContent === "total") result += " total ";
        else if (subContent === "max") result += " maximum ";
        else if (subContent === "min") result += " minimum ";
        else {
          result += ` sub ${latexToHumanSpeech(subContent)} `;
        }
        i = cursor;
        continue;
      }
    }

    result += str[i];
    i++;
  }

  return result;
}

function replaceOperatorsAndSymbols(str: string): string {
  let res = str;

  // Factorial: e.g. n! or 5!
  res = res.replace(/([a-zA-Z0-9\)]+)\s*!/g, "$1 factorial");

  // Arithmetic relations with spaces
  res = res.replace(/([^\s])\s*=\s*/g, "$1 equals, ");
  res = res.replace(/\s*=\s*/g, " equals, ");
  res = res.replace(/([^\s])\s*\+\s*/g, "$1 plus ");
  res = res.replace(/\s*\+\s*/g, " plus ");
  res = res.replace(/([^\s])\s*-\s*/g, "$1 minus ");
  res = res.replace(/\s*-\s*/g, " minus ");
  res = res.replace(/([^\s])\s*\*\s*/g, "$1 times ");
  res = res.replace(/\s*\*\s*/g, " times ");
  res = res.replace(/([^\s])\s*<\s*/g, "$1 is less than ");
  res = res.replace(/\s*<\s*/g, " is less than ");
  res = res.replace(/([^\s])\s*>\s*/g, "$1 is greater than ");
  res = res.replace(/\s*>\s*/g, " is greater than ");

  // Differentials in calculus (e.g. "dx", "dt", "dy", "dz", "d x" at the end of an expression)
  res = res.replace(/\s+d\s*([xyztuvw])\b/g, " with respect to $1");

  return res;
}
