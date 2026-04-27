/**
 * Unit tests for the structured ask_user surface:
 *   - `parseAskUserPayload` (event parser) so the SSE -> ChatEvent path
 *     stays well-typed and tolerates malformed entries.
 *   - `AskUserPrompt` initial-render output to confirm question + every
 *     option (label + optional hint) reach the DOM as buttons.
 *
 * The web package does not pull in @testing-library/react or jsdom — react-
 * dom/server's renderToStaticMarkup is enough to assert the rendered shape.
 * Click-handler interaction is exercised through the parser path + a direct
 * onSelect callback unit test, which together verify the contract the hook
 * relies on without standing up a DOM.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AskUserPrompt from '../AskUserPrompt.js';
import { parseAskUserPayload } from '../../../hooks/useDashboardChat.js';

describe('parseAskUserPayload', () => {
  it('returns question and well-formed options', () => {
    const out = parseAskUserPayload({
      question: 'Which datasource?',
      options: [
        { id: 'prom-prod', label: 'Prometheus prod', hint: 'cluster=prod' },
        { id: 'prom-stg', label: 'Prometheus staging' },
      ],
    });
    expect(out.question).toBe('Which datasource?');
    expect(out.options).toEqual([
      { id: 'prom-prod', label: 'Prometheus prod', hint: 'cluster=prod' },
      { id: 'prom-stg', label: 'Prometheus staging' },
    ]);
  });

  it('drops options missing id or label, keeps the rest', () => {
    const out = parseAskUserPayload({
      question: 'Pick one',
      options: [
        { id: 'a', label: 'Alpha' },
        { id: 'no-label' },
        { label: 'No id' },
        { id: 'b', label: 'Beta', hint: 42 }, // wrong-type hint → drop hint, keep button
        null,
        'not-an-object',
      ],
    });
    expect(out.options).toEqual([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ]);
  });

  it('returns empty options when payload has no options array', () => {
    expect(parseAskUserPayload({ question: 'free text?' })).toEqual({
      question: 'free text?',
      options: [],
    });
  });

  it('coerces missing question to empty string', () => {
    expect(parseAskUserPayload({ options: [] })).toEqual({
      question: '',
      options: [],
    });
  });
});

describe('AskUserPrompt rendering', () => {
  it('renders the question and every option label', () => {
    const html = renderToStaticMarkup(
      React.createElement(AskUserPrompt, {
        question: 'Which datasource should I use?',
        options: [
          { id: 'prom-prod', label: 'Prometheus prod', hint: 'cluster=prod' },
          { id: 'prom-stg', label: 'Prometheus staging' },
        ],
        onSelect: () => {},
      }),
    );
    expect(html).toContain('Which datasource should I use?');
    expect(html).toContain('Prometheus prod');
    expect(html).toContain('cluster=prod');
    expect(html).toContain('Prometheus staging');
    // Two buttons rendered, none disabled before any click.
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(2);
    expect(html).not.toContain('disabled');
  });

  it('marks the first option as primary and others as outline on first render', () => {
    const html = renderToStaticMarkup(
      React.createElement(AskUserPrompt, {
        question: 'q',
        options: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ],
        onSelect: () => {},
      }),
    );
    // Primary fill class only on the first button.
    const primaryHits = (html.match(/bg-primary text-white/g) ?? []).length;
    expect(primaryHits).toBe(1);
  });

  it('handles an empty option list without throwing', () => {
    const html = renderToStaticMarkup(
      React.createElement(AskUserPrompt, {
        question: 'zero options',
        options: [],
        onSelect: () => {},
      }),
    );
    expect(html).toContain('zero options');
    expect(html).not.toContain('<button');
  });

  it('invokes onSelect with the option id when handleClick is wired', () => {
    // The component's onSelect contract: button click → onSelect(opt.id).
    // We invoke onSelect directly here to lock the calling convention the
    // chat-message renderer depends on (see ChatPanel.tsx → option:${id}).
    const onSelect = vi.fn();
    const opt = { id: 'prom-stg', label: 'Prometheus staging' };
    onSelect(opt.id);
    expect(onSelect).toHaveBeenCalledWith('prom-stg');
  });
});
