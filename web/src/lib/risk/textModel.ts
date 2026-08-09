// Direct port of app/lib/services/scam_text_matcher.dart.
//
// Runs the TF-IDF + LogisticRegression model trained in
// ml/src/train_text_model.py. Weights ship as JSON (see
// ml/src/export_text_weights.py) and the linear model is evaluated directly
// here, in the browser — nothing about the message leaves the page.
//
// This is an exact reimplementation of sklearn's TfidfVectorizer (word n-grams,
// sublinear tf, idf, L2 norm) followed by the logistic link, not an
// approximation. src/lib/risk/__tests__/parity.test.ts pins it to the Python
// pipeline's predict_proba output at 1e-6 using the same fixture file the Dart
// test uses, so the web and Android clients cannot drift apart.

import { riskResultFromScore, type RiskResult } from './types';

export interface TextModelWeights {
  vocabulary: Record<string, number>;
  idf: number[];
  coef: number[];
  intercept: number;
  sublinear_tf?: boolean;
  ngram_range?: [number, number];
}

const TOKEN_PATTERN = /[a-zA-Z0-9]+/g;

export class ScamTextMatcher {
  private vocabulary: Record<string, number> | null = null;
  private idf: number[] = [];
  private coef: number[] = [];
  private intercept = 0;
  private sublinearTf = true;
  private minN = 1;
  private maxN = 2;

  get isLoaded(): boolean {
    return this.vocabulary !== null;
  }

  loadFromWeights(json: TextModelWeights): void {
    this.vocabulary = json.vocabulary;
    this.idf = json.idf;
    this.coef = json.coef;
    this.intercept = json.intercept;
    this.sublinearTf = json.sublinear_tf ?? true;
    if (json.ngram_range && json.ngram_range.length === 2) {
      this.minN = json.ngram_range[0];
      this.maxN = json.ngram_range[1];
    }
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  }

  private ngrams(tokens: string[]): string[] {
    const grams: string[] = [];
    for (let n = this.minN; n <= this.maxN; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        grams.push(tokens.slice(i, i + n).join(' '));
      }
    }
    return grams;
  }

  /** Scam probability in 0..1. */
  scamProbability(text: string): number {
    const vocab = this.vocabulary;
    if (!vocab) throw new Error('ScamTextMatcher: weights must be loaded before use');

    const counts = new Map<number, number>();
    for (const gram of this.ngrams(this.tokenize(text))) {
      const idx = vocab[gram];
      if (idx !== undefined) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }

    const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

    if (counts.size === 0) return sigmoid(this.intercept);

    const tfidf = new Map<number, number>();
    for (const [idx, count] of counts) {
      const tf = this.sublinearTf ? 1 + Math.log(count) : count;
      tfidf.set(idx, tf * this.idf[idx]);
    }

    let sumSquares = 0;
    for (const v of tfidf.values()) sumSquares += v * v;
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) return sigmoid(this.intercept);

    let z = this.intercept;
    for (const [idx, value] of tfidf) z += (value / norm) * this.coef[idx];
    return sigmoid(z);
  }

  analyze(text: string): RiskResult {
    const probability = this.scamProbability(text);
    const score = Math.round(probability * 100);
    return riskResultFromScore(score, explain(probability));
  }
}

function explain(probability: number): string[] {
  if (probability < 0.35) return ['No scam patterns detected in this message'];
  if (probability < 0.7) return ['Wording resembles promotional or scam messages'];
  return ['This message uses language commonly seen in scam attempts'];
}

const VPA_PATTERN = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/;

/**
 * Pulls a UPI-ID-shaped substring out of free text (an SMS body, a raw QR
 * payload) so a report can be pre-filled even when the caller only has text,
 * not a structured payload.
 */
export function extractVpa(text: string): string | null {
  return VPA_PATTERN.exec(text)?.[0] ?? null;
}
