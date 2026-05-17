import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Textarea } from './Textarea'

describe('Textarea', (): void => {
  it('renders a multi-line textarea with the aria-label', (): void => {
    render(
      <Textarea
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
      />,
    )
    const el = screen.getByLabelText('note source')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('defaults to 6 visible rows and accepts a rows override', (): void => {
    const { rerender } = render(
      <Textarea
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('note source')).toHaveAttribute('rows', '6')
    rerender(
      <Textarea
        aria-label="note source"
        value=""
        rows={3}
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('note source')).toHaveAttribute('rows', '3')
  })

  it('uses the monospace control class (token-driven, no raw colors)', (): void => {
    render(
      <Textarea
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('note source')).toHaveClass(
      'sta-textarea__control',
    )
  })

  it('reflects the controlled value', (): void => {
    render(
      <Textarea
        aria-label="note source"
        value={'line one\nline two'}
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('note source')).toHaveValue(
      'line one\nline two',
    )
  })

  it('invokes onChange with the new value while typing', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Textarea
        aria-label="note source"
        value=""
        onChange={onChange}
      />,
    )
    await user.type(screen.getByLabelText('note source'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('Tab inserts two spaces at the caret and does NOT move focus', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <Textarea
          aria-label="note source"
          value="ab"
          onChange={onChange}
        />
        <button type="button">after</button>
      </>,
    )
    const el = screen.getByLabelText<HTMLTextAreaElement>('note source')
    el.focus()
    el.setSelectionRange(1, 1)
    await user.keyboard('{Tab}')
    // Two spaces inserted at caret index 1: 'a' + '  ' + 'b'.
    expect(onChange).toHaveBeenCalledWith('a  b')
    // Focus stayed on the textarea (Tab did NOT move to the button).
    expect(el).toHaveFocus()
  })

  it('Tab replaces a selection with two spaces (caret collapses after them)', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Textarea
        aria-label="note source"
        value="abcd"
        onChange={onChange}
      />,
    )
    const el = screen.getByLabelText<HTMLTextAreaElement>('note source')
    el.focus()
    el.setSelectionRange(1, 3)
    await user.keyboard('{Tab}')
    expect(onChange).toHaveBeenCalledWith('a  d')
  })

  it('readOnly Textarea + onChange: Tab does NOT mutate value and moves focus natively', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <Textarea
          aria-label="note source"
          value="ab"
          onChange={onChange}
          readOnly
        />
        <button type="button">after</button>
      </>,
    )
    const el = screen.getByLabelText<HTMLTextAreaElement>('note source')
    el.focus()
    el.setSelectionRange(1, 1)
    await user.keyboard('{Tab}')
    // readOnly: the Tab-indent splice must NOT run even though onChange is set.
    expect(onChange).not.toHaveBeenCalled()
    // No preventDefault → native Tab moved focus off the textarea.
    expect(el).not.toHaveFocus()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })

  it('disabled Textarea + onChange: Tab does NOT mutate value', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Textarea
        aria-label="note source"
        value="ab"
        onChange={onChange}
        disabled
      />,
    )
    const el = screen.getByLabelText<HTMLTextAreaElement>('note source')
    expect(el).toBeDisabled()
    el.focus()
    el.setSelectionRange(1, 1)
    await user.keyboard('{Tab}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires onFocus and onBlur', async (): Promise<void> => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <Textarea
          aria-label="note source"
          value=""
          onChange={(): void => undefined}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <button type="button">after</button>
      </>,
    )
    await user.click(screen.getByLabelText('note source'))
    expect(onFocus).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'after' }))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('forwards a ref to the underlying textarea element', (): void => {
    const ref = createRef<HTMLTextAreaElement>()
    render(
      <Textarea
        ref={ref}
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('respects the disabled prop and ignores user typing', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Textarea
        aria-label="note source"
        value="frozen"
        onChange={onChange}
        disabled
      />,
    )
    const el = screen.getByLabelText('note source')
    expect(el).toBeDisabled()
    await user.type(el, 'x')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders a controlled value with no onChange handler (readOnly fallback parity with Input)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <Textarea
        aria-label="note source"
        value={'frozen\nvalue'}
        readOnly
      />,
    )
    const el = screen.getByLabelText<HTMLTextAreaElement>('note source')
    expect(el).toHaveValue('frozen\nvalue')
    expect(el).toHaveAttribute('readonly')
    // No onChange → the change handler is undefined and Tab interception is
    // a no-op (focus moves natively); typing cannot mutate the value.
    el.focus()
    el.setSelectionRange(0, 0)
    await user.keyboard('{Tab}')
    expect(el).toHaveValue('frozen\nvalue')
  })

  it('is axe-clean (default + disabled)', async (): Promise<void> => {
    const { container, rerender } = render(
      <Textarea
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Textarea
        aria-label="note source"
        value=""
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
