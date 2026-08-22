/**
 * Minimal ambient declarations for react-katex@3 (the npm package ships no
 * usable type entry — its dist "react-katex.d.ts" path is a docs directory,
 * not a declaration file; PLAN-reuse-adoption R3). Declared surface matches
 * what the runtime component actually accepts (math/children/errorColor/
 * renderError — v3 forwards ONLY these plus displayMode to katex).
 * If upstream ever ships real types, delete this file.
 */
declare module 'react-katex' {
  import type { Component } from 'react';

  export type MathErrorRenderer = (error: Error) => JSX.Element;

  export interface MathComponentProps {
    math?: string;
    children?: string;
    /** KaTeX errorColor setting (rendered error text color). */
    errorColor?: string;
    /**
     * When present, react-katex renders KaTeX with throwOnError:true and hands
     * any ParseError/TypeError to this renderer (contained fallback).
     */
    renderError?: MathErrorRenderer;
  }

  export class InlineMath extends Component<MathComponentProps> {}
  export class BlockMath extends Component<MathComponentProps> {}
}
