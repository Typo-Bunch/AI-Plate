import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { latexToHumanSpeech, convertLatexInText } from "../core/latex-speech.js";

describe("Mathematical LaTeX to Speech Engine", () => {
  test("Converts basic equations and exponents", () => {
    const res = latexToHumanSpeech("E = mc^2");
    assert.ok(res.includes("equals"), "Should include 'equals'");
    assert.ok(res.includes("squared"), "Should include 'squared'");
    assert.ok(!res.includes("^"), "Caret should be converted");
  });

  test("Converts fractions accurately", () => {
    assert.equal(latexToHumanSpeech("\\frac{1}{2}"), "one half");
    assert.equal(latexToHumanSpeech("\\frac{3}{4}"), "three fourths");

    const complexFrac = latexToHumanSpeech("\\frac{a + b}{c}");
    assert.ok(complexFrac.includes("a plus b, over c"), "Complex fraction should use 'over'");
  });

  test("Converts square and n-th roots", () => {
    const sqrtRes = latexToHumanSpeech("\\sqrt{x + y}");
    assert.ok(sqrtRes.includes("the square root of x plus y"), "Should describe square root");

    const cubeRes = latexToHumanSpeech("\\sqrt[3]{8}");
    assert.ok(cubeRes.includes("the cube root of 8"), "Should describe cube root");
  });

  test("Converts quadratic formula with plus-or-minus and roots", () => {
    const res = latexToHumanSpeech("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}");
    assert.ok(res.includes("plus or minus"), "Should convert \\pm");
    assert.ok(res.includes("the square root of"), "Should convert \\sqrt");
    assert.ok(res.includes("over 2 a"), "Should convert denominator");
  });

  test("Converts calculus summations, integrals, and limits", () => {
    const sumRes = latexToHumanSpeech("\\sum_{i=1}^{n} i");
    assert.ok(sumRes.includes("the sum from"), "Should convert sum lower bound");
    assert.ok(sumRes.includes("to n of"), "Should convert sum upper bound");

    const intRes = latexToHumanSpeech("\\int_{0}^{\\infty} e^{-x} dx");
    assert.ok(intRes.includes("the integral from 0 to infinity of"), "Should convert integral bounds");
    assert.ok(intRes.includes("with respect to x"), "Should convert dx to natural spoken differential");

    const limRes = latexToHumanSpeech("\\lim_{x \\to 0} \\frac{\\sin x}{x}");
    assert.ok(limRes.includes("the limit as x approaches 0 of"), "Should convert limit");
    assert.ok(limRes.includes("sine"), "Should convert \\sin");
  });

  test("Converts Greek letters and relational symbols", () => {
    const greekRes = latexToHumanSpeech("\\alpha + \\beta \\le \\gamma");
    assert.ok(greekRes.includes("alpha"), "Should convert \\alpha");
    assert.ok(greekRes.includes("beta"), "Should convert \\beta");
    assert.ok(greekRes.includes("is less than or equal to"), "Should convert \\le");
    assert.ok(greekRes.includes("gamma"), "Should convert \\gamma");

    const neqRes = latexToHumanSpeech("x \\neq y");
    assert.ok(neqRes.includes("is not equal to"), "Should convert \\neq");
  });

  test("convertLatexInText replaces inline, display math, and preserves currency", () => {
    const text = "The energy is given by $E = mc^2$. Cost is $50.00 each. The formula is $$\\frac{a}{b}$$.";
    const converted = convertLatexInText(text);

    // Should convert LaTeX
    assert.ok(converted.includes("m c squared"), "Inline math $E = mc^2$ should be converted");
    assert.ok(converted.includes("a, over b"), "Display math \\frac{a}{b} should be converted");

    // Should preserve ordinary currency
    assert.ok(converted.includes("$50.00"), "Currency amount should remain intact");
  });
});
