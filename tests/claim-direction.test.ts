import { describe, expect, it } from 'vitest';
import { assertionDirection, directionPairContext } from '../src/domain/claim-direction.js';

describe('assertionDirection (deterministic lexical direction)', () => {
  it('increase-class operator reads +1, decrease-class reads -1', () => {
    expect(assertionDirection('Compound F increases drought tolerance in maize')).toEqual({
      kind: 'directional', dir: 1, negated: false, operators: ['increases'],
    });
    expect(assertionDirection('Compound F reduces kernel yield under drought')).toEqual({
      kind: 'directional', dir: -1, negated: false, operators: ['reduces'],
    });
  });

  it('an explicit negator flips the effective direction, not the verb class', () => {
    const d = assertionDirection('Editing does not increase kernel yield under drought');
    expect(d).toEqual({ kind: 'directional', dir: 1, negated: true, operators: ['increase'] });
  });

  it('subject-negated assertions abstain (operator subject flips polarity)', () => {
    expect(assertionDirection('Loss of DREB function reduces kernel yield')).toBeNull();
    expect(assertionDirection('Depletion of auxin inhibits root growth')).toBeNull();
  });

  it('mixed up+down operators inside one text abstain', () => {
    expect(assertionDirection('Increasing drought stress decreases yield and promotes root growth')).toBeNull();
  });

  it('no directional operator abstains', () => {
    expect(assertionDirection('The edited lines carried a silent substitution in DREB')).toBeNull();
  });

  it('the negator itself never masquerades as an operator token', () => {
    // "cannot" survives the length floor as a token but is not in any lexicon
    const d = assertionDirection('The construct cannot promote flowering');
    expect(d).toEqual({ kind: 'directional', dir: 1, negated: true, operators: ['promote'] });
  });

  it('explicit null-outcome phrasing reads kind=null (the measured econ miss class)', () => {
    // compound head noun ("employment effects") carries the null, not just the bare noun
    expect(assertionDirection('No negative employment effects on low-wage workers overall')).toEqual({
      kind: 'null', phrase: 'no negative employment effects',
    });
    expect(assertionDirection('The two formulations showed no significant difference in survival')).toMatchObject({ kind: 'null' });
    expect(assertionDirection('Edited lines were indistinguishable from controls')).toMatchObject({ kind: 'null' });
  });

  it('looser null phrasing about a third quantity stays unread (precision guard)', () => {
    // "no evidence of publication bias" is a null about bias, not about the
    // studied effect — must not license any pair reading
    expect(assertionDirection('The review found no evidence of publication bias in this literature')).toBeNull();
  });

  it('a null phrase and a direction operator in one text abstain (which quantity?)', () => {
    expect(assertionDirection('Treatment increases yield in maize and shows no adverse effects on soil')).toBeNull();
  });
});

describe('directionPairContext (cross-paper direction anchor)', () => {
  it('opposite verbs on a shared subject are direct contradiction evidence', () => {
    const a = directionPairContext('Base editing increases kernel yield under drought', 'Base editing reduces kernel yield under drought');
    expect(a?.opposite).toBe(true);
    expect(a?.context).toContain('directional opposition');
    expect(a?.context).toContain('increases');
    expect(a?.context).toContain('reduces');
  });

  it('assertion vs negation of the same operator is opposition', () => {
    const a = directionPairContext(
      'Base editing increases kernel yield under drought',
      'Base editing does not increase kernel yield under drought',
    );
    expect(a?.opposite).toBe(true);
  });

  it('double negation with opposite verbs is opposition (not-reduce vs not-increase)', () => {
    const a = directionPairContext(
      'Editing does not reduce kernel yield under drought',
      'Editing fails to increase kernel yield under drought',
    );
    expect(a?.opposite).toBe(true);
  });

  it('same effective direction is corroboration evidence, not opposition', () => {
    const plain = directionPairContext(
      'Base editing increases kernel yield under drought',
      'The edited construct promotes yield gains in dry seasons',
    );
    expect(plain?.opposite).toBe(false);
    expect(plain?.context).toContain('same effective direction');
    const bothNegated = directionPairContext(
      'Editing does not increase kernel yield under drought',
      'Editing failed to promote any yield gain under drought',
    );
    expect(bothNegated?.opposite).toBe(false);
  });

  it('abstains when either side carries no safe direction reading', () => {
    expect(directionPairContext('Base editing increases kernel yield', 'The construct carried a silent substitution')).toBeNull();
    expect(directionPairContext('Loss of DREB reduces yield', 'Editing increases yield')).toBeNull();
  });

  it('null vs clean directional is opposition (the live probe miss, verbatim corpus phrasing)', () => {
    const a = directionPairContext(
      'No negative employment effects on low-wage workers overall',
      'Minimum wage reduces employment in small firms',
    );
    expect(a?.opposite).toBe(true);
    expect(a?.context).toContain('null-vs-effect opposition');
    expect(a?.context).toContain('reduces');
  });

  it('null vs negated directional abstains ("does not increase" is null-or-opposite, not provably opposite)', () => {
    expect(directionPairContext(
      'No significant difference in yield between edited and control lines',
      'Editing does not increase kernel yield under drought',
    )).toBeNull();
  });

  it('null vs null is corroboration of absence', () => {
    const a = directionPairContext(
      'No negative employment effects on low-wage workers overall',
      'The policy shows no significant impact on teen employment',
    );
    expect(a?.opposite).toBe(false);
    expect(a?.context).toContain('corroboration of a null finding');
  });
});
