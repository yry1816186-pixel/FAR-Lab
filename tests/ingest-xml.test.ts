import { describe, expect, it } from 'vitest';
import { parseXml, findAll, findFirst, childrenNamed, textOf, attrAny, serializeXml } from '../src/ingest/xml';

describe('ingest xml micro-parser', () => {
  it('parses elements, attributes, namespaces, text', () => {
    const r = parseXml('<?xml version="1.0"?><article id="a1"><tei:header xlink:href="u1">T</tei:header></article>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.root.localName).toBe('article');
    const el = findFirst(r.root, 'header');
    expect(el).not.toBeNull();
    expect(el!.name).toBe('tei:header');
    expect(attrAny(el!, 'href')).toBe('u1');
    expect(textOf(el!)).toBe('T');
  });

  it('decodes numeric and named entities in text and attributes', () => {
    const r = parseXml('<p alpha="x">&#946; &amp; &lt;z&gt; &ndash;</p>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(textOf(r.root)).toBe('β & <z> –');
    expect(r.root.attrs['alpha']).toBe('x');
  });

  it('skips comments and processing instructions', () => {
    const r = parseXml('<a><!-- c --><p/><?pi data?></a>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(findAll(r.root, 'p').length).toBe(1);
  });

  it('nests and returns children in document order', () => {
    const r = parseXml('<body><p>1</p><sec><p>2</p></sec><p>3</p></body>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(findAll(r.root, 'p').map(textOf)).toEqual(['1', '2', '3']);
    expect(childrenNamed(r.root, 'p').length).toBe(2);
  });

  it('rejects mismatched tags with a precise error', () => {
    const r = parseXml('<a><p></a>');
    expect(r.status).toBe('error');
    if (r.status !== 'error') return;
    expect(r.message).toMatch(/mismatched close tag/);
  });

  it('rejects unclosed elements and trailing content', () => {
    expect(parseXml('<a><p>').status).toBe('error');
    expect(parseXml('<a/>x').status).toBe('error');
    expect(parseXml('').status).toBe('error');
  });

  it('rejects doctype (out of scope) loudly, not silently', () => {
    const r = parseXml('<!DOCTYPE a><a/>');
    expect(r.status).toBe('error');
    if (r.status !== 'error') return;
    expect(r.message).toMatch(/DOCTYPE/);
  });

  it('round-trips MathML through serializeXml with escaping', () => {
    const r = parseXml('<math><mi>&#946;</mi><mo>&lt;</mo></math>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const s = serializeXml(r.root);
    const back = parseXml(s);
    expect(back.status).toBe('ok');
    if (back.status !== 'ok') return;
    expect(textOf(back.root)).toBe('β<');
  });

  it('self-closing tags carry no children', () => {
    const r = parseXml('<fig><graphic xlink:href="f1.png"/></fig>');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const g = findFirst(r.root, 'graphic');
    expect(g!.children.length).toBe(0);
    expect(g!.attrs['xlink:href']).toBe('f1.png');
  });
});
